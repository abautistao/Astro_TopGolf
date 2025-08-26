const STRAPI_API_URL = import.meta.env.STRAPI_API_URL;

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

export async function getSiteSetup() {
  return await fetchAPI("/setup-site");
}

export async function getPageBySlug(slug) {
  // Usamos 'populate=*' para popular automáticamente todos los niveles de componentes y relaciones.
  // Esto requiere un plugin como '@fourlights/strapi-plugin-deep-populate' en el backend de Strapi.
  const pages = await fetchAPI(`/paginas?filters[slug][$eq]=${slug}&populate=*`);
  return pages?.[0]; // Devuelve el primer elemento o undefined
}

export async function getAllPages() {
    return await fetchAPI("/paginas");
}

export const getStrapiUrl = (media) => {
    // La API de Strapi puede devolver el objeto de medios directamente o dentro de una envoltura 'data'.
    // Esta función ahora comprueba ambas estructuras para ser más robusta.
    const url = media?.data?.attributes?.url || media?.url;
    if (url) {
      const strapiUrl = import.meta.env.PUBLIC_STRAPI_URL || 'http://localhost:1337';
      // Asegurarse de que no haya dobles barras al unir las URLs
      const cleanStrapiUrl = strapiUrl.endsWith('/') ? strapiUrl.slice(0, -1) : strapiUrl;
      const cleanMediaUrl = url.startsWith('/') ? url.slice(1) : url;
      return `${cleanStrapiUrl}/${cleanMediaUrl}`;
    }
    return null;
  }

export const stringifyRichText = (richText) => {
  if (!richText) return '';
  if (typeof richText === 'string') return richText;

  if (Array.isArray(richText)) {
    return richText.map(block =>
      block.children.map((child) => {
        let text = child.text || '';
        if (child.bold) text = `<strong>${text}</strong>`;
        if (child.italic) text = `<em>${text}</em>`;
        if (child.underline) text = `<u>${text}</u>`;
        return text;
      }).join('')
    ).join('<br>');
  }
  return '';
};