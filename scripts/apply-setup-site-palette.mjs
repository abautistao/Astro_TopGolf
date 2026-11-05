#!/usr/bin/env node
/**
 * Aplica la paleta canonica de SeaLand al singleton `setup-site` de Strapi.
 *
 * Fuente unica de la paleta: frontend/scripts/sealand-palette.json
 * Documento de feature: odd/tasks/sealand-guadalajara-paleta.md
 *
 * Uso:
 *   STRAPI_URL=https://webdev-cms.acuarioinbursa.com.mx \
 *   STRAPI_API_TOKEN=... \
 *   node scripts/apply-setup-site-palette.mjs            # dry-run (default)
 *   node scripts/apply-setup-site-palette.mjs --apply    # escribe
 *   node scripts/apply-setup-site-palette.mjs --locale=es --verbose
 *
 * Idempotente: si los valores ya coinciden, no escribe nada.
 * Sin STRAPI_API_TOKEN nunca escribe: solo imprime el plan.
 *
 * Los 13 slots (13 color + custom_color_01) no se amplian (decision S4): un navy
 * se repite y el gris #54595F sale del modelo.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PALETTE_FILE = join(HERE, 'sealand-palette.json');

function parseArgs(argv) {
  const args = { apply: false, verbose: false, locale: 'es' };
  for (const a of argv) {
    if (a === '--apply') args.apply = true;
    else if (a === '--dry-run') args.apply = false;
    else if (a === '--verbose' || a === '-v') args.verbose = true;
    else if (a.startsWith('--locale=')) args.locale = a.split('=')[1] || 'es';
  }
  return args;
}

const ARGS = parseArgs(process.argv.slice(2));
const STRAPI_URL = (process.env.STRAPI_URL || 'http://127.0.0.1:1337').replace(/\/+$/, '');
const STRAPI_API_TOKEN = process.env.STRAPI_API_TOKEN || '';

let PALETTE;
try {
  PALETTE = JSON.parse(readFileSync(PALETTE_FILE, 'utf8'));
} catch (err) {
  console.error(`ERROR: no se pudo leer la paleta canonica en ${PALETTE_FILE}: ${err.message}`);
  process.exit(2);
}

async function strapiFetch(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (STRAPI_API_TOKEN) headers.Authorization = `Bearer ${STRAPI_API_TOKEN}`;
  if (opts.body && typeof opts.body === 'object') {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(`${STRAPI_URL}${path}`, { ...opts, headers });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* no json */ }
  if (!res.ok) {
    const err = new Error(`Strapi ${opts.method || 'GET'} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
    err.status = res.status;
    err.body = json || text;
    throw err;
  }
  return json;
}

const same = (a, b) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();

async function main() {
  console.log(`\nPaleta canonica de SeaLand (${PALETTE._source})`);
  console.log('='.repeat(74));
  for (const [field, value] of Object.entries(PALETTE.setupSite)) {
    console.log(`  ${field.padEnd(30)} ${value}`);
  }

  const res = await strapiFetch(`/api/setup-site?locale=${encodeURIComponent(ARGS.locale)}`);
  const entry = res?.data ?? null;
  if (!entry) {
    console.error('\nERROR: el CMS no devolvio el singleton setup-site.');
    process.exit(1);
  }
  const attrs = entry.attributes ?? entry;

  const changes = Object.entries(PALETTE.setupSite)
    .filter(([field, value]) => !same(attrs[field], value))
    .map(([field, value]) => ({ field, before: attrs[field] ?? null, after: value }));

  console.log(`\nDiferencia contra el CMS (${STRAPI_URL})`);
  console.log('-'.repeat(74));
  if (changes.length === 0) {
    console.log('  Sin cambios: el setup-site ya coincide con la paleta canonica.');
    return;
  }
  for (const c of changes) {
    console.log(`  ${c.field.padEnd(30)} ${String(c.before)}  ->  ${c.after}`);
  }
  console.log(`\n  ${changes.length} campo(s) a actualizar.`);

  if (!ARGS.apply) {
    console.log('\nDRY-RUN: no se escribió nada. Usa --apply para escribir.');
    console.log('Equivalente manual: Strapi admin -> Setup Site ->_COLOR DE FONDO/Acento_.');
    return;
  }

  if (!STRAPI_API_TOKEN) {
    console.error('\nERROR: --apply requiere STRAPI_API_TOKEN. No se escribió nada.');
    process.exit(2);
  }

  const payload = { ...attrs };
  for (const c of changes) payload[c.field] = c.after;

  // Strapi 5 acepta el cuerpo plano en single types; la forma con envoltorio
  // `data` se prueba como respaldo si la primera es rechazada.
  let lastError;
  for (const body of [payload, { data: payload }]) {
    try {
      const out = await strapiFetch('/api/setup-site', { method: 'PUT', body });
      console.log('\nOK: setup-site actualizado.');
      if (ARGS.verbose) console.log(JSON.stringify(out?.data ?? out, null, 2).slice(0, 2000));
      return;
    } catch (err) {
      lastError = err;
      if (err.status !== 400 && err.status !== 422) break;
    }
  }
  console.error(`\nERROR: no se pudo actualizar setup-site: ${lastError?.message}`);
  process.exit(1);
}

main().catch((err) => {
  console.error(`\nERROR: ${err.message}`);
  process.exit(1);
});
