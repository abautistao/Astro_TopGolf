import type { APIRoute } from 'astro';
import { getSiteSetup, getStrapiUrl } from '../lib/strapi.js';
export const GET: APIRoute = async () => {
  // URL de la imagen en Strapi
  const setupData = await getSiteSetup();
  const faviconUrl = setupData?.favicon ? getStrapiUrl(setupData.favicon) : '/favicon.svg';

  return new Response(faviconUrl, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};