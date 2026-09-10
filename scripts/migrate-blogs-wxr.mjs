#!/usr/bin/env node
/**
 * migrate-blogs-wxr.mjs
 *
 * Idempotent importer that turns a WordPress WXR (XML) export of posts into
 * Strapi v5 entries on the `api::blog.blog` collection, projecting every body
 * onto the single dynamic-zone component `secciones.componente-15-acuario`.
 *
 * Behaviour:
 *   - Reads XML from --xml (or argv[2]) and parses it with `sax` (already
 *     available in frontend/node_modules — no extra install).
 *   - Builds an attachment_id -> { url, alt } map from <item post_type=attachment>
 *     so each post's _thumbnail_id can resolve to its featured image URL.
 *   - For each post: extracts title/slug/pubDate/creator/categories/excerpt/
 *     featured image, and parses the body HTML into Strapi v5 blocks
 *     (paragraph, heading 2/3, list ordered/unordered, quote, image,
 *     bold/italic/underline/link marks).
 *   - Splits the body: first 1-2 paragraphs -> descripcion_inicial; the rest
 *     is sliced by <h2> into bloques_contenido[], alternating disposicion
 *     (texto_izquierda / texto_derecha) when a bloque carries an image,
 *     otherwise 1_columna.
 *   - Uploads every referenced image to Strapi via POST /api/upload (FormData),
 *     caches results by source URL to avoid duplicate uploads, and resolves
 *     the resulting media ids for imagen_destacada / bloque.imagen.
 *   - Idempotency: queries /api/blogs?filters[slug][$eq]=slug first and PUTs
 *     if found, POSTs otherwise. Published state is forced via publishedAt.
 *   - Dry-run mode (default ON) skips the network entirely after parsing and
 *     prints per-post stats; pass --dry-run=false to actually upload.
 *
 * Usage:
 *   STRAPI_URL=http://localhost:1337 STRAPI_API_TOKEN=... \
 *   node frontend/scripts/migrate-blogs-wxr.mjs \
 *     --xml /path/to/export.xml --limit 2 --locale es
 */

import { readFile, mkdir, stat, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import sax from 'sax';

// =====================================================================================
// CLI / ENV
// =====================================================================================

function parseArgs(argv) {
  const args = {
    xml: null,
    limit: 1,
    locale: 'es',
    dryRun: true,
    verbose: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--xml') { args.xml = next; i++; }
    else if (a === '--limit') { args.limit = Number(next) || 1; i++; }
    else if (a === '--locale') { args.locale = next || 'es'; i++; }
    else if (a === '--dry-run') { args.dryRun = String(next) !== 'false'; i++; }
    else if (a === '--verbose' || a === '-v') { args.verbose = true; }
    else if (!args.xml && !a.startsWith('--')) { args.xml = a; }
  }
  if (!args.xml) args.xml = process.env.WXR_PATH || null;
  return args;
}

const ARGS = parseArgs(process.argv);
const DRY_RUN = ARGS.dryRun;
const STRAPI_URL = (process.env.STRAPI_URL || 'http://127.0.0.1:1337').replace(/\/+$/, '');
const STRAPI_API_TOKEN = process.env.STRAPI_API_TOKEN || '';
const LOCALE = ARGS.locale;
const LIMIT = ARGS.limit;
const XML_PATH = ARGS.xml;

if (!XML_PATH) {
  console.error('ERROR: --xml <path> (or WXR_PATH env) is required.');
  process.exit(2);
}

const SUMMARY = {
  totalPostsInXml: 0,
  processed: 0,
  created: 0,
  updated: 0,
  skipped: 0,
  failed: 0,
  fieldCoverage: { hero: 0, excerpt: 0, category: 0, date: 0 },
  items: [],
  failures: [],
};

// =====================================================================================
// XML PARSING (sax)
// =====================================================================================
//
// WXR uses namespaced tags like <wp:post_type>, <content:encoded>. sax requires
// strict mode to be off so we accept unknown prefixes; we read them via the
// `name` field, which sax returns in Clark notation (e.g. "{ns}post_type").

const NS = {
  // Local namespace prefixes (the part before the colon in tag names like
  // `content:encoded` or `wp:post_id`). These are NOT the full namespace URIs;
  // sax returns tag names as `prefix:LocalName` in loose mode.
  content: 'content',
  excerpt: 'excerpt',
  dc: 'dc',
  wp: 'wp',
};

const localName = (raw) => {
  // sax (loose mode) uppercases tag/attribute names by default, so always
  // normalize to lowercase. Strip the namespace prefix either as Clark notation
  // (`{ns}name`) or as a colon-qualified name (`ns:name`).
  const clark = /^\{([^}]+)\}(.+)$/.exec(raw);
  if (clark) return clark[2].toLowerCase();
  const colon = /^([a-zA-Z][a-zA-Z0-9_-]*):(.+)$/.exec(raw);
  if (colon) return colon[2].toLowerCase();
  return raw.toLowerCase();
};
const nsPrefix = (raw) => {
  const clark = /^\{([^}]+)\}(.+)$/.exec(raw);
  if (clark) return clark[1].toLowerCase();
  const colon = /^([a-zA-Z][a-zA-Z0-9_-]*):(.+)$/.exec(raw);
  if (colon) return colon[1].toLowerCase();
  return '';
};

// Leaf fields we capture as plain text inside <item>. Note: <encoded> appears
// under two namespaces (content: and excerpt:) — we resolve those specially
// inside onopentag via the namespace.
const leafFields = new Set([
  'title', 'link', 'pubdate', 'guid', 'description', 'creator',
  'post_id', 'post_date', 'post_date_gmt',
  'post_name', 'status', 'post_type', 'post_parent',
]);

/** Parse the WXR into a normalized in-memory structure. */
async function parseWXR(filePath) {
  const xml = await readFile(filePath, 'utf8');
  // sax callback-based parser; loose mode (strict=false) tolerates unknown
  // entities / namespaces. We use the low-level .parser() API so we can write
  // a full string buffer and get an explicit 'end' signal.
  const parser = sax.parser(false, { trim: false, normalize: false, lowercase: false });

  const posts = [];
  const attachments = []; // { id, url, alt }

  let curItem = null;        // current <item> being built
  let curField = null;       // current leaf tag name we are capturing text for
  let curAttrs = null;       // attributes of the current leaf tag
  let charBuf = '';          // text accumulator for the current field
  let categoryDomain = null; // category attribute 'domain' (e.g. category)

  parser.onopentag = (node) => {
    const ns = nsPrefix(node.name);
    const name = localName(node.name);

    if (name === 'item') {
      curItem = { categories: [], postmetas: [] };
      return;
    }
    if (!curItem) return; // ignore channel-level tags (title, link, etc.)

    if (name === 'category') {
      categoryDomain = node.attributes.domain || null;
      curAttrs = node.attributes || {};
      charBuf = '';
      curField = 'category';
      return;
    }

    if (name === 'postmeta') {
      curField = '__postmeta';
      charBuf = '';
      return;
    }

    if (name === 'meta_key' || name === 'meta_value') {
      curField = name === 'meta_key' ? '__meta_key' : '__meta_value';
      charBuf = '';
      return;
    }

    if (name === 'attachment_url') {
      curField = 'attachment_url';
      charBuf = '';
      return;
    }

    // Namespace-aware field resolution: content:encoded and excerpt:encoded
    // both have localName 'encoded' but must map to different fields.
    let resolved = null;
    if (name === 'encoded' && ns === NS.content) resolved = 'content_encoded';
    else if (name === 'encoded' && ns === NS.excerpt) resolved = 'excerpt';
    else if (leafFields.has(name)) resolved = name;

    if (resolved) {
      curField = resolved;
      curAttrs = node.attributes || {};
      charBuf = '';
    }
  };

  parser.ontext = (text) => { if (curField) charBuf += text; };
  parser.oncdata = (text) => { if (curField) charBuf += text; };
  parser.onentityref = (ref) => { if (curField) charBuf += saxEntities(ref); };

  parser.onclosetag = (rawName) => {
    const name = localName(rawName);
    if (!curItem) return;

    if (name === 'category' && curField === 'category') {
      curItem.categories.push({
        domain: categoryDomain,
        nicename: curAttrs?.nicename || null,
        label: charBuf.trim(),
      });
      curField = null; charBuf = ''; categoryDomain = null;
      return;
    }

    if (name === 'postmeta') {
      curField = null;
      return;
    }
    if (name === 'meta_key') {
      curItem.__lastMetaKey = charBuf.trim();
      curField = null; charBuf = '';
      return;
    }
    if (name === 'meta_value') {
      curItem.postmetas.push({ key: curItem.__lastMetaKey, value: charBuf.trim() });
      curItem.__lastMetaKey = null;
      curField = null; charBuf = '';
      return;
    }

    if (name === 'attachment_url') {
      curItem.attachment_url = charBuf.trim();
      curField = null; charBuf = '';
      return;
    }

    // Closing a leaf
    if (curField &&
        curField !== '__postmeta' &&
        curField !== '__meta_key' &&
        curField !== '__meta_value' &&
        curField !== 'category' &&
        curField !== 'attachment_url') {
      curItem[curField] = charBuf.trim();
      curField = null; charBuf = '';
    }

    if (name === 'item') {
      finalizeItem(curItem, posts, attachments);
      curItem = null;
    }
  };

  parser.onerror = () => {
    // Recover from recoverable errors (loose mode only)
    parser.error = null;
    parser.resume();
  };

  await new Promise((resolve, reject) => {
    parser.onend = resolve;
    try {
      parser.write(xml).close();
    } catch (err) {
      reject(err);
    }
  });

  return { posts, attachments };
}

function saxEntities(ref) {
  const map = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  return map[ref] || `&${ref};`;
}

function finalizeItem(item, posts, attachments) {
  if (item.post_type === 'attachment') {
    if (item.post_id && item.attachment_url) {
      attachments.push({
        id: item.post_id,
        url: item.attachment_url,
        alt: item.title || '',
        parent: item.post_parent || null,
      });
    }
    return;
  }
  if (item.post_type !== 'post') return;

  // Resolve meta values into a flat record
  const meta = {};
  for (const m of item.postmetas) meta[m.key] = m.value;

  const slug = slugFromPostName(item.post_name) || slugFromLink(item.link);

  posts.push({
    wp_post_id: item.post_id,
    title: item.title || '',
    slug,
    link: item.link || '',
    pubDate: item.post_date_gmt || item.post_date || null,
    creator: item.creator || '',
    categories: (item.categories || [])
      .filter((c) => c.domain === 'category' || !c.domain)
      .map((c) => c.label)
      .filter(Boolean),
    excerpt: item.excerpt || '',
    contentHtml: item.content_encoded || '',
    thumbnailId: meta._thumbnail_id || null,
    status: item.status || 'publish',
  });
}

function slugFromPostName(name) {
  if (!name) return null;
  return name.replace(/^\/+|\/+$/g, '');
}
function slugFromLink(link) {
  if (!link) return null;
  try {
    const u = new URL(link);
    const parts = u.pathname.split('/').filter(Boolean);
    // strip YYYY/MM/DD prefix if present
    while (parts.length >= 3 &&
           /^\d{4}$/.test(parts[0]) &&
           /^\d{2}$/.test(parts[1]) &&
           /^\d{2}$/.test(parts[2])) {
      parts.shift(); parts.shift(); parts.shift();
    }
    return parts.join('/').replace(/^\/+|\/+$/g, '') || null;
  } catch { return null; }
}

// =====================================================================================
// HTML -> STRAPI BLOCKS (small, dependency-free walker)
// =====================================================================================
//
// We only need to handle the HTML subset that WordPress content actually emits
// here: <p>, <h2>-<h4>, <ul>/<ol>/<li>, <blockquote>, <img>, <a>, <strong>, <em>,
// <u>, <s>, <code>, <br>. Anything else is dropped. Comments (<!-- wp:* -->) and
// stray elementor metadata are stripped as text nodes.

function stripWordPressComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '');
}

function decodeEntities(s) {
  if (!s) return s;
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'");
}

/** Tokenize HTML into tag-open, tag-close, self-closing, and text tokens. */
function tokenizeHtml(html) {
  const tokens = [];
  const re = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9]*)([^>]*?)\/?>|([^<]+)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[0].startsWith('<!--')) continue; // comment dropped
    if (m[0].startsWith('<')) {
      const isClose = m[0].startsWith('</');
      const isSelfClose = m[0].endsWith('/>') && !isClose;
      const tag = (m[1] || '').toLowerCase();
      const attrsRaw = m[2] || '';
      const attrs = parseAttrs(attrsRaw);
      tokens.push({ kind: isClose ? 'close' : 'open', tag, attrs, selfClose: isSelfClose });
    } else {
      const text = decodeEntities(m[3]);
      if (text.length) tokens.push({ kind: 'text', text });
    }
  }
  return tokens;
}

function parseAttrs(s) {
  const attrs = {};
  const re = /([a-zA-Z_:][a-zA-Z0-9_:\-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return attrs;
}

/**
 * Convert the cleaned HTML body into a flat list of top-level nodes. Each node
 * is either:
 *   { kind: 'p'|'h2'|'h3'|'h4'|'quote', blocks: StrapiBlock[] }
 *   { kind: 'list', ordered: bool, blocks: StrapiBlock[] (list of list-items) }
 *   { kind: 'image', src, alt }
 *   { kind: 'raw_html', html }  (anything we couldn't classify)
 */
function htmlToNodes(html) {
  const cleaned = stripWordPressComments(html).replace(/\r/g, '');
  const tokens = tokenizeHtml(cleaned);
  const nodes = [];
  const stack = []; // active container stack: { tag, nodes, listItem? }
  let current = null; // current top-level node being built
  let pendingList = null; // current ul/ol at top level

  const openContainer = (tag, attrs) => {
    if (tag === 'ul' || tag === 'ol') {
      pendingList = { kind: 'list', ordered: tag === 'ol', items: [], attrs };
      nodes.push(pendingList);
      stack.push({ tag, listNode: pendingList, mode: 'list' });
      return;
    }
    if (tag === 'li') {
      const parent = stack[stack.length - 1];
      if (parent && parent.mode === 'list') {
        const item = { kind: 'listitem', children: [] };
        parent.listNode.items.push(item);
        stack.push({ tag, listItem: item, mode: 'listitem' });
        return;
      }
    }
    if (tag === 'p') { current = { kind: 'p', children: [] }; nodes.push(current); stack.push({ tag, mode: 'paragraph' }); return; }
    if (/^h[1-6]$/.test(tag)) { current = { kind: tag, children: [] }; nodes.push(current); stack.push({ tag, mode: 'paragraph' }); return; }
    if (tag === 'blockquote') { current = { kind: 'quote', children: [] }; nodes.push(current); stack.push({ tag, mode: 'paragraph' }); return; }
    if (tag === 'img') {
      nodes.push({ kind: 'image', src: attrs.src || '', alt: attrs.alt || '' });
      return;
    }
    // unknown container — push a raw_html bucket so we can preserve it
    if (tag === 'div' || tag === 'span' || tag === 'figure' || tag === 'figcaption' || tag === 'iframe' || tag === 'a') {
      stack.push({ tag, mode: 'inline', inlineParent: true });
      return;
    }
  };

  const closeContainer = (tag) => {
    // Pop until we find matching
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].tag === tag) {
        // close any open paragraph inside this container
        stack.splice(i, 1);
        if (stack.length === 0) current = null;
        else {
          const top = stack[stack.length - 1];
          if (top.mode === 'listitem' || top.mode === 'list' || top.mode === 'paragraph' || top.mode === 'inline') {
            // leave current null; nothing to do
          }
        }
        return;
      }
    }
  };

  for (const tok of tokens) {
    if (tok.kind === 'open') {
      if (tok.selfClose) {
        if (tok.tag === 'img') {
          nodes.push({ kind: 'image', src: tok.attrs.src || '', alt: tok.attrs.alt || '' });
        } else if (tok.tag === 'br') {
          // br inside an inline container: ignore at top level, handled as inline mark
        }
        continue;
      }
      // inline open tags inside a container: push marks into children
      if (current && (tok.tag === 'strong' || tok.tag === 'b')) { stack.push({ tag: tok.tag, mode: 'mark', marks: { bold: true } }); continue; }
      if (current && (tok.tag === 'em' || tok.tag === 'i')) { stack.push({ tag: tok.tag, mode: 'mark', marks: { italic: true } }); continue; }
      if (current && tok.tag === 'u') { stack.push({ tag: tok.tag, mode: 'mark', marks: { underline: true } }); continue; }
      if (current && tok.tag === 's' || tok.tag === 'strike' || tok.tag === 'del') { stack.push({ tag: tok.tag, mode: 'mark', marks: { strikethrough: true } }); continue; }
      if (current && tok.tag === 'code') { stack.push({ tag: tok.tag, mode: 'mark', marks: { code: true } }); continue; }
      if (current && tok.tag === 'br') { pushInlineText(current, '\n', stack); continue; }
      if (current && tok.tag === 'a') { stack.push({ tag: tok.tag, mode: 'link', href: tok.attrs.href || '#' }); continue; }
      openContainer(tok.tag, tok.attrs);
    } else if (tok.kind === 'close') {
      // pop mark/link containers
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === tok.tag) { stack.splice(i, 1); break; }
      }
      if (tok.tag === 'p' || tok.tag === 'blockquote' || /^h[1-6]$/.test(tok.tag)) {
        current = null;
      }
      if (tok.tag === 'ul' || tok.tag === 'ol') pendingList = null;
    } else if (tok.kind === 'text') {
      if (current && current.children) pushInlineText(current, tok.text, stack);
      else if (pendingList) {
        // text directly in ul/ol (no li) — synthesize an item
        const item = { kind: 'listitem', children: [] };
        pendingList.items.push(item);
        pushInlineText(item, tok.text, stack);
      }
    }
  }

  return nodes.filter((n) => {
    if (n.kind === 'list') return n.items.length > 0;
    if (n.kind === 'p' || n.kind === 'quote' || /^h[1-6]$/.test(n.kind)) {
      return (n.children || []).length > 0 && n.children.some((c) => c.text && c.text.trim().length);
    }
    return true;
  });
}

function activeMarks(stack) {
  const marks = {};
  let link = null;
  for (const s of stack) {
    if (s.mode === 'mark' && s.marks) Object.assign(marks, s.marks);
    if (s.mode === 'link') link = s.href;
  }
  return { marks, link };
}

function pushInlineText(target, rawText, stack) {
  if (!rawText) return;
  // Split on newlines for <br>
  const segments = rawText.split(/\n+/);
  for (let i = 0; i < segments.length; i++) {
    const piece = segments[i];
    if (piece.length === 0 && i === 0 && rawText.startsWith('\n')) {
      // leading break — keep as a newline text node only if mid-paragraph
    }
    if (i > 0) {
      target.children.push({ type: 'text', text: '\n' });
    }
    if (!piece) continue;
    const { marks, link } = activeMarks(stack);
    const child = { type: 'text', text: piece, ...marks };
    if (link) {
      target.children.push({ type: 'link', url: link, children: [child] });
    } else {
      target.children.push(child);
    }
  }
}

/** Convert a node-list into a flat list of Strapi blocks. */
function nodesToBlocks(nodes) {
  const blocks = [];
  for (const n of nodes) {
    if (n.kind === 'p' || /^h[1-6]$/.test(n.kind) || n.kind === 'quote') {
      if (!n.children.length) continue;
      const cleanChildren = normalizeInline(n.children);
      if (!cleanChildren.length) continue;
      if (n.kind === 'p') blocks.push({ type: 'paragraph', children: cleanChildren });
      else if (n.kind === 'quote') blocks.push({ type: 'quote', children: cleanChildren });
      else {
        const level = Math.min(6, Math.max(2, Number(n.kind.slice(1))));
        blocks.push({ type: 'heading', level, children: cleanChildren });
      }
    } else if (n.kind === 'list') {
      if (!n.items.length) continue;
      const listChildren = n.items
        .map((it) => normalizeInline(it.children))
        .filter((c) => c.length > 0)
        .map((c) => ({ type: 'list-item', children: c }));
      if (listChildren.length) {
        blocks.push({ type: 'list', format: n.ordered ? 'ordered' : 'unordered', children: listChildren });
      }
    } else if (n.kind === 'image') {
      if (!n.src) continue;
      const nowIso = new Date().toISOString();
      if (n.media && n.media.id != null) {
        // Strapi v5 blocks image requires the full media shape AND a top-level
        // `children: []` on the block. Reference the uploaded asset via id.
        const m = n.media;
        blocks.push({
          type: 'image',
          children: [],
          image: {
            id: m.id,
            name: m.name || basename(n.src) || 'image',
            alternativeText: m.alternativeText || n.alt || '',
            caption: m.caption || null,
            url: m.url || n.src,
            ext: m.ext || (extFromUrl(n.src) || '.jpg').replace('.', ''),
            mime: m.mime || mimeFromExt(extFromUrl(n.src) || '.jpg'),
            hash: m.hash || '',
            size: m.size != null ? m.size : 0,
            width: m.width != null ? m.width : 0,
            height: m.height != null ? m.height : 0,
            provider: m.provider || 'local',
            formats: m.formats || {},
            createdAt: m.createdAt || nowIso,
            updatedAt: m.updatedAt || nowIso,
          },
        });
      } else {
        // Upload failed or skipped — Strapi would still accept this shape and
        // create a media entry from the data. Avoids breaking the post.
        const baseMedia = inlineMediaFromUrl(n.src, n.alt || '');
        blocks.push({
          type: 'image',
          children: [],
          image: { ...baseMedia, provider: 'local', hash: '', size: 0, width: 0, height: 0, formats: {}, createdAt: nowIso, updatedAt: nowIso },
        });
      }
    }
  }
  return blocks;
}

function normalizeInline(children) {
  const out = [];
  for (const c of children || []) {
    if (c.type === 'link') {
      const linkChildren = normalizeInline(c.children || []);
      if (linkChildren.length === 0) continue;
      out.push({ type: 'link', url: c.url || '#', children: linkChildren });
    } else if (c.type === 'text') {
      if (!c.text) continue;
      const { type, ...rest } = c;
      out.push({ type: 'text', text: rest.text, ...stripMarks(rest) });
    }
  }
  // Merge adjacent text nodes with identical marks
  const merged = [];
  for (const node of out) {
    const last = merged[merged.length - 1];
    if (last && last.type === 'text' && node.type === 'text' &&
        JSON.stringify(stripMarks(last)) === JSON.stringify(stripMarks(node))) {
      last.text += node.text;
    } else {
      merged.push(node);
    }
  }
  return merged;
}

function stripMarks(o) {
  const { type: _t, text: _x, ...m } = o;
  return m;
}

// =====================================================================================
// BODY SPLITTING (descripcion_inicial + bloques_contenido)
// =====================================================================================

function extractPlainText(blocks) {
  const parts = [];
  for (const b of blocks || []) {
    if (b.type === 'paragraph' || b.type === 'heading' || b.type === 'quote' || b.type === 'list') {
      parts.push(blocksToInlineText(b));
    }
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function blocksToInlineText(block) {
  if (!block || !block.children) return '';
  const out = [];
  for (const c of block.children) {
    if (c.type === 'text') out.push(c.text || '');
    else if (c.type === 'link') out.push(blocksToInlineText(c));
    else if (c.type === 'list-item') out.push(blocksToInlineText(c));
  }
  return out.join('');
}

function splitBody(nodes) {
  // First 1-2 paragraphs -> descripcion_inicial
  const introBlocks = [];
  let i = 0;
  while (i < nodes.length && introBlocks.length < 2) {
    const n = nodes[i];
    if (n.kind === 'p') {
      const blks = nodesToBlocks([n]);
      if (blks.length) introBlocks.push(blks[0]);
      i++;
    } else break;
  }

  // Remaining nodes sliced by h2
  const tail = nodes.slice(i);
  const bloques = [];
  let cur = null;
  const flush = () => {
    if (!cur) return;
    const descBlocks = nodesToBlocks(cur.nodes);
    if (descBlocks.length || cur.imagen) bloques.push(cur);
  };

  for (const n of tail) {
    if (n.kind === 'h2') {
      flush();
      cur = { titulo: extractText(n) || '', descripcion: [], imagen: null, _alternationIndex: 0, nodes: [] };
    } else if (cur) {
      if (n.kind === 'image' && !cur.imagen) {
        cur.imagen = { src: n.src, alt: n.alt || '', media: n.media || null };
      } else {
        cur.nodes.push(n);
      }
    }
  }
  flush();

  // Assign disposicion: alternating when image present, otherwise 1_columna
  let altIdx = 0;
  for (const b of bloques) {
    if (b.imagen) {
      b.disposicion = altIdx % 2 === 0 ? 'texto_izquierda' : 'texto_derecha';
      altIdx++;
    } else {
      b.disposicion = '1_columna';
    }
  }

  return { introBlocks, bloques };
}

function extractText(node) {
  if (!node || !node.children) return '';
  return node.children.map((c) => c.type === 'text' ? c.text : '').join('').trim();
}

// =====================================================================================
// IMAGE UPLOAD (download -> tmp -> POST /api/upload -> media id cache)
// =====================================================================================

// Cache holds the full Strapi media object (id + name + url + ext + mime + size + ...)
// keyed by source URL, so we can:
//   - reuse the same media id on idempotent re-runs
//   - inline-image blocks can carry the full {id, name, url, ...} shape required
//     by Strapi v5's blocks validator (it rejects {url, alternativeText} alone
//     with "image.name missing").
const imageCache = new Map(); // sourceUrl -> media object | null

const MIME_BY_EXT = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml',
  avif: 'image/avif',
};

function mimeFromExt(ext) {
  const e = String(ext || '').toLowerCase().replace(/^\./, '');
  return MIME_BY_EXT[e] || 'image/jpeg';
}

function extFromUrl(src) {
  try { return (extname(new URL(src).pathname) || '.jpg').toLowerCase(); }
  catch { return '.jpg'; }
}

/** Build a Strapi v5 media-shaped object from a source URL alone (no upload). */
function inlineMediaFromUrl(src, alt = '') {
  const name = basename(src || '') || 'image';
  const ext = (extname(name) || '.jpg').replace('.', '');
  return {
    id: null,
    name,
    alternativeText: alt,
    url: src,
    ext,
    mime: mimeFromExt(ext),
  };
}

async function uploadImage(src, label) {
  if (!src) return null;
  if (imageCache.has(src)) return imageCache.get(src);

  if (DRY_RUN) {
    // Simulate upload: build a fake deterministic media object so the rest of
    // the pipeline can exercise the new shape.
    const fakeId = 1000 + Math.abs(hashCode(src));
    const nowIso = new Date().toISOString();
    const fakeMedia = {
      id: fakeId,
      ...inlineMediaFromUrl(src),
      caption: null,
      provider: 'local',
      hash: 'dryrunhash',
      size: 0,
      width: 0,
      height: 0,
      formats: {},
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    imageCache.set(src, fakeMedia);
    console.log(`  [dry-run] would upload image ${label || ''} ${src} -> media id ${fakeId}`);
    return fakeMedia;
  }

  if (!STRAPI_API_TOKEN) {
    throw new Error('STRAPI_API_TOKEN is required for image upload');
  }

  const workdir = await ensureTmpDir();
  const ext = extFromUrl(src);
  const fileName = `${createHash('sha1').update(src).digest('hex').slice(0, 16)}${ext}`;
  const localPath = join(workdir, fileName);

  try {
    await downloadTo(src, localPath);
  } catch (err) {
    console.warn(`  WARN: failed to download image ${src}: ${err.message}`);
    imageCache.set(src, null);
    return null;
  }

  const fd = new FormData();
  const buf = await readFile(localPath);
  const mime = mimeFromExt(ext);
  const blob = new Blob([buf], { type: mime });
  fd.append('files', blob, fileName);

  const uploadRes = await fetch(`${STRAPI_URL}/api/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${STRAPI_API_TOKEN}` },
    body: fd,
  });
  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`upload failed (${uploadRes.status}): ${errText.slice(0, 200)}`);
  }
  const arr = await uploadRes.json();
  const media = Array.isArray(arr) ? arr[0] : null;
  if (!media?.id) throw new Error('upload returned no id');

  // Backfill fields Strapi may omit on upload response.
  const nowIso = new Date().toISOString();
  const fullMedia = {
    id: media.id,
    name: media.name || fileName,
    alternativeText: media.alternativeText || '',
    caption: media.caption || null,
    url: media.url || `/uploads/${fileName}`,
    ext: (media.ext || ext).replace(/^\./, ''),
    mime: media.mime || mime,
    hash: media.hash || '',
    size: media.size != null ? media.size : buf.length,
    width: media.width != null ? media.width : 0,
    height: media.height != null ? media.height : 0,
    provider: media.provider || 'local',
    formats: media.formats || {},
    createdAt: media.createdAt || nowIso,
    updatedAt: media.updatedAt || nowIso,
  };
  imageCache.set(src, fullMedia);
  await safeUnlink(localPath);
  return fullMedia;
}

async function ensureTmpDir() {
  const dir = join(tmpdir(), 'wxr-blogs-migration');
  await mkdir(dir, { recursive: true });
  return dir;
}

async function downloadTo(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ws = createWriteStream(dest);
  await pipeline(res.body, ws);
}

async function safeUnlink(p) {
  try { await unlink(p); } catch { /* ignore */ }
}

function hashCode(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h;
}

// =====================================================================================
// STRAPI API (GET blog by slug, POST, PUT)
// =====================================================================================

async function strapiFetch(path, opts = {}) {
  const url = `${STRAPI_URL}${path}`;
  const headers = { ...(opts.headers || {}) };
  if (STRAPI_API_TOKEN) headers.Authorization = `Bearer ${STRAPI_API_TOKEN}`;
  if (opts.json !== false && opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(url, { ...opts, headers });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
  if (!res.ok) {
    const err = new Error(`Strapi ${opts.method || 'GET'} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
    err.status = res.status;
    err.body = json || text;
    throw err;
  }
  return json;
}

async function findBlogBySlug(slug, locale) {
  const res = await strapiFetch(
    `/api/blogs?filters[slug][$eq]=${encodeURIComponent(slug)}&locale=${encodeURIComponent(locale)}&publicationState=preview&pagination[pageSize]=1`,
    { method: 'GET' },
  );
  return Array.isArray(res?.data) && res.data.length ? res.data[0] : null;
}

async function createBlog(payload, locale) {
  return strapiFetch(`/api/blogs?locale=${encodeURIComponent(locale)}&publicationState=preview`, {
    method: 'POST',
    body: payload,
  });
}

async function updateBlog(existing, payload, locale) {
  // Strapi v5 routes are bound to documentId (string); numeric ids return 404.
  // Fall back to numeric id only when documentId is missing (legacy data).
  const target = existing?.documentId || existing?.id;
  if (target == null) throw new Error('updateBlog: missing documentId/id on existing record');
  return strapiFetch(`/api/blogs/${target}?locale=${encodeURIComponent(locale)}&publicationState=preview`, {
    method: 'PUT',
    body: payload,
  });
}

// =====================================================================================
// MAIN: transform post -> Strapi payload -> POST/PUT
// =====================================================================================

async function transformPost(post, attachmentMap) {
  // Resolve hero image (via attachment map -> url -> upload)
  let heroMedia = null;
  if (post.thumbnailId && attachmentMap.has(post.thumbnailId)) {
    const att = attachmentMap.get(post.thumbnailId);
    heroMedia = await uploadImage(att.url, `hero for "${post.slug}"`);
  } else if (post.thumbnailId) {
    console.warn(`  WARN: thumbnail id ${post.thumbnailId} has no matching attachment for "${post.slug}"`);
  }

  // Parse the body into top-level nodes, then upload every inline image
  // upfront so each `<img>` becomes a Strapi media entry. We attach the
  // resolved media object onto each image node so the downstream
  // nodesToBlocks/splitBody paths can carry it into the payload.
  const nodes = htmlToNodes(post.contentHtml);
  const inlineImages = nodes.filter((n) => n.kind === 'image' && n.src);
  await Promise.all(inlineImages.map(async (n) => {
    n.media = await uploadImage(n.src, `inline in "${post.slug}"`);
  }));

  const { introBlocks, bloques } = splitBody(nodes);

  // Pick first non-empty category label
  const category = post.categories[0] || '';

  // Default brand colors for the Acuario theme (in case setup-site colors aren't applied at render)
  const component15 = {
    __component: 'secciones.componente-15-acuario',
    color_fondo: '#FFFFFF',
    titulo_principal: post.title,
    subtitulo: '',
    etiqueta_texto: category || 'Blog',
    etiqueta_color: '#003F7F',
    descripcion_inicial: introBlocks,
    imagen_principal: heroMedia?.id ?? null,
    bloques_contenido: bloques.map((b) => ({
      disposicion: b.disposicion,
      titulo: b.titulo || '',
      descripcion: nodesToBlocks(b.nodes),
      imagen: b.imagen?.media?.id ?? null,
    })),
  };

  return {
    data: {
      titulo: post.title,
      slug: post.slug,
      resumen: post.excerpt ? stripHtml(post.excerpt) : extractPlainText(introBlocks).slice(0, 280),
      categoria: category,
      autor: post.creator || '',
      fecha_publicacion: post.pubDate ? toIsoDate(post.pubDate) : new Date().toISOString(),
      imagen_destacada: heroMedia?.id ?? null,
      ContenidoPagina: [component15],
      publishedAt: new Date().toISOString(),
      locale: LOCALE,
    },
  };
}

function stripHtml(s) {
  return (s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function toIsoDate(s) {
  // WordPress gives us 'YYYY-MM-DD HH:MM:SS' or RFC 822; try both
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.replace(' ', 'T') + 'Z';
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString();
  return new Date().toISOString();
}

async function processPost(post, attachmentMap) {
  if (!post.slug) {
    SUMMARY.skipped++;
    SUMMARY.failures.push({ slug: null, reason: 'empty slug after link/post_name strip', title: post.title });
    console.log(`  SKIP: empty slug for "${post.title}"`);
    return;
  }
  if (post.status && post.status !== 'publish') {
    SUMMARY.skipped++;
    SUMMARY.failures.push({ slug: post.slug, reason: `status=${post.status}`, title: post.title });
    console.log(`  SKIP: status=${post.status} for "${post.title}" (slug=${post.slug})`);
    return;
  }

  SUMMARY.fieldCoverage.hero += post.thumbnailId && attachmentMap.has(post.thumbnailId) ? 1 : 0;
  SUMMARY.fieldCoverage.excerpt += post.excerpt ? 1 : 0;
  SUMMARY.fieldCoverage.category += post.categories.length ? 1 : 0;
  SUMMARY.fieldCoverage.date += post.pubDate ? 1 : 0;

  const payload = await transformPost(post, attachmentMap);

  if (DRY_RUN) {
    const stats = summarizePayload(payload);
    SUMMARY.processed++;
    SUMMARY.created++;
    SUMMARY.items.push({ slug: post.slug, title: post.title, action: 'would-create', ...stats });
    console.log(`  DRY: would create slug=${post.slug}  hero=${stats.hero} bloques=${stats.bloques} introBlocks=${stats.introBlocks}`);
    if (ARGS.verbose) {
      const c = payload.data.ContenidoPagina[0];
      console.log(`    titulo_principal: ${c.titulo_principal}`);
      console.log(`    subtitulo:       ${c.subtitulo || '(none)'}`);
      console.log(`    etiqueta_texto:  ${c.etiqueta_texto}`);
      console.log(`    resumen:         ${(payload.data.resumen || '').slice(0, 120)}${(payload.data.resumen || '').length > 120 ? '…' : ''}`);
      console.log(`    categoria:       ${payload.data.categoria}`);
      console.log(`    autor:           ${payload.data.autor}`);
      console.log(`    fecha:           ${payload.data.fecha_publicacion}`);
      console.log(`    descripcion_inicial (${c.descripcion_inicial.length} blocks):`);
      for (const b of c.descripcion_inicial) console.log(`      - ${b.type}${b.level ? ' ' + b.level : ''}: ${blocksToInlineText(b).slice(0, 100)}`);
      console.log(`    bloques_contenido (${c.bloques_contenido.length} items):`);
      for (const b of c.bloques_contenido) {
        console.log(`      - titulo="${b.titulo}" disposicion=${b.disposicion} descripcion_blocks=${b.descripcion.length} imagen=${b.imagen ? 'yes' : 'no'}`);
        for (const d of b.descripcion) console.log(`          * ${d.type}${d.level ? ' ' + d.level : ''}: ${blocksToInlineText(d).slice(0, 100)}`);
      }
    }
    return;
  }

  let existing = null;
  try {
    existing = await findBlogBySlug(post.slug, LOCALE);
  } catch (err) {
    SUMMARY.failed++;
    SUMMARY.failures.push({ slug: post.slug, reason: `find: ${err.message}` });
    console.error(`  FAIL: lookup ${post.slug}: ${err.message}`);
    return;
  }

  try {
    if (existing && (existing.id != null || existing.documentId)) {
      await updateBlog(existing, payload, LOCALE);
      SUMMARY.updated++;
      SUMMARY.items.push({ slug: post.slug, title: post.title, action: 'updated', id: existing.id, documentId: existing.documentId });
      console.log(`  UPDATED slug=${post.slug} id=${existing.id} documentId=${existing.documentId}`);
    } else {
      const created = await createBlog(payload, LOCALE);
      const id = created?.data?.id;
      SUMMARY.created++;
      SUMMARY.items.push({ slug: post.slug, title: post.title, action: 'created', id });
      console.log(`  CREATED slug=${post.slug} id=${id}`);
    }
    SUMMARY.processed++;
  } catch (err) {
    SUMMARY.failed++;
    SUMMARY.failures.push({ slug: post.slug, reason: `${existing ? 'PUT' : 'POST'}: ${err.message}` });
    console.error(`  FAIL: ${existing ? 'PUT' : 'POST'} ${post.slug}: ${err.message}`);
  }
}

function summarizePayload(payload) {
  const c = payload?.data?.ContenidoPagina?.[0];
  return {
    hero: payload.data.imagen_destacada ? 1 : 0,
    introBlocks: Array.isArray(c?.descripcion_inicial) ? c.descripcion_inicial.length : 0,
    bloques: Array.isArray(c?.bloques_contenido) ? c.bloques_contenido.length : 0,
    bloquesWithImage: (c?.bloques_contenido || []).filter((b) => b.imagen).length,
    bloquesWithText: (c?.bloques_contenido || []).filter((b) => b.descripcion && b.descripcion.length).length,
    categoria: payload.data.categoria || '',
    autor: payload.data.autor || '',
  };
}

// =====================================================================================
// ENTRYPOINT
// =====================================================================================

async function main() {
  console.log('====================================================================');
  console.log('WXR -> Strapi (componente-15-acuario) migration');
  console.log('====================================================================');
  console.log(`  xml        : ${XML_PATH}`);
  console.log(`  locale     : ${LOCALE}`);
  console.log(`  limit      : ${LIMIT}`);
  console.log(`  dry-run    : ${DRY_RUN}`);
  console.log(`  strapi url : ${DRY_RUN ? '(skipped — dry-run)' : STRAPI_URL}`);
  console.log(`  token      : ${DRY_RUN || !STRAPI_API_TOKEN ? '(skipped / unset)' : '***set***'}`);

  let exists = false;
  try { const st = await stat(XML_PATH); exists = st.isFile(); } catch {}
  if (!exists) {
    console.error(`ERROR: xml file not found: ${XML_PATH}`);
    process.exit(2);
  }

  const { posts, attachments } = await parseWXR(XML_PATH);
  const attachmentMap = new Map(attachments.map((a) => [a.id, a]));
  SUMMARY.totalPostsInXml = posts.length;

  console.log(`\nParsed ${posts.length} posts, ${attachments.length} attachments.`);
  console.log(`Coverage (raw):`);
  const withHero = posts.filter((p) => p.thumbnailId && attachmentMap.has(p.thumbnailId)).length;
  const withExcerpt = posts.filter((p) => p.excerpt).length;
  const withCategory = posts.filter((p) => p.categories.length).length;
  const withDate = posts.filter((p) => p.pubDate).length;
  console.log(`  hero       : ${withHero}/${posts.length} (${pct(withHero, posts.length)}%)`);
  console.log(`  excerpt    : ${withExcerpt}/${posts.length} (${pct(withExcerpt, posts.length)}%)`);
  console.log(`  category   : ${withCategory}/${posts.length} (${pct(withCategory, posts.length)}%)`);
  console.log(`  date       : ${withDate}/${posts.length} (${pct(withDate, posts.length)}%)`);

  const slice = posts.slice(0, LIMIT);
  console.log(`\nProcessing first ${slice.length} post(s)${DRY_RUN ? ' (dry-run — no network)' : ''}...\n`);

  for (const post of slice) {
    console.log(`- ${post.title}  [slug=${post.slug}]`);
    await processPost(post, attachmentMap);
  }

  console.log('\n====================================================================');
  console.log('SUMMARY');
  console.log('====================================================================');
  console.log(`  posts in XML       : ${SUMMARY.totalPostsInXml}`);
  console.log(`  processed          : ${SUMMARY.processed}`);
  console.log(`  created            : ${SUMMARY.created}`);
  console.log(`  updated            : ${SUMMARY.updated}`);
  console.log(`  skipped            : ${SUMMARY.skipped}`);
  console.log(`  failed             : ${SUMMARY.failed}`);
  console.log(`  field coverage (of processed):`);
  console.log(`    hero             : ${SUMMARY.fieldCoverage.hero}/${SUMMARY.processed}`);
  console.log(`    excerpt          : ${SUMMARY.fieldCoverage.excerpt}/${SUMMARY.processed}`);
  console.log(`    category         : ${SUMMARY.fieldCoverage.category}/${SUMMARY.processed}`);
  console.log(`    date             : ${SUMMARY.fieldCoverage.date}/${SUMMARY.processed}`);
  if (SUMMARY.failures.length) {
    console.log(`\nFailures/skips:`);
    for (const f of SUMMARY.failures) console.log(`  - ${f.slug || '(no-slug)'}: ${f.reason}`);
  }

  process.exit(SUMMARY.failed > 0 ? 1 : 0);
}

function pct(a, b) { return b === 0 ? '0' : ((100 * a) / b).toFixed(1); }

main().catch((err) => {
  console.error('FATAL:', err.stack || err.message);
  process.exit(1);
});
