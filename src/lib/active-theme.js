// Tema activo del frontend: una sola fuente de verdad.
//
// `PUBLIC_THEME` es la marca del sitio. `PUBLIC_DEV_THEME` la sobreescribe
// durante el desarrollo (documentado en AGENTS.md) para poder trabajar un
// theme sin tocar el de producción.
//
// "sealands" es alias de "sealand": la marca se escribe de las dos formas en la
// documentación, pero el nombre del theme en el código es "sealand".
const devTheme = import.meta.env.DEV ? import.meta.env.PUBLIC_DEV_THEME : undefined;

const raw = devTheme || import.meta.env.PUBLIC_THEME || "toca";

const ALIASES = { sealands: "sealand" };

export const ACTIVE_THEME = ALIASES[raw] ?? raw;

/** El theme activo es Sealand: la copia de Acuario con su propia implementación. */
export const IS_SEALAND = ACTIVE_THEME === "sealand";
