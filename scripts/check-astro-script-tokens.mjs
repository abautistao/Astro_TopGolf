#!/usr/bin/env node
/**
 * check-astro-script-tokens.mjs
 *
 * Guard against the Vite dependency-scanner failure mode.
 *
 * Vite (dev only) extracts `<script>` blocks out of `.astro` files with a
 * regex applied to the RAW file text:
 *
 *   /<script\b[^>]*>([\s\S]*?)<\/script>/g
 *
 * The regex knows nothing about the Astro frontmatter fence, so a literal
 * `<script>` token inside a frontmatter or block comment is mistaken for a
 * real tag. The scanner then captures everything up to the next `</script>`
 * as JavaScript and hands it to esbuild, which fails with a misleading error:
 *
 *   ERROR: Expected ";" but found "astro"
 *   at Socket.readFromStdout (node_modules/esbuild/lib/main.js:581:7)
 *
 * The page still answers 200, but the dep scan aborts and the client-side
 * dependencies (alpinejs, swiper, gsap, flatpickr, lottie-web, ...) are never
 * pre-bundled.
 *
 * RULE enforced here: a `<script` token outside a real script block must sit in
 * tag position — i.e. it must start its line, or directly follow another
 * closed tag on the same line. A token inside prose or a comment is a
 * violation.
 *
 * A `<script` token INSIDE a real script block is harmless (the scanner's
 * match already spans that region), so it is not reported. A `</script` token
 * outside tag position is always reported: it would truncate the captured
 * region even inside a real script block.
 *
 * Usage:
 *   node scripts/check-astro-script-tokens.mjs     # exit 1 on violations
 *   node scripts/check-astro-script-tokens.mjs --quiet
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC_DIR = join(FRONTEND_ROOT, 'src');
const QUIET = process.argv.includes('--quiet');

const TOKEN_RE = /<\/?script\b/gi;

function collectAstroFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collectAstroFiles(full, out);
    else if (entry.name.endsWith('.astro')) out.push(full);
  }
  return out;
}

/**
 * A token is in tag position when everything before it on its own line is
 * whitespace, or is a previously closed tag (`</script><script ...>`).
 */
function isInTagPosition(source, index) {
  const lineStart = source.lastIndexOf('\n', index - 1) + 1;
  const before = source.slice(lineStart, index).trim();
  return before === '' || before.endsWith('>');
}

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length;
}

function findViolations(source) {
  const violations = [];
  const lines = source.split('\n');

  // Walk the tokens in order, tracking whether each one sits inside a real
  // script block (an in-tag-position `<script` … the next in-tag-position
  // `</script`).
  TOKEN_RE.lastIndex = 0;
  const tokens = [];
  let match;
  while ((match = TOKEN_RE.exec(source)) !== null) {
    tokens.push({
      index: match.index,
      token: match[0],
      inTagPosition: isInTagPosition(source, match.index),
    });
  }

  let insideRealScript = false;
  for (const t of tokens) {
    const isClosing = t.token.startsWith('</');

    if (t.inTagPosition) {
      insideRealScript = !isClosing;
      continue;
    }

    // A stray closing tag truncates the captured region wherever it lives.
    // A stray opening tag only matters outside a real script block.
    if (isClosing || !insideRealScript) {
      const line = lineOf(source, t.index);
      violations.push({ line, token: t.token, text: lines[line - 1].trim() });
    }
  }

  return violations;
}

function main() {
  const files = collectAstroFiles(SRC_DIR).sort();
  const report = [];

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const violations = findViolations(source);
    if (violations.length > 0) {
      report.push({ file: relative(FRONTEND_ROOT, file), violations });
    }
  }

  if (report.length === 0) {
    if (!QUIET) {
      console.log(`✓ ${files.length} .astro files scanned — no stray <script> tokens.`);
    }
    return 0;
  }

  console.error('✘ Stray <script> tokens found — Vite\'s dependency scanner will break.\n');
  for (const { file, violations } of report) {
    console.error(`  ${file}`);
    for (const v of violations) {
      console.error(`    line ${v.line}  ${v.token}`);
      console.error(`      ${v.text}`);
    }
    console.error('');
  }
  console.error('Why: Vite extracts <script> blocks from .astro files with a regex over the');
  console.error('raw file text, ignoring the frontmatter fence. A <script> token inside a');
  console.error('comment is taken for a real tag, so the scanner captures the rest of the');
  console.error('file as JavaScript and esbuild fails with `Expected ";" but found "<word>"`.');
  console.error('');
  console.error('Fix: rewrite the comment without the literal token (e.g. "script block").');
  return 1;
}

process.exit(main());
