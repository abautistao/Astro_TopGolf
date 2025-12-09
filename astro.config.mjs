// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

import sitemap from '@astrojs/sitemap';
import cloudflare from '@astrojs/cloudflare';
import alpinejs from '@astrojs/alpinejs';

// https://astro.build/config
export default defineConfig({
  output: 'server', // Changed to server for SSR support with Cloudflare
  adapter: cloudflare(),
  site: 'http://localhost:4321', // URL para pruebas locales.

  vite: {
    plugins: [tailwindcss()]
  },

  integrations: [sitemap(),alpinejs({
        entrypoint: '/src/entrypoint.ts' 
    })]
});