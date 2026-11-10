#!/usr/bin/env node
/**
 * apply-sealand-palette.mjs
 *
 * Reescribe en Strapi TODOS los overrides de color guardados en el contenido
 * para que ningun hex de Acuario sobreviva (spec S6 del feature
 * `sealand-guadalajara-paleta`, ver odd/tasks/sealand-guadalajara-paleta.md).
 *
 * La tabla de traduccion NO vive aqui: se lee de la fuente unica
 * `frontend/scripts/sealand-palette.json` (bloque `contentColorMap`). Si esa
 * tabla cambia, este script la sigue; no hay que tocar este archivo.
 *
 * Que recorre:
 *   - Colecciones: paginas, blogs, promociones, pases, experiencias.
 *   - Single types: header y footer (campo `Variante`).
 *   - En cada entrada recorre el JSON en profundidad: los dynamic zones anidan
 *     componentes (tarjetas, slides, acordeones, cards...) que tienen sus
 *     propios campos `color_*`, y esos tambien se reescriben.
 *   - Se sustituye el valor de TODO campo cuyo nombre contenga "color"
 *     (color_fondo, color_titulo_override, cta_color_fondo, color_inicio,
 *     color_final, background_color, title_color, ...).
 *   - Los valores que no estan en `contentColorMap` NO se tocan: se listan en
 *     el informe como "sin traduccion" con su ruta.
 *
 * Semantica de escritura (Strapi 5, draft & publish):
 *   - Cada documento tiene fila de borrador (published_at = null) y fila
 *     publicada, y en cada version los componentes tienen ids DISTINTOS.
 *   - El PUT de Strapi 5 siempre actualiza el BORRADOR y, con
 *     `?status=published`, despues publica esa version (recrea la fila
 *     publicada a partir del borrador).
 *   - Por eso el script escribe SIEMPRE sobre el borrador (que es el destino
 *     real del PUT) y publica. El payload es COMPLETO (no solo los colores):
 *     Strapi reconstruye los componentes que recibe y, si faltara contenido,
 *     la version publicada perderia campos.
 *   - Los media se reenvian como `{ id }` para no volver a subir ningun archivo.
 *   - Se avisa (no se escribe) cuando el borrador y la version publicada
 *     tienen overrides de color distintos: al publicar prevalecera el borrador.
 *
 * Idempotente: una segunda corrida no reporta cambios ni escribe.
 *
 * Opciones:
 *   --apply          escribe en el CMS (por defecto es dry-run)
 *   --dry-run        fuerza el dry-run
 *   --verify         tras escribir, relee y comprueba que los overrides de la
 *                    paleta quedaron aplicados (y que el contenido no cambio)
 *   --normalize-case tambien reescribe los valores que solo difieren en la
 *                    caja (#ffffff -> #FFFFFF). Por defecto NO se reescriben:
 *                    es el mismo color y cada PUT crea borrador y publica.
 *   --locale=es      locale(s) a procesar, separados por coma (por defecto es)
 *   --verbose        muestra mas detalle (payload de muestra, todas las rutas)
 *
 * Uso:
 *   STRAPI_URL=https://webdev-cms.acuarioinbursa.com.mx \
 *   STRAPI_API_TOKEN=... \
 *   node frontend/scripts/apply-sealand-palette.mjs            # dry-run (default)
 *   node frontend/scripts/apply-sealand-palette.mjs --apply    # escribe
 *   node frontend/scripts/apply-sealand-palette.mjs --apply --verify
 *   node frontend/scripts/apply-sealand-palette.mjs --locale=es --verbose
 *
 * Sin STRAPI_API_TOKEN el script NUNCA escribe: solo imprime el plan y sale
 * con codigo != 0 si se pidio --apply.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PALETTE_FILE = join(HERE, 'sealand-palette.json');

// =====================================================================================
// CLI / ENV
// =====================================================================================

function parseArgs(argv) {
  const args = { apply: false, verbose: false, verify: false, normalizeCase: false, locales: ['es'] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--dry-run') args.apply = false;
    else if (a === '--verbose' || a === '-v') args.verbose = true;
    else if (a === '--verify') args.verify = true;
    else if (a === '--normalize-case') args.normalizeCase = true;
    else if (a.startsWith('--locale=')) {
      const list = a.slice('--locale='.length).split(',').map((s) => s.trim()).filter(Boolean);
      if (list.length) args.locales = list;
    } else if (a === '--locale' && argv[i + 1] && !argv[i + 1].startsWith('--')) {
      const list = argv[i + 1].split(',').map((s) => s.trim()).filter(Boolean);
      if (list.length) args.locales = list;
      i++;
    }
  }
  return args;
}

const ARGS = parseArgs(process.argv.slice(2));

// STRAPI_URL puede apuntar a la raiz del CMS o ya a /api: se normaliza.
const RAW_URL = (process.env.STRAPI_URL || 'http://127.0.0.1:1337').replace(/\/+$/, '');
const API_ROOT = /\/api$/.test(RAW_URL) ? RAW_URL : `${RAW_URL}/api`;
const STRAPI_API_TOKEN = process.env.STRAPI_API_TOKEN || '';

// =====================================================================================
// PALETA (fuente unica: frontend/scripts/sealand-palette.json)
// =====================================================================================

function loadPalette() {
  let raw;
  try {
    raw = readFileSync(PALETTE_FILE, 'utf8');
  } catch (err) {
    console.error(`ERROR: no se pudo leer la paleta canonica en ${PALETTE_FILE}: ${err.message}`);
    console.error('       El script no puede decidir traducciones sin ese archivo.');
    process.exit(2);
  }
  let palette;
  try {
    palette = JSON.parse(raw);
  } catch (err) {
    console.error(`ERROR: ${PALETTE_FILE} no es JSON valido: ${err.message}`);
    process.exit(2);
  }
  const slotHex = palette?.setupSite;
  const hexToSlot = palette?.hexToSlot;
  if (!slotHex || !hexToSlot || Object.keys(hexToSlot).length === 0) {
    console.error(`ERROR: ${PALETTE_FILE} no tiene los bloques "setupSite" y "hexToSlot" con entradas.`);
    console.error('       Se generan con odd/plans/build-palette-json.py (ver la tabla canonica');
    console.error('       de odd/tasks/sealand-guadalajara-paleta.md).');
    process.exit(2);
  }
  // El mapa hex->hex que se aplica al contenido se DERIVA de setupSite + hexToSlot:
  // una sola fuente de verdad, de modo que el codigo (que usa var(--slot)) y el
  // CMS (que recibe el hex del slot) no pueden discrepar. Un hex de 8 digitos
  // conserva su canal alfa en el destino.
  const map = {};
  for (const [from, slot] of Object.entries(hexToSlot)) {
    const target = slotHex[slot];
    if (!target) {
      console.error(`ERROR: el slot "${slot}" (de ${from}) no existe en setupSite.`);
      process.exit(2);
    }
    const key = String(from).trim().toLowerCase();
    const alpha = /^#[0-9a-f]{6}([0-9a-f]{2})$/.exec(key);
    map[key] = alpha ? `${target}${alpha[1]}` : String(target).trim();
  }
  // Las claves se comparan en minusculas; los valores destino se respetan tal cual.
  const lookup = new Map();
  for (const [from, to] of Object.entries(map)) {
    lookup.set(String(from).trim().toLowerCase(), String(to).trim());
  }
  // Formas cortas (#fff) y formas con canal alfa (#002a4e80) de los valores de
  // la tabla: son el mismo color, pero la tabla no los cubre; se reportan
  // aparte para que se puedan anadir.
  const shortForms = new Map();
  for (const key of lookup.keys()) {
    const rgb = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(key);
    if (rgb) shortForms.set(`#${rgb[1][0]}${rgb[2][0]}${rgb[3][0]}`, key);
  }
  const alphaForms = new Map();
  for (const key of lookup.keys()) {
    const withAlpha = /^#([0-9a-f]{6})[0-9a-f]{2}$/.exec(key);
    if (withAlpha) alphaForms.set(`#${withAlpha[1]}ff`, key);
  }
  return { palette, lookup, shortForms, alphaForms, ruleCount: lookup.size };
}

const {
  palette: PALETTE,
  lookup: COLOR_MAP,
  shortForms: COLOR_SHORT_FORMS,
  alphaForms: COLOR_ALPHA_FORMS,
  ruleCount: RULE_COUNT,
} = loadPalette();

// =====================================================================================
// HTTP
// =====================================================================================

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class HttpError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

/**
 * GET/JSON contra Strapi con reintentos para 5xx y errores de red.
 * Los 4xx no se reintentan (payload invalido: hay que corregirlo, no insistir).
 */
async function apiFetch(path, { method = 'GET', body = null, retries = 4, timeoutMs = 45000 } = {}) {
  const url = `${API_ROOT}${path}`;
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const headers = { Accept: 'application/json' };
      if (STRAPI_API_TOKEN) headers.Authorization = `Bearer ${STRAPI_API_TOKEN}`;
      let payload = body;
      if (body !== null) {
        headers['Content-Type'] = 'application/json';
        payload = JSON.stringify(body);
      }
      const res = await fetch(url, { method, headers, body: payload, signal: AbortSignal.timeout(timeoutMs) });
      const text = await res.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch { /* no json */ }
      if (!res.ok) {
        const err = new HttpError(
          `Strapi ${method} ${path} -> ${res.status}: ${(text || '').slice(0, 300)}`,
          res.status,
          json || text,
        );
        if (res.status >= 500 && attempt < retries) {
          lastError = err;
          await sleep(400 * attempt);
          continue;
        }
        throw err;
      }
      return json;
    } catch (err) {
      lastError = err;
      if (err instanceof HttpError && err.status < 500) throw err;
      if (attempt === retries) throw err;
      await sleep(400 * attempt);
    }
  }
  throw lastError;
}

// =====================================================================================
// MODELO DE DATOS
// =====================================================================================

const COLLECTIONS = ['paginas', 'blogs', 'promociones', 'pases', 'experiencias'];
const SINGLE_TYPES = ['header', 'footer'];

// Claves que Strapi no acepta en el cuerpo de un PUT (solo a nivel de entrada).
const READ_ONLY_KEYS = new Set([
  'id', 'createdAt', 'updatedAt', 'publishedAt', 'firstPublishedAt',
  'localizations', 'locale',
]);

// Un campo de color: cualquier atributo cuyo nombre contenga "color".
const COLOR_FIELD_RE = /color/i;

/** ¿Es un objeto de media de Strapi? (id + url + mime) */
function isMedia(value) {
  return Boolean(
    value && typeof value === 'object' && !Array.isArray(value) &&
    typeof value.id === 'number' && typeof value.url === 'string' && typeof value.mime === 'string',
  );
}

// =====================================================================================
// RECORRIDO DE COLORES
// =====================================================================================

/**
 * Recorre el JSON de una entrada y devuelve todos los campos de color con su
 * ruta completa y el componente (dynamic zone) al que pertenecen.
 */
function collectColorFields(node, path, componentUid, out) {
  if (Array.isArray(node)) {
    node.forEach((value, index) => collectColorFields(value, `${path}[${index}]`, componentUid, out));
    return out;
  }
  if (!node || typeof node !== 'object') return out;

  let component = componentUid;
  for (const [key, value] of Object.entries(node)) {
    const currentPath = path ? `${path}.${key}` : key;
    if (key === '__component' && typeof value === 'string') {
      component = value;
      continue;
    }
    if (typeof value === 'string') {
      if (COLOR_FIELD_RE.test(key) && value.trim()) {
        out.push({ path: currentPath, key, value: value.trim(), component });
      }
      continue;
    }
    collectColorFields(value, currentPath, component, out);
  }
  return out;
}

/**
 * Analiza una entrada: devuelve cambios, cambios solo de caja y valores sin
 * traduccion.
 *
 * - Un valor de la tabla cuyo hex difiere del actual es un cambio real.
 * - Un valor de la tabla cuyo hex solo difiere en la caja (#ffffff -> #FFFFFF)
 *   NO se toca por defecto: el color es el mismo y reescribirlo solo genera
 *   churn (cada PUT crea borrador y publica). Con --normalize-case si se
 *   reescribe, para dejar el valor exactamente como lo define la tabla.
 * - Un valor que no esta en la tabla no se toca y se reporta.
 */
function analyzeEntry(entry) {
  const fields = collectColorFields(entry, '', null, []);
  const changes = [];
  const caseOnly = [];
  const untranslated = [];
  for (const field of fields) {
    const target = COLOR_MAP.get(field.value.toLowerCase());
    if (!target) {
      untranslated.push(field);
      continue;
    }
    if (target.toLowerCase() !== field.value.toLowerCase()) {
      changes.push({ ...field, after: target });
    } else if (target !== field.value) {
      caseOnly.push({ ...field, after: target });
    }
  }
  return { changes, caseOnly, untranslated };
}

// =====================================================================================
// PAYLOAD
// =====================================================================================

/**
 * Reconstruye el cuerpo de un PUT a partir de la version leida:
 *   - sustituye los valores de color por su equivalente de la paleta;
 *   - convierte los media en `{ id }` (no se vuelve a subir ningun archivo);
 *   - conserva los ids de los componentes (Strapi los necesita para actualizar
 *     en lugar de recrear) y elimina las claves de solo lectura de la entrada.
 */
function buildPayload(entry) {
  const payload = {};
  for (const [key, value] of Object.entries(entry)) {
    if (READ_ONLY_KEYS.has(key)) continue;
    payload[key] = buildValue(value, key);
  }
  return payload;
}

function buildValue(node, keyName) {
  if (Array.isArray(node)) return node.map((value) => buildValue(value, keyName));
  if (node && typeof node === 'object') {
    if (isMedia(node)) return { id: node.id };
    const out = {};
    for (const [key, value] of Object.entries(node)) out[key] = buildValue(value, key);
    return out;
  }
  if (typeof node === 'string' && keyName && COLOR_FIELD_RE.test(keyName)) {
    const target = COLOR_MAP.get(node.trim().toLowerCase());
    if (target) return target;
  }
  return node;
}

/**
 * Huella del contenido para comparar antes/despues: ignora ids, marcas de
 * tiempo y normaliza los colores a su valor destino (para que el cambio de
 * paleta no cuente como diferencia).
 */
function fingerprint(node, keyName = null) {
  if (Array.isArray(node)) return node.map((value) => fingerprint(value, keyName));
  if (node && typeof node === 'object') {
    if (isMedia(node)) return `media:${node.id}`;
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      if (READ_ONLY_KEYS.has(key) || key === 'documentId') continue;
      out[key] = fingerprint(value, key);
    }
    return out;
  }
  if (typeof node === 'string' && keyName && COLOR_FIELD_RE.test(keyName)) {
    const target = COLOR_MAP.get(node.trim().toLowerCase());
    if (target) return target;
  }
  return node;
}

// =====================================================================================
// LECTURA DEL CMS
// =====================================================================================

/** Trae todas las entradas de una coleccion para un locale (paginado). */
async function fetchCollection(apiId, locale, status) {
  const entries = [];
  let page = 1;
  for (;;) {
    const json = await apiFetch(
      `/${apiId}?locale=${encodeURIComponent(locale)}&status=${status}&populate=*&pagination[page]=${page}&pagination[pageSize]=100`,
    );
    const data = Array.isArray(json?.data) ? json.data : [];
    entries.push(...data);
    const pageCount = json?.meta?.pagination?.pageCount;
    if (data.length === 0 || !pageCount || page >= pageCount) break;
    page += 1;
  }
  return entries;
}

/** Trae un single type (header/footer). Devuelve null si no existe en ese locale. */
async function fetchSingle(apiId, locale, status) {
  try {
    const json = await apiFetch(`/${apiId}?locale=${encodeURIComponent(locale)}&status=${status}&populate=*`);
    return json?.data ?? null;
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) return null;
    throw err;
  }
}

// =====================================================================================
// ESCRITURA
// =====================================================================================

/**
 * Aplica el payload. En Strapi 5 el PUT actualiza el borrador y, con
 * `status=published`, publica esa version.
 */
async function writeEntry(item, payload) {
  const target = item.isSingleType ? `/${item.apiId}` : `/${item.apiId}/${item.documentId}`;
  const query = `?locale=${encodeURIComponent(item.locale)}&status=published`;
  try {
    return await apiFetch(`${target}${query}`, { method: 'PUT', body: { data: payload } });
  } catch (err) {
    // Strapi 5 exige el envoltorio `data`; si el CMS lo pidiera plano, se reintenta.
    if (err instanceof HttpError && err.status === 400 && /data/i.test(String(err.body))) {
      return apiFetch(`${target}${query}`, { method: 'PUT', body: payload });
    }
    throw err;
  }
}

/** Relee una entrada (coleccion por documentId, single type sin id). */
async function readPublished(item) {
  const target = item.isSingleType ? `/${item.apiId}` : `/${item.apiId}/${item.documentId}`;
  const json = await apiFetch(`${target}?locale=${encodeURIComponent(item.locale)}&status=published&populate=*`);
  const data = json?.data;
  return Array.isArray(data) ? data[0] ?? null : data ?? null;
}

// =====================================================================================
// REPORTE
// =====================================================================================

const LINE = '='.repeat(78);
const THIN = '-'.repeat(78);

function pad(value, size) {
  const str = String(value ?? '');
  return str.length >= size ? str : str + ' '.repeat(size - str.length);
}

/** Etiqueta legible de la entrada a la que pertenece un campo. */
function entryLabel(item) {
  const who = item.slug ? `${item.apiId}(${item.slug})` : `${item.apiId}(${item.documentId || '-'})`;
  return item.path ? `${who}.${item.path}` : who;
}

function printHeader() {
  console.log(LINE);
  console.log('SeaLand — reescritura de overrides de color en Strapi (S6)');
  console.log(LINE);
  console.log(`  cms            : ${API_ROOT}`);
  console.log(`  locale         : ${ARGS.locales.join(', ')}`);
  console.log('  version leida  : published + borrador (el PUT de Strapi 5 escribe el borrador)');
  console.log(`  modo           : ${ARGS.apply ? 'APLICAR (escribe en el CMS)' : 'DRY-RUN (no escribe nada)'}`);
  console.log(`  token          : ${STRAPI_API_TOKEN ? '*** configurado ***' : '(sin token: no se puede escribir)'}`);
  console.log(`  paleta         : ${PALETTE_FILE}`);
  if (PALETTE?._source) console.log(`  fuente         : ${PALETTE._source}`);
  console.log(`  reglas         : ${RULE_COUNT} (contentColorMap)`);
  console.log('');
}

function printCollectionSummary(perCollection) {
  console.log('--- Cambios por coleccion ---');
  console.log(THIN);
  for (const [apiId, stat] of perCollection) {
    console.log(
      `  ${pad(apiId, 14)} ${pad(`${stat.entries} entradas`, 16)} ` +
      `${pad(`${stat.entriesWithChanges} con cambios`, 18)} ${stat.fields} campo(s)`,
    );
  }
  console.log('');
}

function printComponentSummary(perComponent) {
  console.log('--- Cambios por componente ---');
  console.log(THIN);
  if (perComponent.size === 0) {
    console.log('  (sin cambios)');
    console.log('');
    return;
  }
  for (const [apiId, components] of perComponent) {
    for (const [component, fields] of components) {
      console.log(`  ${apiId} / ${component}`);
      for (const [key, info] of fields) {
        if (info.values.size === 1) {
          const [before, after] = [...info.values.values()][0];
          console.log(`      ${pad(key, 34)} ${pad(`${before} -> ${after}`, 30)} x${info.count}`);
        } else {
          console.log(`      ${pad(key, 34)} ${pad(`${info.values.size} variantes`, 30)} x${info.count}`);
          for (const [before, after] of info.values.values()) {
            console.log(`          ${pad(before, 12)} -> ${after}`);
          }
        }
      }
    }
  }
  console.log('');
}

function printEntryDetails(entries) {
  console.log('--- Detalle por entrada ---');
  console.log(THIN);
  if (entries.length === 0) {
    console.log('  (sin cambios)');
    console.log('');
    return;
  }
  for (const item of entries) {
    const label = item.slug ? `${item.apiId}(${item.slug})` : `${item.apiId}(${item.documentId || '-'})`;
    const origin = item.hasDraft ? 'borrador (se publica)' : 'publicada (se crea borrador y se publica)';
    console.log(`  ${label} [${item.documentId || '-'}] ${origin}`);
    for (const change of item.changes) {
      const note = change.value.toLowerCase() === change.after.toLowerCase() ? '  (solo caja)' : '';
      console.log(`      ${pad(change.path, 52)} ${pad(change.value, 10)} -> ${change.after}${note}`);
    }
  }
  console.log('');
}

function printCaseOnly(caseOnly) {
  if (caseOnly.length === 0) return;
  console.log('--- Ya en valor canonico (solo cambia la caja) ---');
  console.log(THIN);
  const byValue = new Map();
  for (const item of caseOnly) {
    if (!byValue.has(item.value)) byValue.set(item.value, []);
    byValue.get(item.value).push(item);
  }
  console.log(`  ${byValue.size} valor(es), ${caseOnly.length} ocurrencia(s) — no se reescriben salvo --normalize-case`);
  console.log('');
  for (const [value, items] of [...byValue.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${pad(value, 12)} -> ${items[0].after}   ${items.length} ocurrencia(s)`);
    const shown = ARGS.verbose ? items : items.slice(0, 3);
    for (const item of shown) console.log(`      ${entryLabel(item)}`);
    if (shown.length < items.length) {
      console.log(`      ... y ${items.length - shown.length} mas (usa --verbose)`);
    }
  }
  console.log('');
}

function printUntranslated(untranslated) {
  console.log('--- Sin traduccion (valores fuera de contentColorMap) ---');
  console.log(THIN);
  if (untranslated.length === 0) {
    console.log('  (todos los valores de color tienen traduccion)');
    console.log('');
    return;
  }
  const byValue = new Map();
  for (const item of untranslated) {
    if (!byValue.has(item.value)) byValue.set(item.value, []);
    byValue.get(item.value).push(item);
  }
  const sorted = [...byValue.entries()].sort((a, b) => b[1].length - a[1].length);
  const aliasOf = (value) => {
    const lower = value.toLowerCase();
    if (COLOR_SHORT_FORMS.has(lower)) return { kind: 'forma corta', canonical: COLOR_SHORT_FORMS.get(lower) };
    if (COLOR_ALPHA_FORMS.has(lower)) return { kind: 'con canal alfa', canonical: COLOR_ALPHA_FORMS.get(lower) };
    return null;
  };
  const aliases = sorted.filter(([value]) => aliasOf(value));
  const others = sorted.filter(([value]) => !aliasOf(value));
  console.log(`  ${sorted.length} valor(es) distinto(s), ${untranslated.length} ocurrencia(s)`);
  console.log('');

  if (aliases.length) {
    console.log('  ALIAS de un valor de la tabla (mismo color, otra escritura):');
    for (const [value, items] of aliases) {
      const alias = aliasOf(value);
      console.log(`    ${pad(value, 12)} = ${pad(alias.canonical, 10)} -> ${COLOR_MAP.get(alias.canonical)}   (${alias.kind})   ${items.length} ocurrencia(s)`);
      for (const item of items) console.log(`        ${entryLabel(item)}`);
    }
    console.log('');
  }

  for (const [value, items] of others) {
    console.log(`  ${pad(value, 12)} ${items.length} ocurrencia(s)`);
    const shown = ARGS.verbose ? items : items.slice(0, 6);
    for (const item of shown) console.log(`      ${entryLabel(item)}`);
    if (shown.length < items.length) {
      console.log(`      ... y ${items.length - shown.length} mas (usa --verbose)`);
    }
  }
  console.log('');
}

// =====================================================================================
// MAIN
// =====================================================================================

async function main() {
  printHeader();

  if (ARGS.apply && !STRAPI_API_TOKEN) {
    console.error('ERROR: --apply requiere STRAPI_API_TOKEN. No se escribio nada.');
    console.error('       Exporta STRAPI_API_TOKEN con un token de la API del CMS y reintenta.');
    process.exit(2);
  }

  const collectionStats = new Map();
  const componentStats = new Map();
  const entriesToWrite = [];
  const untranslated = [];
  const caseOnlyItems = [];
  const warnings = [];
  const failures = [];
  let scannedEntries = 0;

  const statFor = (apiId) => {
    if (!collectionStats.has(apiId)) collectionStats.set(apiId, { entries: 0, entriesWithChanges: 0, fields: 0 });
    return collectionStats.get(apiId);
  };
  const componentsFor = (apiId) => {
    if (!componentStats.has(apiId)) componentStats.set(apiId, new Map());
    return componentStats.get(apiId);
  };

  /** Registra los cambios de una entrada en los contadores y grupos. */
  const registerChanges = (apiId, changes) => {
    const components = componentsFor(apiId);
    for (const change of changes) {
      const component = change.component || '(raiz)';
      if (!components.has(component)) components.set(component, new Map());
      const fields = components.get(component);
      if (!fields.has(change.key)) fields.set(change.key, { count: 0, values: new Map() });
      const info = fields.get(change.key);
      info.count += 1;
      info.values.set(`${change.value}->${change.after}`, [change.value, change.after]);
    }
  };

  for (const locale of ARGS.locales) {
    for (const apiId of COLLECTIONS) {
      let published;
      let drafts;
      try {
        published = await fetchCollection(apiId, locale, 'published');
        drafts = await fetchCollection(apiId, locale, 'draft');
      } catch (err) {
        failures.push({ apiId, locale, reason: `lectura: ${err.message}` });
        console.error(`  ERROR leyendo ${apiId} (${locale}): ${err.message}`);
        statFor(apiId);
        continue;
      }

      const draftByDocument = new Map(drafts.map((d) => [d.documentId, d]));
      const stat = statFor(apiId);
      const seen = new Set();

      for (const entry of published) {
        const key = `${entry.documentId}:${entry.locale ?? '-'}`;
        if (seen.has(key)) continue;
        seen.add(key);
        stat.entries += 1;
        scannedEntries += 1;

        const analysis = analyzeEntry(entry);
        for (const item of analysis.untranslated) {
          untranslated.push({ ...item, apiId, locale, slug: entry.slug, documentId: entry.documentId });
        }
        if (analysis.changes.length === 0) continue;

        const draft = draftByDocument.get(entry.documentId) || null;
        const hasDraft = Boolean(draft);
        const base = hasDraft ? draft : entry;
        const baseAnalysis = analyzeEntry(base);
        const baseChanges = ARGS.normalizeCase ? [...baseAnalysis.changes, ...baseAnalysis.caseOnly] : baseAnalysis.changes;
        caseOnlyItems.push(...baseAnalysis.caseOnly.map((c) => ({ ...c, apiId, locale, slug: entry.slug, documentId: entry.documentId })));

        if (hasDraft) {
          // El PUT escribe el borrador y publica: si los overrides del borrador
          // difieren de los publicados, al publicar prevalecera el borrador.
          const publishedColors = new Map(analysis.changes.map((c) => [c.path, c.value]));
          const draftColors = new Map(baseAnalysis.changes.map((c) => [c.path, c.value]));
          const diff = [...draftColors].filter(([p, v]) => publishedColors.has(p) && publishedColors.get(p) !== v);
          if (diff.length) {
            warnings.push(
              `${apiId}(${entry.slug || entry.documentId}): el borrador y la version publicada tienen ` +
              `overrides distintos (${diff.length}); al publicar prevalecera el borrador.`,
            );
          }
          if (baseChanges.length === 0) {
            warnings.push(
              `${apiId}(${entry.slug || entry.documentId}): el borrador no tiene overrides de color, ` +
              'pero la version publicada si; la publicada conserva hexes de Acuario.',
            );
            continue;
          }
        }

        stat.entriesWithChanges += 1;
        stat.fields += baseChanges.length;
        registerChanges(apiId, baseChanges);
        entriesToWrite.push({
          apiId, locale, documentId: entry.documentId, slug: entry.slug, isSingleType: false,
          hasDraft, base, changes: baseChanges,
        });
      }
    }

    for (const apiId of SINGLE_TYPES) {
      let published;
      let draft = null;
      try {
        published = await fetchSingle(apiId, locale, 'published');
        draft = await fetchSingle(apiId, locale, 'draft');
      } catch (err) {
        failures.push({ apiId, locale, reason: `lectura: ${err.message}` });
        console.error(`  ERROR leyendo ${apiId} (${locale}): ${err.message}`);
        statFor(apiId);
        continue;
      }
      const stat = statFor(apiId);
      if (!published) continue;
      stat.entries += 1;
      scannedEntries += 1;

      const analysis = analyzeEntry(published);
      for (const item of analysis.untranslated) {
        untranslated.push({ ...item, apiId, locale, slug: null, documentId: published.documentId });
      }
      if (analysis.changes.length === 0) continue;

      const hasDraft = Boolean(draft);
      const base = hasDraft ? draft : published;
      const baseAnalysis = analyzeEntry(base);
      const baseChanges = ARGS.normalizeCase ? [...baseAnalysis.changes, ...baseAnalysis.caseOnly] : baseAnalysis.changes;
      caseOnlyItems.push(...baseAnalysis.caseOnly.map((c) => ({ ...c, apiId, locale, slug: null, documentId: published.documentId })));
      if (baseChanges.length === 0) {
        warnings.push(
          `${apiId}: el borrador no tiene overrides de color, pero la version publicada si.`,
        );
        continue;
      }

      stat.entriesWithChanges += 1;
      stat.fields += baseChanges.length;
      registerChanges(apiId, baseChanges);
      entriesToWrite.push({
        apiId, locale, documentId: published.documentId, slug: null, isSingleType: true,
        hasDraft, base, changes: baseChanges,
      });
    }
  }

  console.log('--- Lectura ---');
  console.log(THIN);
  console.log(`  entradas revisadas: ${scannedEntries}`);
  console.log(`  entradas con overrides a reescribir: ${entriesToWrite.length}`);
  console.log('');

  printCollectionSummary(collectionStats);
  printComponentSummary(componentStats);
  printEntryDetails(entriesToWrite);
  printCaseOnly(caseOnlyItems);
  printUntranslated(untranslated);

  if (warnings.length) {
    console.log('--- Avisos ---');
    console.log(THIN);
    for (const warning of warnings) console.log(`  ! ${warning}`);
    console.log('');
  }

  if (!ARGS.apply) {
    if (ARGS.verbose) {
      console.log('--- Payload que se enviaria (muestra) ---');
      console.log(THIN);
      let shown = 0;
      for (const item of entriesToWrite) {
        const payload = buildPayload(item.base);
        const components = payload.ContenidoPagina || payload.Variante || [];
        const ids = Array.isArray(components) ? components.map((c) => c.id).join(',') : '';
        console.log(`  ${item.apiId}(${item.slug || item.documentId})`);
        console.log(`      claves: ${Object.keys(payload).join(', ')}`);
        console.log(`      ids de componente: ${ids || '(sin dynamic zone)'}`);
        if (shown === 0) {
          const payloadColors = collectColorFields(payload, '', null, []);
          console.log('      overrides de color en el payload:');
          for (const color of payloadColors) {
            console.log(`        ${pad(color.path, 48)} ${color.value}`);
          }
          shown += 1;
        }
      }
      console.log('');
    }
    if (failures.length) {
      console.log('--- Fallos ---');
      console.log(THIN);
      for (const failure of failures) {
        console.log(`  - ${failure.apiId} (${failure.locale}): ${failure.reason}`);
      }
      console.log('');
    }
    console.log(LINE);
    console.log('DRY-RUN: no se escribio nada. Usa --apply (y STRAPI_API_TOKEN) para escribir.');
    console.log(LINE);
    process.exit(failures.length > 0 ? 1 : 0);
  }

  console.log('--- Escritura ---');
  console.log(THIN);
  let written = 0;
  const writtenItems = [];
  for (const item of entriesToWrite) {
    const payload = buildPayload(item.base);
    try {
      await writeEntry(item, payload);
      written += 1;
      writtenItems.push(item);
      console.log(`  OK    ${item.apiId}(${item.slug || item.documentId}) ${item.changes.length} campo(s)`);
      if (ARGS.verbose) {
        console.log(`        payload: ${JSON.stringify(payload).slice(0, 800)}`);
      }
    } catch (err) {
      failures.push({ apiId: item.apiId, locale: item.locale, reason: `escritura: ${err.message}` });
      console.error(`  FAIL  ${item.apiId}(${item.slug || item.documentId}): ${err.message}`);
    }
  }
  console.log('');
  console.log(`  escritas: ${written}/${entriesToWrite.length}`);
  console.log('');

  if (ARGS.verify) {
    console.log('--- Verificacion (relectura) ---');
    console.log(THIN);
    for (const item of writtenItems) {
      try {
        const entry = await readPublished(item);
        const after = analyzeEntry(entry || {});
        const pending = after.changes;
        const expected = JSON.stringify(fingerprint(item.base));
        const actual = JSON.stringify(fingerprint(entry || {}));
        const same = expected === actual;
        console.log(
          `  ${pending.length === 0 && same ? 'OK   ' : 'AVISO'} ${item.apiId}(${item.slug || item.documentId})` +
          `${pending.length ? ` -> ${pending.length} override(s) de la paleta sin aplicar` : ''}` +
          `${same ? '' : ' -> el contenido difiere del que se envio (revisar)'}`,
        );
        for (const f of pending) console.log(`        ${f.path} = ${f.value}`);
        if (pending.length > 0) {
          failures.push({ apiId: item.apiId, locale: item.locale, reason: 'verificacion: overrides sin aplicar' });
        }
      } catch (err) {
        failures.push({ apiId: item.apiId, locale: item.locale, reason: `verificacion: ${err.message}` });
        console.error(`  FAIL  ${item.apiId}(${item.slug || item.documentId}): verificacion: ${err.message}`);
      }
    }
    console.log('');
  }

  if (failures.length) {
    console.log(LINE);
    console.log(`ERROR: ${failures.length} fallo(s):`);
    for (const failure of failures) {
      console.log(`  - ${failure.apiId} (${failure.locale}): ${failure.reason}`);
    }
    console.log(LINE);
    process.exit(1);
  }

  console.log(LINE);
  console.log(`OK: ${written} entrada(s) reescrita(s).`);
  console.log(LINE);
  process.exit(0);
}

main().catch((err) => {
  console.error('FATAL:', err?.stack || err?.message || err);
  process.exit(1);
});
