// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  output: 'server', // Cambiado a 'hybrid' para renderizado mixto
  site: 'http://localhost:4321', // URL para pruebas locales.

  vite: {
    plugins: [tailwindcss()]
  },

  integrations: [sitemap()]
});