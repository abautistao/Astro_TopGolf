/**
 * Local, network-free fixture data for the per-location multisite routing spike.
 *
 * HARD RULE: nothing in this module performs I/O. No Strapi, no fetch, no env
 * lookups. It stands in for the `getPageBySlug()` / `getAllBlogs()` calls that a
 * production sede layer would make against Strapi, so the spike proves the
 * ROUTING and the per-sede isolation, not the data layer.
 *
 * The `__component` UIDs used in `ContenidoPagina` are REAL keys already
 * registered in `src/components/RenderBlocks.astro` and backed by real acuario
 * schemas in `backend/src/components/secciones/`. They were picked because every
 * attribute is optional, they never fetch from Strapi themselves, and they are
 * styled exclusively with the theme CSS variables:
 *
 *   secciones.componente-2-acuario  -> src/components/acuario/Component_2_Acuario.astro
 *                                       (banner strip: texto_resaltado / texto_secundario / boton)
 *   secciones.componente-12-acuario -> src/components/acuario/Component_12_Acuario.astro
 *                                       (card grid: titulo / subtitulo / tarjetas)
 */

import { getSede } from "./sedes.js";

/** Canonical, absolute public path of a sede home. */
export const sedeHomePath = (sedeSlug) => `/${sedeSlug}/`;
/** Canonical, absolute public path of a sede blog index. */
export const sedeBlogPath = (sedeSlug) => `/${sedeSlug}/blog/`;
/** Canonical, absolute public path of a single post inside a sede. */
export const sedePostPath = (sedeSlug, postSlug) => `/${sedeSlug}/blog/${postSlug}/`;

// -----------------------------------------------------------------------------
// Homes - one page-like object per sede, shaped like a Strapi `pagina` entry.
// -----------------------------------------------------------------------------

const HOMES = {
  monterrey: {
    titulo: "Acuario Monterrey",
    SEO: {
      metaTitle: "Acuario Monterrey | Acuario Inbursa",
      metaDescription:
        "Sede Acuario Monterrey: horarios, experiencias acuaticas para toda la familia y nuevos espacios de bienestar.",
      keywords: "acuario monterrey, acuario inbursa, nuevo leon",
    },
    ContenidoPagina: [
      {
        id: "spike-home-mty-1",
        __component: "secciones.componente-2-acuario",
        texto_resaltado: "Acuario Monterrey",
        texto_secundario: "La sede original",
        boton: {
          texto: "Ver blog de la sede",
          url: "/monterrey/blog/",
        },
      },
      {
        id: "spike-home-mty-2",
        __component: "secciones.componente-12-acuario",
        titulo: "Que incluye tu sede",
        subtitulo: "Monterrey",
        color_fondo: "var(--surface-brand-primary)",
        tarjetas: [
          {
            titulo: "Nado abierto",
            descripcion:
              "Piscina de ocho carriles con agua a temperatura controlada todo el ano.",
          },
          {
            titulo: "Spa y sauna",
            descripcion:
              "Zona de bienestar con sauna y regaderas para después de nadar.",
          },
          {
            titulo: "Cafeteria",
            descripcion:
              "Cafe de especialidad y menu ligero con vista al area de nado.",
          },
        ],
      },
    ],
  },

  guadalajara: {
    titulo: "Acuario Guadalajara",
    SEO: {
      metaTitle: "Acuario Guadalajara | Acuario Inbursa",
      metaDescription:
        "Sede Acuario Guadalajara: horarios, experiencias para toda la familia y salas corporativas.",
      keywords: "acuario guadalajara, acuario inbursa, jalisco",
    },
    ContenidoPagina: [
      {
        id: "spike-home-gdl-1",
        __component: "secciones.componente-2-acuario",
        texto_resaltado: "Acuario Guadalajara",
        texto_secundario: "En el corazon de la ciudad",
        boton: {
          texto: "Ver blog de la sede",
          url: "/guadalajara/blog/",
        },
      },
      {
        id: "spike-home-gdl-2",
        __component: "secciones.componente-12-acuario",
        titulo: "Que incluye tu sede",
        subtitulo: "Guadalajara",
        color_fondo: "var(--surface-brand-primary)",
        tarjetas: [
          {
            titulo: "Nado recreativo",
            descripcion:
              "Piscina familiar con andadores y una zona de nado poco profundo para ninos.",
          },
          {
            titulo: "Sala de capacitacion grupal",
            descripcion:
              "Ejercicios en grupo con instructores certificados, para adultos y adultos mayores.",
          },
          {
            titulo: "Estacionamiento",
            descripcion:
              "Valet parking en el mismo edificio, con acceso directo al vestidor.",
          },
        ],
      },
    ],
  },

  leon: {
    titulo: "Acuario Leon",
    SEO: {
      metaTitle: "Acuario Leon | Acuario Inbursa",
      metaDescription:
        "Sede Acuario Leon: la mas reciente del grupo, con cursos de natacion y fisioterapia acuatica.",
      keywords: "acuario leon, acuario inbursa, guanajuato",
    },
    ContenidoPagina: [
      {
        id: "spike-home-leon-1",
        __component: "secciones.componente-2-acuario",
        texto_resaltado: "Acuario Leon",
        texto_secundario: "La mas reciente",
        boton: {
          texto: "Ver blog de la sede",
          url: "/leon/blog/",
        },
      },
      {
        id: "spike-home-leon-2",
        __component: "secciones.componente-12-acuario",
        titulo: "Que incluye tu sede",
        subtitulo: "Leon",
        color_fondo: "var(--surface-brand-primary)",
        tarjetas: [
          {
            titulo: "Nado rapido",
            descripcion: "Carriles de veinticinco metros con sistema de semaforo de turno.",
          },
          {
            titulo: "Club de nado",
            descripcion:
              "Programa de membresia con acceso anticipado a talleres y cursos.",
          },
          {
            titulo: "Fisioterapia",
            descripcion: "Cabinas de fisioterapia acuatica con terapeutas certificados.",
          },
        ],
      },
    ],
  },
};

// -----------------------------------------------------------------------------
// Posts - deliberately overlapping between sedes to prove route isolation.
//
//   horario-verano       -> monterrey + guadalajara  (SHARED slug)
//   remodelacion-mty     -> monterrey only           (EXCLUSIVE)
//   corporativo-sala-gdl -> guadalajara only         (EXCLUSIVE)
//   cursos-natacion-leon -> leon only                (EXCLUSIVE)
// -----------------------------------------------------------------------------

const POSTS = {
  monterrey: [
    {
      slug: "horario-verano",
      titulo: "Horario de verano 2025",
      resumen:
        "El horario de verano aplica a las tres sedes. Monterrey abre una hora antes entre semana.",
      fecha: "2025-05-12",
    },
    {
      slug: "remodelacion-monterrey",
      titulo: "Remodelamos la zona de saunas",
      resumen:
        "Cuatro semanas de obra menor en la zona de bienestar de Monterrey, con areas abiertas alternadas.",
      fecha: "2025-04-02",
    },
  ],
  guadalajara: [
    {
      slug: "horario-verano",
      titulo: "Horario de verano 2025",
      resumen:
        "El horario de verano aplica a las tres sedes. Guadalajara mantiene cierre los lunes.",
      fecha: "2025-05-12",
    },
    {
      slug: "corporativo-sala-gdl",
      titulo: "Salas corporativas en Guadalajara",
      resumen:
        "Guadalajara suma cuatro salas para eventos de empresa, con acceso directo desde el estacionamiento.",
      fecha: "2025-03-18",
    },
  ],
  leon: [
    {
      slug: "cursos-natacion-leon",
      titulo: "Cursos de natacion para ninos",
      resumen:
        "Leon abre su programa de cursos de natacion, con grupos separados por edad y nivel.",
      fecha: "2025-06-01",
    },
    {
      slug: "fisioterapia-acuatica-leon",
      titulo: "Fisioterapia acuatica en Leon",
      resumen:
        "Nuevo servicio de fisioterapia acuatica en Leon, con terapeutas certificados y cabinas individuales.",
      fecha: "2025-02-20",
    },
  ],
};

const MONTH_NAMES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/**
 * Home page content for a sede.
 *
 * @param {string} sedeSlug
 * @returns {{
 *   sedeSlug: string,
 *   titulo: string,
 *   SEO: { metaTitle: string, metaDescription: string, keywords?: string },
 *   ContenidoPagina: Array<{ id: string, __component: string }>
 * } | null} `null` when the sede is unknown.
 */
export function getSedeHome(sedeSlug) {
  const sede = getSede(sedeSlug);
  if (!sede) return null;

  const home = HOMES[sede.slug];
  if (!home) return null;

  // Canonical + OG URL point at the sede's own absolute path, so three sedes of
  // the same content type never collide in search results.
  return {
    sedeSlug: sede.slug,
    ...home,
    SEO: {
      ...home.SEO,
      canonicalURL: sedeHomePath(sede.slug),
      openGraph: {
        title: home.SEO.metaTitle,
        description: home.SEO.metaDescription,
      },
    },
  };
}

/**
 * Blog posts belonging to a sede.
 *
 * Each post carries only flat fields (slug / titulo / resumen / fecha). A
 * production version would also expose a `ContenidoPagina` block array; the
 * spike keeps it out so the routing proof stays small.
 *
 * @param {string} sedeSlug
 * @returns {Array<{ sedeSlug: string, slug: string, titulo: string, resumen: string, fecha: string }>}
 *   `[]` when the sede is unknown.
 */
export function getSedePosts(sedeSlug) {
  const sede = getSede(sedeSlug);
  if (!sede) return [];

  return (POSTS[sede.slug] ?? []).map((post) => ({
    sedeSlug: sede.slug,
    ...post,
  }));
}

/**
 * Human-friendly date for a post, formatted without pulling in a locale lib.
 *
 * @param {string} isoDate e.g. "2025-05-12"
 */
export function formatPostDate(isoDate) {
  const [year, month, day] = String(isoDate).split("-");
  const monthName = MONTH_NAMES[Number(month) - 1];
  if (!monthName) return String(isoDate);
  return `${Number(day)} de ${monthName} de ${year}`;
}