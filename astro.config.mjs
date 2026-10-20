// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

import sitemap from '@astrojs/sitemap';
import cloudflare from '@astrojs/cloudflare';
import alpinejs from '@astrojs/alpinejs';
import { loadEnv } from 'vite';
import partytown from '@astrojs/partytown';

const { PUBLIC_MULTILANGUAGE, PUBLIC_SITE_URL, PUBLIC_DEFAULT_LOCALE } = loadEnv(process.env.NODE_ENV || 'production', process.cwd(), "");

const isMultiLanguage = PUBLIC_MULTILANGUAGE !== "false";
const defaultLang = PUBLIC_DEFAULT_LOCALE || "en";

/** @type {import('astro/config').AstroUserConfig} */
const config = {
  output: 'static',
  adapter: cloudflare(),
  site: PUBLIC_SITE_URL,
  build: {
    // 'auto' permite que archivos pequeños se inyecten y los grandes (como el CSS de 77KB) 
    // se sirvan desde /_astro/* aprovechando el Cache-Control inmutable de Cloudflare
    inlineStylesheets: 'auto'
  },
  image: {
    domains: ['localhost', '127.0.0.1'],
    remotePatterns: [{ protocol: "https" }],
  },

  vite: {
    plugins: [tailwindcss()]
  },

  i18n: {
    defaultLocale: defaultLang,
    locales: isMultiLanguage ? ["es", "en"] : [defaultLang],
    routing: {
      prefixDefaultLocale: false 
    }
  },

  integrations: [
    sitemap({
      i18n: isMultiLanguage ? {
        defaultLocale: defaultLang,
        locales: {
          en: 'en-US',
          es: 'es-ES',
        },
      } : undefined,
    }),
    alpinejs({
      entrypoint: '/src/entrypoint.js'
    }),
    partytown({
      config: {
        forward: ["dataLayer.push"],
        resolveUrl: function (url, location, type) {
          if (type === 'script' && url.hostname === 'connect.facebook.net') {
            const proxyUrl = new URL('https://cdn.builder.io/api/v1/proxy-api');
            proxyUrl.searchParams.append('url', url.href);
            return proxyUrl;
          }
          return url;
        },
      },
    }),
  ],
};

export default defineConfig(config);