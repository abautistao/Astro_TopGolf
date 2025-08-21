const STRAPI_API_URL = import.meta.env.STRAPI_API_URL;

async function fetchAPI(endpoint) {
  const url = new URL(endpoint, STRAPI_API_URL);
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

// Ejemplo de cómo podrías añadir más funciones
/*
export async function getPageBySlug(slug) {
  return await fetchAPI(`/pages?filters[slug][$eq]=${slug}`);
}

export async function getAllPages() {
    return await fetchAPI("/pages");
}
*/