/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        primary: 'var(--primary-color)',
        secondary: 'var(--secondary-color)',
      },
      fontFamily: {
        sans: ['var(--font-family-base)', 'sans-serif'],
      },
      fontSize: {
        'h1': 'var(--h1-font-size)',
      }
    },
  },
  plugins: [],
}