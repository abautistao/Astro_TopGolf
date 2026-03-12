// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

import sitemap from '@astrojs/sitemap';
import cloudflare from '@astrojs/cloudflare';
import alpinejs from '@astrojs/alpinejs';
import { loadEnv } from 'vite';

const { PUBLIC_MULTILANGUAGE, PUBLIC_SITE_URL, PUBLIC_DEFAULT_LOCALE } = loadEnv(process.env.NODE_ENV || 'production', process.cwd(), "");

const isMultiLanguage = PUBLIC_MULTILANGUAGE !== "false";
const defaultLang = PUBLIC_DEFAULT_LOCALE || "en";

/** @type {import('astro/config').AstroUserConfig} */
const config = {
  output: 'server', // Changed to server for SSR support with Cloudflare
  adapter: cloudflare(),
  site: PUBLIC_SITE_URL, // URL para pruebas locales.

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
      i18n: {
        defaultLocale: PUBLIC_DEFAULT_LOCALE, // All urls that don't contain `es` or `fr` after `https://example.com/` will be treated as default locale, i.e. `en`
        locales: {
          en: 'en-US',
          es: 'es-MX',
        },
      }
    }),
    alpinejs({
      entrypoint: '/src/entrypoint.js' // <--- Agrega esto
    })
  ],
  
};

// https://astro.build/config
export default defineConfig(config);