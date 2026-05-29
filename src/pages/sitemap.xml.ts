import { getAllPages } from '../lib/strapi';

const PUBLIC_SITE_URL = import.meta.env.PUBLIC_SITE_URL;

export async function GET() {
  // 1. Define tus páginas estáticas conocidas

  // 2. (Opcional) Si tienes contenido dinámico de colecciones (ej. un Blog)
  const paginas = await getAllPages();

  // Juntamos todas las URLs
  const todasLasUrls = paginas;
  console.log("urls", todasLasUrls)

  // 3. Construimos la estructura XML obligatoria para Google
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    ${todasLasUrls.map(url => `
      <url>
        <loc>${PUBLIC_SITE_URL}/${url.slug}</loc>
      </url>
    `).join('')}
  </urlset>`.trim();

  // 4. Retornamos la respuesta con las cabeceras XML correctas y caché para optimizar el servidor
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      // 'Cache-Control': 'public, max-age=3600, s-maxage=86400' // Almacena en caché por 1 hora/1 día
    }
  });
}