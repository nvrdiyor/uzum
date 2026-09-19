import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * Yig'ish paytida sahifani HTML ga aylantirish uchun alohida konfiguratsiya.
 *
 * NIMA UCHUN KERAK: sayt mijoz tomonida chiziladi, ya'ni JS ishlatmaydigan
 * har qanday robot `<div id="root"></div>` dan boshqa hech narsa ko'rmaydi.
 * Telegram va Facebook havola ko'ruvchisi JS ni umuman ishlatmaydi, Yandex
 * esa juda cheklangan ishlatadi. Bu fayl `react-dom/server` uchun alohida
 * bild yasaydi, `prerender.mjs` esa uni chaqirib natijani `dist/` ga yozadi.
 *
 * YANGI PAKET QO'SHILMAYDI: react-dom/server va react-router-dom/server
 * allaqachon o'rnatilgan. Bu muhim, chunki `deploy/update.sh` da
 * `npm install` yo'q — yangi bog'liqlik deployni yiqitardi.
 */
export default defineConfig({
  plugins: [react()],
  envDir: path.resolve(__dirname, '../..'),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  ssr: {
    // Hammasi bitta faylga yig'iladi: prerender.mjs ni node_modules
    // yechimlariga bog'lab qo'ymaslik uchun
    noExternal: true,
  },
  build: {
    ssr: 'src/entry-prerender.tsx',
    outDir: '.prerender',
    emptyOutDir: true,
    sourcemap: false,
    /*
     * `manualChunks` ATAYLAB YO'Q.
     *
     * Asosiy konfiguratsiyada u bor, lekin SSR bildida Rollup
     * «"react" cannot be included in manualChunks because it is resolved
     * as an external module» deb qattiq xato beradi.
     */
  },
});
