import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html')) return response;

  let html = await response.text();

  // Convierte los <link rel="stylesheet"> de Astro en preloads no bloqueantes
  html = html.replace(
    /<link rel="stylesheet" href="\/_astro\/[^"]+\.css"[^>]*>/g,
    (match) => {
      const href = match.match(/href="([^"]+)"/)?.[1];
      if (!href) return match;
      return `<link rel="preload" as="style" href="${href}" onload="this.onload=null;this.rel='stylesheet'"><noscript>${match}</noscript>`;
    }
  );

  return new Response(html, {
    status: response.status,
    headers: response.headers,
  });
});