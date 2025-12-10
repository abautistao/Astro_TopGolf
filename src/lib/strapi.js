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
  return await fetchAPI("/setup-site?populate=*");
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

export async function getBlogBySlug(slug) {
  const pages = await fetchAPI(`/blogs?filters[slug][$eq]=${slug}&populate=*`);
  return pages?.[0];
}

export async function getAllBlogs() {
  return await fetchAPI("/blogs");
}

export async function getPromocionBySlug(slug) {
  const pages = await fetchAPI(`/promociones?filters[slug][$eq]=${slug}&populate=*`);
  return pages?.[0];
}

export async function getAllPromociones() {
  return await fetchAPI("/promociones");
}

export async function getHeaderData() {
  return await fetchAPI("/header?populate=*");
}

export async function getFooterData() {
  return await fetchAPI("/footer?populate=*");
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

export const generateFontFaces = (tipografias) => {
  if (!tipografias || tipografias.length === 0) {
    return "";
  }

  const fontFaces = tipografias.map(font => {
    const { familia, peso, estilo, archivo_fuente } = font;
    const url = getStrapiUrl(archivo_fuente.data.attributes);
    const format = url.split('.').pop();

    return `
      @font-face {
        font-family: '${familia}';
        src: url('${url}') format('${format}');
        font-weight: ${peso || 'normal'};
        font-style: ${estilo || 'normal'};
        font-display: swap;
      }
    `;
  }).join('');

  const fontFamilies = tipografias.reduce((acc, font) => {
    const { familia } = font;
    if (familia && !acc.includes(familia)) {
      acc.push(familia);
    }
    return acc;
  }, []);

  const rootStyles = `
    :root {
      ${fontFamilies.map(familia => `--font-${familia.toLowerCase()}: '${familia}', sans-serif;`).join('\n      ')}
    }
  `;

  return fontFaces + rootStyles;
};


export const stringifyRichText = (richText) => {
  if (!richText) return '';
  if (typeof richText === 'string') return richText;

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
        return `<h${block.level}>${processChildren(block.children)}</h${block.level}>`;
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
  }
  return `/${url}`;
};

