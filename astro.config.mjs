// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

import sitemap from '@astrojs/sitemap';
import cloudflare from '@astrojs/cloudflare';
import alpinejs from '@astrojs/alpinejs';
import { loadEnv } from 'vite';

const { PUBLIC_MULTILANGUAGE, PUBLIC_SITE_URL } = loadEnv(process.env.NODE_ENV || 'production', process.cwd(), "");

const isMultiLanguage = PUBLIC_MULTILANGUAGE !== "false";

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

  integrations: [
    sitemap(),
    alpinejs({
      entrypoint: '/src/entrypoint.js' // <--- Agrega esto
    })
  ]
};

if (isMultiLanguage) {
  config.i18n = {
    defaultLocale: "en",
    locales: ["es", "en"],
    routing: {
      prefixDefaultLocale: true
    }
  };
}

// https://astro.build/config
export default defineConfig(config);