// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  output: 'static', // Cambiado a 'static' para generar archivos HTML/CSS/JS
  site: 'http://localhost:4321', // URL para pruebas locales.

  vite: {
    plugins: [tailwindcss()]
  },

  integrations: [sitemap()]
});