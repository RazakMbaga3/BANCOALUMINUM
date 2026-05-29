// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';

export default defineConfig({
  integrations: [react()],
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
