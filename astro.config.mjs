// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

import sitemap from '@astrojs/sitemap';
import node from '@astrojs/node';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: node({
    mode: 'standalone'
  }),
  site: 'http://localhost:4321', // URL para pruebas locales.

  vite: {
    plugins: [tailwindcss()]
  },

  integrations: [sitemap()]
});