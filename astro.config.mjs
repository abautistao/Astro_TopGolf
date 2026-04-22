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
  output: 'server', // Changed to server for SSR support with Cloudflare
  adapter: cloudflare(),
  site: PUBLIC_SITE_URL, // URL para pruebas locales.
  build: {
    inlineStylesheets: 'always'
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
    // Si no es multi-idioma, solo cargamos el default para que mapee la carpeta
    locales: isMultiLanguage ? ["es", "en"] : [defaultLang],
    routing: {
      // ESTA ES LA CLAVE: 'false' hace que /es/ se convierta en /
      prefixDefaultLocale: isMultiLanguage ? true : false 
    }
  },

  integrations: [
    sitemap({
      // Configuración para multiidioma
      i18n: isMultiLanguage ? {
        defaultLocale: defaultLang,
        locales: {
          en: 'en-US',
          es: 'es-ES',
        },
      } : undefined,
    }),
    alpinejs({
      entrypoint: '/src/entrypoint.js' // <--- Agrega esto
    }),
    // partytown({
    //   config: {
    //     forward: ["dataLayer.push"],
    //     // ESTO ES LO QUE FALTA:
    //     resolveUrl: function (url, location, type) {
    //       if (type === 'script' && url.hostname === 'connect.facebook.net') {
    //         const proxyUrl = new URL('https://cdn.builder.io/api/v1/proxy-api');
    //         proxyUrl.searchParams.append('url', url.href);
    //         return proxyUrl;
    //       }
    //       return url;
    //     },
    //   },
    // }),
  ],
  
};

// https://astro.build/config
export default defineConfig(config);