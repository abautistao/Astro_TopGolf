const STRAPI_API_URL = import.meta.env.PUBLIC_STRAPI_API_URL;

async function fetchAPI(endpoint) {
  // Asegurarse de que el endpoint no tenga una barra inicial para evitar dobles barras
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  const url = new URL(cleanEndpoint, STRAPI_API_URL);

  try {
    const response = await fetch(url.toString());
    if (!response.ok) {
      console.error(`Error fetching ${url}: ${response.statusText}`);
      return null;
    }
    const { data } = await response.json();
    return data;
  } catch (error) {
    console.error(`Failed to fetch from Strapi: ${error.message}`);
    return null;
  }
}

export async function getSiteSetup(locale = 'en') {
  return await fetchAPI(`/setup-site?locale=${locale}&populate=*`);
}

export async function getPageBySlug(slug, locale = 'en') {
  if (slug === 'blog') {
    const blog = await fetchAPI(`/paginas?filters[slug][$eq]=blog&locale=${locale}&populate[ContenidoPagina][populate]=*&populate[SEO][populate]=*&pagination[pageSize]=100`);
    return blog?.[0];
  }
  
  // 1. Fetch base page data (first level populated)
  const pagesResponse = await fetchAPI(`/paginas?filters[slug][$eq]=${slug}&locale=${locale}&populate=*&pagination[pageSize]=100`);
  const page = pagesResponse?.[0];

  if (!page || !page.ContenidoPagina) return page;

  // 2. Fetch deep populated data for specific complex components
  const deepQuery = `populate[ContenidoPagina][on][secciones.componente-1-acuario][populate][slides][populate]=*&populate[ContenidoPagina][on][secciones.componente-3-acuario][populate][slides][populate]=*&populate[ContenidoPagina][on][secciones.componente-3-acuario][populate][imagen_decorativa][populate]=*&populate[ContenidoPagina][on][secciones.componente-3-acuario][populate][boton][populate]=*&populate[ContenidoPagina][on][secciones.componente-4-acuario][populate][tarjetas][populate][imagen][populate]=*&populate[ContenidoPagina][on][secciones.componente-4-acuario][populate][tarjetas][populate][boton][populate]=*&populate[ContenidoPagina][on][secciones.componente-4-acuario][populate][imagen_decorativa_fondo][populate]=*&populate[ContenidoPagina][on][secciones.componente-4-acuario][populate][icono_decorativo_hover][populate]=*&populate[ContenidoPagina][on][secciones.componente-5-acuario][populate][tarjetas][populate][imagen][populate]=*&populate[ContenidoPagina][on][secciones.componente-5-acuario][populate][imagen_decorativa_fondo][populate]=*&populate[ContenidoPagina][on][secciones.componente-12-acuario][populate][tarjetas][populate][icono][populate]=*&populate[ContenidoPagina][on][secciones.componente-13-acuario][populate][galeria][populate]=*&populate[ContenidoPagina][on][secciones.componente-15-acuario][populate][bloques_contenido][populate][imagen][populate]=*&populate[ContenidoPagina][on][secciones.componente-19-acuario][populate][cards][populate][imagen][populate]=*`;
  const deepDataResponse = await fetchAPI(`/paginas?filters[slug][$eq]=${slug}&locale=${locale}&${deepQuery}&pagination[pageSize]=100`);
  const deepPage = deepDataResponse?.[0];

  // 3. Merge deep populated fields into the main object using INDEX matching
  // (Strapi 5 returns the parent entity's id for every dynamic zone item, so id-based matching
  // always matches the first item and overwrites every component with that one's data.)
  if (deepPage && deepPage.ContenidoPagina) {
    page.ContenidoPagina = page.ContenidoPagina.map((component, index) => {
      const deepComponent = deepPage.ContenidoPagina[index];
      if (!deepComponent || deepComponent.__component !== component.__component) {
        return component;
      }
      if (component.__component === 'secciones.componente-1-acuario') {
        return { ...component, slides: deepComponent.slides };
      }
      if (component.__component === 'secciones.componente-3-acuario') {
        return {
          ...component,
          slides: deepComponent.slides,
          imagen_decorativa: deepComponent.imagen_decorativa,
          boton: deepComponent.boton
        };
      }
      if (component.__component === 'secciones.componente-4-acuario') {
        return {
          ...component,
          tarjetas: deepComponent.tarjetas,
          imagen_decorativa_fondo: deepComponent.imagen_decorativa_fondo,
          icono_decorativo_hover: deepComponent.icono_decorativo_hover
        };
      }
      if (component.__component === 'secciones.componente-5-acuario') {
        return {
          ...component,
          tarjetas: deepComponent.tarjetas,
          imagen_decorativa_fondo: deepComponent.imagen_decorativa_fondo
        };
      }
      if (component.__component === 'secciones.componente-12-acuario') {
        return { ...component, tarjetas: deepComponent.tarjetas };
      }
      if (component.__component === 'secciones.componente-13-acuario') {
        return { ...component, galeria: deepComponent.galeria };
      }
      if (component.__component === 'secciones.componente-15-acuario') {
        return { ...component, bloques_contenido: deepComponent.bloques_contenido };
      }
      if (component.__component === 'secciones.componente-19-acuario') {
        const deepCards = deepComponent.cards;
        if (Array.isArray(deepCards) && deepCards.length > 0) {
          return { ...component, cards: deepCards };
        }
        return component;
      }
      return component;
    });
  }

  return page;
}




export async function getAllPages(locale = 'en') {
  return await fetchAPI(`/paginas?locale=${locale}&pagination[pageSize]=100`);
}

export async function getBlogBySlug(slug, locale = 'en') {
  const pages = await fetchAPI(`/blogs?filters[slug][$eq]=${slug}&locale=${locale}&populate=*`);
  return pages?.[0];
}
export async function getBlogBySlugIndividual(slug, locale = 'en') {
  const pages = await fetchAPI(`/blogs?filters[slug][$eq]=${slug}&locale=${locale}&populate[SEO][populate]=*`);
  return pages?.[0];
}

export async function getAllBlogs(locale = 'en') {
  return await fetchAPI(`/blogs?locale=${locale}`);
}

export async function getBlogsForListing(locale = 'es') {
  return await fetchAPI(
    `/blogs?locale=${locale}` +
      `&populate=*` +
      `&sort=fecha_publicacion:desc` +
      `&pagination[pageSize]=100` +
      `&publicationState=live`
  );
}

export async function getPromocionBySlug(slug, locale = 'en') {
  const query = `filters[slug][$eq]=${slug}&locale=${locale}&populate[ContenidoPagina][populate]=*&pagination[pageSize]=100`;
  const pagesResponse = await fetchAPI(`/promociones?${query}`);
  const page = pagesResponse?.[0];

  if (!page || !page.ContenidoPagina) return page;

  const deepQuery = `populate[ContenidoPagina][on][secciones.componente-1-acuario][populate][slides][populate]=*&populate[ContenidoPagina][on][secciones.componente-3-acuario][populate][slides][populate]=*&populate[ContenidoPagina][on][secciones.componente-3-acuario][populate][imagen_decorativa][populate]=*&populate[ContenidoPagina][on][secciones.componente-3-acuario][populate][boton][populate]=*&populate[ContenidoPagina][on][secciones.componente-4-acuario][populate][tarjetas][populate][imagen][populate]=*&populate[ContenidoPagina][on][secciones.componente-4-acuario][populate][tarjetas][populate][boton][populate]=*&populate[ContenidoPagina][on][secciones.componente-4-acuario][populate][imagen_decorativa_fondo][populate]=*&populate[ContenidoPagina][on][secciones.componente-4-acuario][populate][icono_decorativo_hover][populate]=*&populate[ContenidoPagina][on][secciones.componente-5-acuario][populate][tarjetas][populate][imagen][populate]=*&populate[ContenidoPagina][on][secciones.componente-5-acuario][populate][imagen_decorativa_fondo][populate]=*&populate[ContenidoPagina][on][secciones.componente-8-acuario][populate][tarjetas][populate][imagen_fondo][populate]=*&populate[ContenidoPagina][on][secciones.componente-8-acuario][populate][tarjetas][populate][imagen_logo][populate]=*&populate[ContenidoPagina][on][secciones.componente-8-acuario][populate][tarjetas][populate][boton][populate]=*&populate[ContenidoPagina][on][secciones.componente-9-acuario][populate][elementos_lista][populate]=*&populate[ContenidoPagina][on][secciones.componente-9-acuario][populate][galeria][populate]=*&populate[ContenidoPagina][on][secciones.componente-10-acuario][populate][acordeones][populate]=*&populate[ContenidoPagina][on][secciones.componente-11-acuario][populate][galeria][populate]=*&populate[ContenidoPagina][on][secciones.componente-12-acuario][populate][tarjetas][populate][icono][populate]=*&populate[ContenidoPagina][on][secciones.componente-13-acuario][populate][galeria][populate]=*&populate[ContenidoPagina][on][secciones.componente-15-acuario][populate][bloques_contenido][populate][imagen][populate]=*&populate[ContenidoPagina][on][secciones.componente-19-acuario][populate][cards][populate][imagen][populate]=*&populate[ContenidoPagina][on][secciones.componente-21-acuario][populate][tarjetas][populate][imagen_fondo][populate]=*&populate[ContenidoPagina][on][secciones.componente-21-acuario][populate][tarjetas][populate][imagen_logo][populate]=*&populate[ContenidoPagina][on][secciones.componente-21-acuario][populate][tarjetas][populate][boton][populate]=*`;
  const deepDataResponse = await fetchAPI(`/promociones?filters[slug][$eq]=${slug}&locale=${locale}&${deepQuery}&pagination[pageSize]=100`);
  const deepPage = deepDataResponse?.[0];

  if (deepPage && deepPage.ContenidoPagina) {
    page.ContenidoPagina = page.ContenidoPagina.map((component, index) => {
      const deepComponent = deepPage.ContenidoPagina[index];
      if (!deepComponent || deepComponent.__component !== component.__component) return component;
      if (component.__component === 'secciones.componente-1-acuario') return { ...component, slides: deepComponent.slides };
      if (component.__component === 'secciones.componente-3-acuario') return { ...component, slides: deepComponent.slides, imagen_decorativa: deepComponent.imagen_decorativa, boton: deepComponent.boton };
      if (component.__component === 'secciones.componente-4-acuario') return { ...component, tarjetas: deepComponent.tarjetas, imagen_decorativa_fondo: deepComponent.imagen_decorativa_fondo, icono_decorativo_hover: deepComponent.icono_decorativo_hover };
      if (component.__component === 'secciones.componente-5-acuario') return { ...component, tarjetas: deepComponent.tarjetas, imagen_decorativa_fondo: deepComponent.imagen_decorativa_fondo };
      if (component.__component === 'secciones.componente-8-acuario') return { ...component, tarjetas: deepComponent.tarjetas };
      if (component.__component === 'secciones.componente-9-acuario') return { ...component, elementos_lista: deepComponent.elementos_lista, galeria: deepComponent.galeria };
      if (component.__component === 'secciones.componente-10-acuario') return { ...component, acordeones: deepComponent.acordeones };
      if (component.__component === 'secciones.componente-11-acuario') return { ...component, galeria: deepComponent.galeria };
      if (component.__component === 'secciones.componente-12-acuario') return { ...component, tarjetas: deepComponent.tarjetas };
      if (component.__component === 'secciones.componente-13-acuario') return { ...component, galeria: deepComponent.galeria };
      if (component.__component === 'secciones.componente-15-acuario') return { ...component, bloques_contenido: deepComponent.bloques_contenido };
      if (component.__component === 'secciones.componente-19-acuario') {
        const deepCards = deepComponent.cards;
        if (Array.isArray(deepCards) && deepCards.length > 0) {
          return { ...component, cards: deepCards };
        }
        return component;
      }
      if (component.__component === 'secciones.componente-21-acuario') return { ...component, tarjetas: deepComponent.tarjetas };
      return component;
    });
  }

  return page;
}

export async function getAllPromociones(locale = 'en') {
  return await fetchAPI(`/promociones?locale=${locale}`);
}

export async function getPaseBySlug(slug, locale = 'en') {
  // Fetch pase data with deep populate for Acuario components
  const query = `filters[slug][$eq]=${slug}&locale=${locale}&populate[ContenidoPagina][populate]=*&populate[SEO][populate]=*&pagination[pageSize]=100`;
  const pagesResponse = await fetchAPI(`/pases?${query}`);
  const page = pagesResponse?.[0];

  if (!page || !page.ContenidoPagina) return page;

  // Fetch deep populated data for specific complex components
  const deepQuery = `populate[ContenidoPagina][on][secciones.componente-1-acuario][populate][slides][populate]=*&populate[ContenidoPagina][on][secciones.componente-3-acuario][populate][slides][populate]=*&populate[ContenidoPagina][on][secciones.componente-3-acuario][populate][imagen_decorativa][populate]=*&populate[ContenidoPagina][on][secciones.componente-3-acuario][populate][boton][populate]=*&populate[ContenidoPagina][on][secciones.componente-4-acuario][populate][tarjetas][populate][imagen][populate]=*&populate[ContenidoPagina][on][secciones.componente-4-acuario][populate][tarjetas][populate][boton][populate]=*&populate[ContenidoPagina][on][secciones.componente-4-acuario][populate][imagen_decorativa_fondo][populate]=*&populate[ContenidoPagina][on][secciones.componente-4-acuario][populate][icono_decorativo_hover][populate]=*&populate[ContenidoPagina][on][secciones.componente-5-acuario][populate][tarjetas][populate][imagen][populate]=*&populate[ContenidoPagina][on][secciones.componente-5-acuario][populate][imagen_decorativa_fondo][populate]=*&populate[ContenidoPagina][on][secciones.componente-9-acuario][populate][elementos_lista][populate]=*&populate[ContenidoPagina][on][secciones.componente-9-acuario][populate][galeria][populate]=*&populate[ContenidoPagina][on][secciones.componente-10-acuario][populate][acordeones][populate]=*&populate[ContenidoPagina][on][secciones.componente-11-acuario][populate][galeria][populate]=*&populate[ContenidoPagina][on][secciones.componente-12-acuario][populate][tarjetas][populate][icono][populate]=*&populate[ContenidoPagina][on][secciones.componente-13-acuario][populate][galeria][populate]=*&populate[ContenidoPagina][on][secciones.componente-15-acuario][populate][bloques_contenido][populate][imagen][populate]=*&populate[ContenidoPagina][on][secciones.componente-19-acuario][populate][cards][populate][imagen][populate]=*`;
  const deepDataResponse = await fetchAPI(`/pases?filters[slug][$eq]=${slug}&locale=${locale}&${deepQuery}&pagination[pageSize]=100`);
  const deepPage = deepDataResponse?.[0];

  // Merge deep populated fields using INDEX matching (Strapi 5 returns parent's id for all dynamic zone items)
  if (deepPage && deepPage.ContenidoPagina) {
    page.ContenidoPagina = page.ContenidoPagina.map((component, index) => {
      const deepComponent = deepPage.ContenidoPagina[index];
      if (!deepComponent || deepComponent.__component !== component.__component) return component;
      if (component.__component === 'secciones.componente-1-acuario') return { ...component, slides: deepComponent.slides };
      if (component.__component === 'secciones.componente-3-acuario') return { ...component, slides: deepComponent.slides, imagen_decorativa: deepComponent.imagen_decorativa, boton: deepComponent.boton };
      if (component.__component === 'secciones.componente-4-acuario') return { ...component, tarjetas: deepComponent.tarjetas, imagen_decorativa_fondo: deepComponent.imagen_decorativa_fondo, icono_decorativo_hover: deepComponent.icono_decorativo_hover };
      if (component.__component === 'secciones.componente-5-acuario') return { ...component, tarjetas: deepComponent.tarjetas, imagen_decorativa_fondo: deepComponent.imagen_decorativa_fondo };
      if (component.__component === 'secciones.componente-9-acuario') return { ...component, elementos_lista: deepComponent.elementos_lista, galeria: deepComponent.galeria };
      if (component.__component === 'secciones.componente-10-acuario') return { ...component, acordeones: deepComponent.acordeones };
      if (component.__component === 'secciones.componente-11-acuario') return { ...component, galeria: deepComponent.galeria };
      if (component.__component === 'secciones.componente-12-acuario') return { ...component, tarjetas: deepComponent.tarjetas };
      if (component.__component === 'secciones.componente-13-acuario') return { ...component, galeria: deepComponent.galeria };
      if (component.__component === 'secciones.componente-15-acuario') return { ...component, bloques_contenido: deepComponent.bloques_contenido };
      if (component.__component === 'secciones.componente-19-acuario') return { ...component, cards: deepComponent.cards };
      return component;
    });
  }

  return page;
}

export async function getAllPases(locale = 'en') {
  return await fetchAPI(`/pases?locale=${locale}`);
}

export async function getExperienciaBySlug(slug, locale = 'en') {
  const query = `filters[slug][$eq]=${slug}&locale=${locale}&populate[ContenidoPagina][populate]=*&populate[SEO][populate]=*&pagination[pageSize]=100`;
  const pagesResponse = await fetchAPI(`/experiencias?${query}`);
  const page = pagesResponse?.[0];

  if (!page || !page.ContenidoPagina) return page;

  const deepQuery = `populate[ContenidoPagina][on][secciones.componente-1-acuario][populate][slides][populate]=*&populate[ContenidoPagina][on][secciones.componente-3-acuario][populate][slides][populate]=*&populate[ContenidoPagina][on][secciones.componente-3-acuario][populate][imagen_decorativa][populate]=*&populate[ContenidoPagina][on][secciones.componente-3-acuario][populate][boton][populate]=*&populate[ContenidoPagina][on][secciones.componente-4-acuario][populate][tarjetas][populate][imagen][populate]=*&populate[ContenidoPagina][on][secciones.componente-4-acuario][populate][tarjetas][populate][boton][populate]=*&populate[ContenidoPagina][on][secciones.componente-4-acuario][populate][imagen_decorativa_fondo][populate]=*&populate[ContenidoPagina][on][secciones.componente-4-acuario][populate][icono_decorativo_hover][populate]=*&populate[ContenidoPagina][on][secciones.componente-5-acuario][populate][tarjetas][populate][imagen][populate]=*&populate[ContenidoPagina][on][secciones.componente-5-acuario][populate][imagen_decorativa_fondo][populate]=*&populate[ContenidoPagina][on][secciones.componente-9-acuario][populate][elementos_lista][populate]=*&populate[ContenidoPagina][on][secciones.componente-9-acuario][populate][galeria][populate]=*&populate[ContenidoPagina][on][secciones.componente-10-acuario][populate][acordeones][populate]=*&populate[ContenidoPagina][on][secciones.componente-11-acuario][populate][galeria][populate]=*&populate[ContenidoPagina][on][secciones.componente-12-acuario][populate][tarjetas][populate][icono][populate]=*&populate[ContenidoPagina][on][secciones.componente-13-acuario][populate][galeria][populate]=*&populate[ContenidoPagina][on][secciones.componente-14-acuario][populate]=*&populate[ContenidoPagina][on][secciones.componente-15-acuario][populate][bloques_contenido][populate][imagen][populate]=*&populate[ContenidoPagina][on][secciones.componente-19-acuario][populate][cards][populate][imagen][populate]=*`;
  const deepDataResponse = await fetchAPI(`/experiencias?filters[slug][$eq]=${slug}&locale=${locale}&${deepQuery}&pagination[pageSize]=100`);
  const deepPage = deepDataResponse?.[0];

  if (deepPage && deepPage.ContenidoPagina) {
    page.ContenidoPagina = page.ContenidoPagina.map((component, index) => {
      const deepComponent = deepPage.ContenidoPagina[index];
      if (!deepComponent || deepComponent.__component !== component.__component) return component;
      if (component.__component === 'secciones.componente-1-acuario') return { ...component, slides: deepComponent.slides };
      if (component.__component === 'secciones.componente-3-acuario') return { ...component, slides: deepComponent.slides, imagen_decorativa: deepComponent.imagen_decorativa, boton: deepComponent.boton };
      if (component.__component === 'secciones.componente-4-acuario') return { ...component, tarjetas: deepComponent.tarjetas, imagen_decorativa_fondo: deepComponent.imagen_decorativa_fondo, icono_decorativo_hover: deepComponent.icono_decorativo_hover };
      if (component.__component === 'secciones.componente-5-acuario') return { ...component, tarjetas: deepComponent.tarjetas, imagen_decorativa_fondo: deepComponent.imagen_decorativa_fondo };
      if (component.__component === 'secciones.componente-9-acuario') return { ...component, elementos_lista: deepComponent.elementos_lista, galeria: deepComponent.galeria };
      if (component.__component === 'secciones.componente-10-acuario') return { ...component, acordeones: deepComponent.acordeones };
      if (component.__component === 'secciones.componente-11-acuario') return { ...component, galeria: deepComponent.galeria };
      if (component.__component === 'secciones.componente-12-acuario') return { ...component, tarjetas: deepComponent.tarjetas };
      if (component.__component === 'secciones.componente-13-acuario') return { ...component, galeria: deepComponent.galeria };
      if (component.__component === 'secciones.componente-15-acuario') return { ...component, bloques_contenido: deepComponent.bloques_contenido };
      if (component.__component === 'secciones.componente-19-acuario') {
        const deepCards = deepComponent.cards;
        if (Array.isArray(deepCards) && deepCards.length > 0) {
          return { ...component, cards: deepCards };
        }
        return component;
      }
      return component;
    });
  }

  return page;
}

export async function getAllExperiencias(locale = 'en') {
  return await fetchAPI(`/experiencias?locale=${locale}`);
}

export async function getHeaderData(locale = 'en') {
  const headerData = await fetchAPI(`/header?locale=${locale}&populate=*`);
  
  // To fetch nested sublinks inside dynamic zones (which populate=* does not cover natively in Strapi 5)
  // We make a parallel query and merge the sublinks.
  const variantsQuery = `populate[Variante][on][header.header-acuario][populate][links][populate]=sublinks&populate[Variante][on][header.header-dolphinaris][populate][links][populate]=sublinks&populate[Variante][on][header.header-blu][populate][links][populate]=dropdown_items`;
  const variantsData = await fetchAPI(`/header?locale=${locale}&${variantsQuery}`);

  if (headerData && variantsData && headerData.Variante && variantsData.Variante) {
    headerData.Variante.forEach((component, i) => {
      if (variantsData.Variante[i] && variantsData.Variante[i].links) {
        component.links = variantsData.Variante[i].links;
      }
    });
  }

  return headerData;
}

export async function getFooterData(locale = 'en') {
  return await fetchAPI(`/footer?locale=${locale}&populate=*`);
}

export const getStrapiUrl = (media) => {
  // La API de Strapi puede devolver el objeto de medios directamente o dentro de una envoltura 'data'.
  // Esta función ahora comprueba ambas estructuras para ser más robusta.
  const url = media?.data?.attributes?.url || media?.url;
  if (url) {
    if (url.startsWith('http')) return url;
    const strapiUrl = import.meta.env.PUBLIC_STRAPI_URL || 'http://localhost:1337';
    // Asegurarse de que no haya dobles barras al unir las URLs
    const cleanStrapiUrl = strapiUrl.endsWith('/') ? strapiUrl.slice(0, -1) : strapiUrl;
    const cleanMediaUrl = url.startsWith('/') ? url.slice(1) : url;
    return `${cleanStrapiUrl}/${cleanMediaUrl}`;
  }
  return null;
}

const FONT_FORMAT_MAP = {
  woff2: 'woff2',
  woff: 'woff',
  ttf: 'truetype',
  otf: 'opentype',
  eot: 'embedded-opentype',
  svg: 'svg',
};

const getFontFormat = (url) => {
  if (!url) return '';
  const cleanUrl = url.split('?')[0].split('#')[0];
  const ext = cleanUrl.split('.').pop().toLowerCase();
  return FONT_FORMAT_MAP[ext] || ext;
};

const VALID_FONT_WEIGHTS = new Set(['normal', 'bold', 'lighter', 'bolder', 'inherit', 'initial', 'unset', 'revert']);
const sanitizeFontWeight = (peso) => {
  if (peso == null) return 'normal';
  const trimmed = String(peso).trim();
  if (VALID_FONT_WEIGHTS.has(trimmed)) return trimmed;
  if (/^\d{1,3}$/.test(trimmed)) {
    const n = +trimmed;
    if (n >= 100 && n <= 900) return trimmed;
  }
  return 'normal';
};

export const generateFontFaces = (tipografias) => {
  if (!tipografias || tipografias.length === 0) {
    return "";
  }

  const fontFaces = tipografias.map(font => {
    const { familia, peso, estilo } = font;
    const url = getStrapiUrl(font.archivo_fuente);
    if (!url || !familia) return '';
    const format = getFontFormat(url);

    return `
      @font-face {
        font-family: '${familia}';
        src: url('${url}') format('${format}');
        font-weight: ${sanitizeFontWeight(peso)};
        font-style: ${estilo || 'normal'};
        font-display: swap;
      }
    `;
  }).filter(Boolean).join('');

  const fontFamilies = [...new Set(
    tipografias
      .map(f => f.familia)
      .filter(Boolean)
  )];

  const rootStyles = `
    :root {
      ${fontFamilies.map(familia => `--font-${familia.toLowerCase()}: '${familia}', sans-serif;`).join('\n      ')}
    }
  `;

  return fontFaces + rootStyles;
};


export const stringifyRichText = (richText) => {
  if (!richText) return '';
  if (typeof richText === 'string') {
    let html = richText
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    const paragraphs = html.split(/\n\s*\n/).filter(p => p.trim());
    if (paragraphs.length === 0) return '';
    if (paragraphs.length === 1 && !paragraphs[0].includes('\n')) return paragraphs[0];
    return paragraphs.map(p => `<p>${p.replace(/\n/g, '<br/>')}</p>`).join('');
  }

  // Helper to process individual text nodes (bold, italic, etc.)
  const processTextNode = (node) => {
    let text = node.text || '';
    // Basic HTML escaping for security
    // Basic HTML escaping for security - REMOVED to allow HTML tags
    // text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // Handle line breaks
    text = text.replace(/\n/g, '<br/>');
    if (node.bold) text = `<strong>${text}</strong>`;
    if (node.italic) text = `<em>${text}</em>`;
    if (node.underline) text = `<u>${text}</u>`;
    if (node.strikethrough) text = `<s>${text}</s>`;
    if (node.code) text = `<code>${text}</code>`;
    return text;
  };

  // Helper to process a block's children (a mix of text nodes and links)
  const processChildren = (children) => {
    return children.map(child => {
      if (child.type === 'link') {
        const linkText = processChildren(child.children);
        // Handle both internal and external links
        const isExternal = child.url.startsWith('http');
        const target = isExternal ? '_blank' : '_self';
        const rel = isExternal ? 'noopener noreferrer' : '';
        return `<a href="${formatUrl(child.url)}" target="${target}" rel="${rel}">${linkText}</a>`;
      }
      return processTextNode(child);
    }).join('');
  };

  // Main function to process each block in the Rich Text array
  const processBlock = (block) => {
    switch (block.type) {
      case 'paragraph':
        const content = processChildren(block.children);
        return `<p>${content || '<br/>'}</p>`;
      case 'heading':
        const innerText = block.children.map(c => c.text || '').join('');
        const id = innerText.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        return `<h${block.level} id="${id}">${processChildren(block.children)}</h${block.level}>`;
      case 'list':
        const tag = block.format === 'ordered' ? 'ol' : 'ul';
        const items = block.children.map(item => `<li>${processChildren(item.children)}</li>`).join('');
        return `<${tag}>${items}</${tag}>`;
      case 'quote':
        return `<blockquote>${processChildren(block.children)}</blockquote>`;
      case 'code':
        return `<pre><code>${processChildren(block.children)}</code></pre>`;
      case 'image':
        const imageUrl = getStrapiUrl({ data: { attributes: block.image } });
        return `<img src="${imageUrl}" alt="${block.image.alternativeText || ''}" />`;
      default:
        // Fallback for unknown block types
        return `<p>${processChildren(block.children)}</p>`;
    }
  };

  if (Array.isArray(richText)) {
    return richText.map(processBlock).join('');
  }

  return '';
};

export const formatUrl = (url) => {
  if (!url) return '#';
  if (url.startsWith('http') || url.startsWith('https') || url.startsWith('/')) {
    return url;
  } else if (url.startsWith('#')) {
    return `${url}`;
  }
  return `/${url}`;
};

export const getLocalizedUrl = (url, locale = 'en') => {
  if (!url) return '#';
  // Return external links, anchors, etc as is
  if (url.startsWith('http') || url.startsWith('https') || url.startsWith('#') || url.startsWith('mailto:') || url.startsWith('tel:')) {
    return url;
  }

  // Remove leading slash for consistency
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;

  // Check multi-language config
  const isMultiLanguage = import.meta.env.PUBLIC_MULTILANGUAGE !== 'false'; // Default to true if not set
  const defaultLocale = import.meta.env.PUBLIC_DEFAULT_LOCALE || 'en';

  if (!isMultiLanguage || locale === defaultLocale) {
    // Si la ruta original era vacía o '/', devuelve '/' en lugar de '//'
    if (cleanPath === '') return '/';
    return `/${cleanPath}`;
  }

  if (cleanPath === '') return `/${locale}`;
  return `/${locale}/${cleanPath}`;
};

