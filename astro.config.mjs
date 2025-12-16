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
});