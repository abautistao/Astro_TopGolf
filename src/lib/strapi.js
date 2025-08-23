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
  // Usamos un populate anidado para asegurarnos de que traiga los datos de los componentes dentro de la zona dinámica.
  // Específicamente, le pedimos que popule todos los campos (*) de los componentes que estén en 'ContenidoPagina'.
  const pages = await fetchAPI(`/paginas?filters[slug][$eq]=${slug}&populate[ContenidoPagina][populate]=*`);
  return pages?.[0]; // Devuelve el primer elemento o undefined
}

export async function getAllPages() {
    return await fetchAPI("/paginas");
}