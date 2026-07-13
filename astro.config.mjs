// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://bancoaluminium.com',
  // No client-side framework — the site ships zero framework JS
  integrations: [],
  image: {
    // WebP conversion for all processed images
    format: 'webp',
    // Cache images for performance
    cacheDir: './.astro/image',
    // Optimize images on build
    service: {
      entrypoint: 'astro/assets/services/sharp',
      config: {
        limitInputPixels: false,
      }
    }
  },
  vite: {
    plugins: [tailwindcss()],
  }
});
