/**
 * Sede (branch) registry for the per-location multisite routing spike.
 *
 * A "sede" is a physical branch of the brand. Each sede owns a path-prefixed
 * route tree that is generated inside the SAME build as every existing route,
 * without touching a single pre-existing page:
 *
 *   /{sede}/               -> sede home           src/pages/[location]/index.astro
 *   /{sede}/blog/          -> sede blog index     src/pages/[location]/blog/index.astro
 *   /{sede}/blog/{slug}/   -> sede blog post      src/pages/[location]/blog/[...slug].astro
 *
 * `slug` must be lowercase and URL-safe: it becomes the `[location]` route param
 * and therefore a real directory name in `dist/`.
 *
 * NOTE: this spike mounts the sede layer ABOVE the existing i18n layer, i.e. it
 * proves the path-prefix routing on its own. Composing `/es/monterrey/` is a
 * follow-up, not part of this spike.
 */
export const SEDES = [
  {
    slug: "monterrey",
    nombre: "Monterrey",
    estado: "Nuevo León",
    claim: "El flagship del norte",
  },
  {
    slug: "guadalajara",
    nombre: "Guadalajara",
    estado: "Jalisco",
    claim: "El refugio del centro",
  },
  {
    slug: "leon",
    nombre: "León",
    estado: "Guanajuato",
    claim: "La sede más nueva",
  },
];

/**
 * Look up a single sede by its slug.
 *
 * @param {string | undefined} slug
 * @returns {typeof SEDES[number] | null} the sede, or `null` when the slug is
 *   unknown. Returning `null` (instead of throwing) keeps page frontmatter
 *   simple and lets callers decide how to react to an unknown location.
 */
export function getSede(slug) {
  return SEDES.find((sede) => sede.slug === slug) ?? null;
}