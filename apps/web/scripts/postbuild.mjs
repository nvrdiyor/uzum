/**
 * Yig'ishdan keyingi ikkita fayl: `app.html` va `sitemap.xml`.
 *
 * app.html — SPA zaxirasi.
 *   nginx `try_files $uri $uri/ /app.html` qiladi, ya'ni dist/ ichida
 *   haqiqiy fayl bo'lmagan HAR QANDAY manzil shu faylga tushadi. Ilgari
 *   u index.html edi va natijada https://savdoiq.uz/bunday-sahifa-yoq
 *   bosh sahifaning AYNAN nusxasini 200 bilan qaytarardi — Google buni
 *   «soft 404» deb belgilaydi va indekslash byudjetini behuda sarflaydi.
 *   Endi zaxira `noindex, follow` bilan keladi: hisobga kirgandan keyingi
 *   sahifalar (/dashboard, /sales…) ham shu orqali indeksdan chiqadi.
 *
 *   robots.txt da Disallow ishlatilmadi: yopilgan sahifadagi noindex'ni
 *   qidiruv tizimi o'qiy olmaydi — ikkita mexanizm bir-birini bekor qiladi.
 *
 * sitemap.xml — quyidagi ro'yxatdan chiqariladi, qo'lda yozilmaydi.
 *   `changefreq` va `priority` ataylab yo'q: Google ikkalasini ham
 *   e'tiborsiz qoldirishini ochiq aytgan. `lastmod` esa yig'ish vaqtidan
 *   EMAS, quyidagi qo'lda yoziladigan sanadan olinadi — har yig'ishda
 *   o'zgaradigan lastmod qidiruv tizimini faylga ishonmaslikka o'rgatadi.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist');
const SITE = 'https://savdoiq.uz';

/** Indekslanadigan sahifalar. Yangi sahifa qo'shilganda shu yerga yoziladi. */
const PAGES = [{ path: '/', lastmod: '2026-09-19' }];

// ── app.html ────────────────────────────────────────────────────────────
const index = readFileSync(join(DIST, 'index.html'), 'utf8');

const shell = index
  .replace(
    /<meta name="robots"[^>]*>/,
    '<meta name="robots" content="noindex, follow" />',
  )
  // Kanonik havola zaxira nusxada noto'g'ri bo'ladi: u har qanday manzilda
  // bosh sahifani ko'rsatib, mavjud bo'lmagan sahifalarni bosh sahifaning
  // nusxasi deb e'lon qilardi
  .replace(/\s*<link rel="canonical"[^>]*>/, '')
  .replace(/\s*<link rel="alternate" hreflang[^>]*>/g, '');

if (!shell.includes('noindex, follow')) {
  throw new Error('app.html: robots meta almashtirilmadi — index.html o’zgarganmi?');
}
writeFileSync(join(DIST, 'app.html'), shell);

// ── sitemap.xml ─────────────────────────────────────────────────────────
const urls = PAGES.map(
  (p) => `  <url>\n    <loc>${SITE}${p.path}</loc>\n    <lastmod>${p.lastmod}</lastmod>\n  </url>`,
).join('\n');

writeFileSync(
  join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
);

console.log(`postbuild: app.html (noindex) va sitemap.xml (${PAGES.length} ta manzil) yozildi`);
