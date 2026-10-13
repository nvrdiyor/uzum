import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  // .env monorepo ildizida turadi — VITE_* o'zgaruvchilar shu yerdan o'qiladi
  envDir: path.resolve(__dirname, '../..'),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Workspace paketlari manba sifatida ishlatiladi — oldindan bundlanmasin,
  // aks holda ular qayta yig'ilganda Vite eski keshni ko'rsatadi.
  optimizeDeps: {
    exclude: ['@savdoiq/shared', '@savdoiq/db'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY ?? 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  // `vite preview` `server.proxy` dan foydalanmaydi — yig'ilgan bildni
  // lokal API bilan sinash uchun alohida sozlama kerak
  preview: {
    port: 5174,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY ?? 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          /*
           * `clsx` shu yerda ATAYLAB turibdi. U recharts'ning ham, ilovaning
           * ham bog'liqligi: bu ro'yxatda bo'lmasa `charts` bo'lagiga tushadi
           * va kirish fayli uni o'sha yerdan import qiladi — natijada 118 KB
           * (gzip) grafik kutubxonasi har bir sahifada, hatto kirish sahifasida
           * ham birinchi bo'lib yuklanardi. Bo'laklar tartib bilan to'ldiriladi,
           * shuning uchun umumiy bog'liqlik birinchisida qoladi.
           */
          react: ['react', 'react-dom', 'react-router-dom', 'clsx'],
          charts: ['recharts'],
          motion: ['framer-motion'],
        },
      },
    },
  },
});
