/**
 * Sahifalarni yig'ish paytida HTML ga aylantiradi.
 *
 * MUAMMO: sayt mijoz tomonida chiziladi. `curl https://savdoiq.uz/` butun
 * tanasi `<div id="root"></div>` bo'lgan 1,6 KB qaytarardi. Googlebot JS ni
 * ishlata oladi, lekin bu ikkinchi navbatdagi jarayon va yangi, havolasiz
 * domen uchun u haftalab kutishi mumkin. Telegram va Facebook havola
 * ko'ruvchisi esa JS ni UMUMAN ishlatmaydi.
 *
 * YECHIM: `react-dom/server` bilan o'sha React daraxtini Node ichida chizib,
 * natijani `index.html` ichiga joylashtiramiz. Brauzer keyin o'sha joyning
 * ustidan o'z ilovasini chizadi — foydalanuvchi uchun hech narsa o'zgarmaydi.
 *
 * Bu skript `vite build && vite build -c vite.ssr.config.ts` dan KEYIN
 * ishlaydi va uchta narsani chiqaradi:
 *   dist/index.html   — to'ldirilgan bosh sahifa
 *   dist/app.html     — noindex zaxirasi (nginx uni SPA fallback qiladi)
 *   dist/sitemap.xml  — faqat haqiqatan chizilgan sahifalar
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WEB = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const DIST = join(WEB, 'dist');
const SITE = 'https://savdoiq.uz';

/** Sahifa mazmuni o'zgarganda qo'lda yangilanadi — yig'ish vaqtidan OLINMAYDI */
const LASTMOD = '2026-09-19';

/**
 * IndexNow kaliti — Bing va Yandex uchun.
 *
 * Ular yangi sahifa haqida XABAR QILINISHINI qo'llab-quvvatlaydi: oddiy
 * kutishdan ko'ra ancha tez indekslanadi. Kalit fayli
 * apps/web/public/<kalit>.txt da turadi; o'zgartirilsa ikkalasi ham
 * birga o'zgarishi kerak. (Google IndexNow ni qo'llab-quvvatlamaydi —
 * unga Search Console orqali topshiriladi.)
 */
export const INDEXNOW_KEY = '6b5356bf210d4a0001ccb935d0c8480f';

/*
 * Framer Motion boshlang'ich holatni ichki uslub sifatida chizadi.
 * `opacity: 0` bilan kelgan matn robot uchun ko'rinmaydigan matn bo'lib
 * qoladi — bu esa bizga foyda emas, zarar. Animatsiya brauzerda baribir
 * ishlaydi, chunki JS ilova ustidan qayta chizadi.
 */
const stripHiddenStyles = (html) =>
  html.replace(/ style="([^"]*)"/g, (full, css) => {
    const kept = css
      .split(';')
      .filter((part) => !/^\s*(opacity|transform)\s*:/.test(part))
      .join(';')
      .trim();
    return kept ? ` style="${kept}"` : '';
  });

// Windows'da mutlaq yo'l bilan import qilib bo'lmaydi — file:// URL kerak
const { ROUTES, render } = await import(pathToFileURL(join(WEB, '.prerender', 'entry-prerender.js')).href);

const template = readFileSync(join(DIST, 'index.html'), 'utf8');

// ── 1. Har bir marshrut ─────────────────────────────────────────────────
const done = [];
for (const route of ROUTES) {
  let body = stripHiddenStyles(render(route.path, route.lang));

  // Qattiq tekshiruvlar: chala chizilgan sahifa indekslanishdan yomonroq
  if (!body.includes('<h1')) throw new Error(`${route.path}: h1 yo'q — sahifa chizilmadi`);
  if (/opacity\s*:\s*0(?!\.)/.test(body)) throw new Error(`${route.path}: yashirin matn qoldi`);
  if (body.length < 4000) throw new Error(`${route.path}: juda qisqa (${body.length} belgi)`);

  const html = template.replace('<div id="root"></div>', `<div id="root">${body}</div>`);
  if (html === template) throw new Error('index.html ichidagi #root topilmadi');

  const out = route.path === '/' ? DIST : join(DIST, route.path);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'index.html'), html);
  done.push({ ...route, bytes: html.length, text: body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length });
}

// ── 2. SPA zaxirasi ─────────────────────────────────────────────────────
// Bu fayl dist/ ichida haqiqiy fayl bo'lmagan HAR QANDAY manzilga beriladi.
// Ilgari uning o'rnida index.html turardi va natijada mavjud bo'lmagan
// sahifa bosh sahifaning aynan nusxasini 200 bilan qaytarardi.
const shell = template
  .replace(/<meta name="robots"[^>]*>/, '<meta name="robots" content="noindex, follow" />')
  .replace(/\s*<link rel="canonical"[^>]*>/, '')
  .replace(/\s*<link rel="alternate" hreflang[^>]*>/g, '');
if (!shell.includes('noindex, follow')) throw new Error('app.html: robots meta almashtirilmadi');
writeFileSync(join(DIST, 'app.html'), shell);

// ── 3. Sitemap — faqat chizilgan sahifalardan ───────────────────────────
// Bitta siklda yozilgani uchun chizilmagan sahifa sitemap'ga tusha olmaydi.
const urls = done
  .map((r) => `  <url>\n    <loc>${SITE}${r.path}</loc>\n    <lastmod>${LASTMOD}</lastmod>\n  </url>`)
  .join('\n');
writeFileSync(
  join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
);

for (const r of done) {
  console.log(`prerender: ${r.path} — ${Math.round(r.bytes / 1024)} KB HTML, ${r.text} belgi matn`);
}
console.log(`prerender: app.html (noindex) va sitemap.xml (${done.length} ta manzil) yozildi`);
