/** Mahsulot nomi va variant orasidagi ajratgichlar ("Runner Air — 41", "Choyshab, Kulrang") */
const SEP = ' —–-·,:/';

/**
 * Tovar yorlig'i: mahsulot nomi va (bo'lsa) variant — alohida.
 *
 * SKU nomi ikki xil bo'ladi:
 *  - faqat variant («ЧЕРН») — ikki xil tovarning varianti bir xil atalsa,
 *    ro'yxatda ikkita «ЧЕРН» turardi va qaysi biri qaysi tovar ekanini
 *    bilib bo'lmasdi — asosiy nom mahsulotniki, variant yonida;
 *  - "mahsulot — variant" («Sport krossovka Runner Air — 41») — uzun nom
 *    kesilganda aynan variant yo'qolib, uchta qator bir xil "Sport krossovka
 *    Runner Air —…" bo'lib qolardi. Variant ajratiladi va hech qachon kesilmaydi.
 */
export function splitProductName(r: { title: string; productTitle?: string }): { name: string; variant: string } {
  const title = r.title.trim();
  const product = r.productTitle?.trim();
  if (!product) return { name: title, variant: '' };
  const t = title.toLowerCase();
  const p = product.toLowerCase();
  if (t.length > p.length && t.startsWith(p)) {
    let i = product.length;
    while (i < title.length && SEP.includes(title.charAt(i))) i += 1;
    const variant = title.slice(i).trim();
    return variant ? { name: product, variant } : { name: title, variant: '' };
  }
  // Biri ikkinchisining ichida bo'lsa (SKU nomi — mahsulot nomining boshi yoki aksincha), takrorlamaymiz
  if (t.includes(p)) return { name: title, variant: '' };
  if (p.includes(t)) return { name: product, variant: '' };
  return { name: product, variant: title };
}
