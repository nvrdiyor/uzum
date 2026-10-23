import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ScatterMap } from '@/components/charts';
import { niceTicks } from '@/components/charts/series';

export interface MarginMapPoint {
  x: number;
  y: number;
  z: number;
  name: string;
  label: string;
  sku?: string;
}

/*
 * ScatterMap ichidagi o'lchamlar (charts/index.tsx): margin {top 12, right 16,
 * left 0}, Y o'qi 44px, X o'qi Recharts standarti 30px, nuqta maydoni
 * ZAxis range [90, 520] px² — domen [0, eng katta dona].
 */
const AXIS_LEFT = 44;
const PAD_RIGHT = 16;
const PAD_TOP = 12;
const AXIS_BOTTOM = 30;
/** Yozuv plastinkasi: 11px qalin matn + 4px yon chekinish, balandligi 16px */
const LABEL_H = 16;
const LABEL_PAD_X = 4;
const GAP = 5;

interface Box {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

interface PlacedLabel {
  key: string;
  text: string;
  left: number;
  top: number;
}

const hit = (a: Box, b: Box) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;

/** Kesishda oxirida qolgan ajratgich olib tashlanadi: "Jigarrang ·…" emas, "Jigarrang…" */
const TAIL = ' ·—–-,:/';
function cut(s: string, n: number): string {
  if (s.length <= n) return s;
  let head = s.slice(0, n - 1);
  while (head.length > 0 && TAIL.includes(head.charAt(head.length - 1))) head = head.slice(0, -1);
  return `${head}…`;
}

let canvas: HTMLCanvasElement | null = null;
/** Matn kengligi — haqiqiy shriftda o'lchanadi (taxminiy "belgi × 6px" emas) */
function textWidth(text: string): number {
  canvas ??= document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return text.length * 6.4;
  ctx.font = `600 11px ${getComputedStyle(document.body).fontFamily}`;
  return ctx.measureText(text).width;
}

/**
 * Yozuvlarni joylashtirish: har nuqta uchun o'ng, chap, tepa, past —
 * qaysi biri bo'sh bo'lsa. Ustuvorlik tushum bo'yicha (katta tovar avval).
 * Boshqa yozuv yoki nuqtaga tegadigan yozuv avval qisqartiriladi, baribir
 * sig'masa — yozilmaydi: to'liq nom izoh oynasida (hover) bor.
 *
 * Nuqta o'rni ScatterMap'dagi bilan AYNAN bir xil formuladan (o'q
 * chegaralari, radius), kenglik esa haqiqiy o'lchangan.
 */
function placeLabels(points: MarginMapPoint[], avg: number | undefined, width: number, height: number): PlacedLabel[] {
  if (points.length < 2 || width <= 0) return [];

  const xTicks = niceTicks(0, Math.max(1, ...points.map((d) => d.x)), 5);
  const xMax = xTicks[xTicks.length - 1] ?? 1;
  const ys = [...points.map((d) => d.y), ...(avg !== undefined ? [avg] : [])];
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const pad = Math.max(2, (hi - lo) * 0.18);
  const yStep = [1, 2, 5, 10, 20, 50].find((s) => (hi - lo + pad * 2) / s <= 5) ?? 50;
  const yMin = Math.floor((lo - pad) / yStep) * yStep;
  const yMax = Math.ceil((hi + pad) / yStep) * yStep;

  const left = AXIS_LEFT;
  const right = width - PAD_RIGHT;
  const top = PAD_TOP;
  const bottom = height - AXIS_BOTTOM;
  const zMax = Math.max(1, ...points.map((p) => p.z));

  const geo = points.map((p) => {
    const cx = left + (p.x / xMax) * (right - left);
    const cy = bottom - ((p.y - yMin) / (yMax - yMin || 1)) * (bottom - top);
    // Tashqi yorug' halqa (r + 5) ham hisobga olinadi — yozuv unga yopishmasin
    const r = Math.sqrt((90 + (p.z / zMax) * 430) / Math.PI) + 3;
    return { cx, cy, r };
  });
  const dots: Box[] = geo.map((g) => ({ x1: g.cx - g.r, x2: g.cx + g.r, y1: g.cy - g.r, y2: g.cy + g.r }));

  const order = points.map((_, i) => i).sort((a, b) => (points[b]?.x ?? 0) - (points[a]?.x ?? 0));
  const taken: Box[] = [];
  const out: PlacedLabel[] = [];

  for (const i of order) {
    const p = points[i];
    const g = geo[i];
    if (!p || !g || !p.label) continue;
    // Avval to'liqroq, sig'masa qisqaroq yozuv
    for (const text of [cut(p.label, 22), cut(p.label, 13)]) {
      const w = textWidth(text) + LABEL_PAD_X * 2;
      const candidates = [
        { x: g.cx + g.r + GAP, y: g.cy - LABEL_H / 2 },
        { x: g.cx - g.r - GAP - w, y: g.cy - LABEL_H / 2 },
        { x: g.cx - w / 2, y: g.cy - g.r - GAP - LABEL_H },
        { x: g.cx - w / 2, y: g.cy + g.r + GAP },
      ];
      const spot = candidates.find((c) => {
        const box: Box = { x1: c.x, x2: c.x + w, y1: c.y, y2: c.y + LABEL_H };
        // Chizma maydonidan chiqmasin (o'ngda chekka bo'shlig'iga kirishi mumkin)
        if (box.x1 < left + 2 || box.x2 > width - 2 || box.y1 < top || box.y2 > bottom) return false;
        if (taken.some((b) => hit(b, box))) return false;
        return !dots.some((d, j) => j !== i && hit(d, box));
      });
      if (spot) {
        taken.push({ x1: spot.x - 2, x2: spot.x + w + 2, y1: spot.y - 2, y2: spot.y + LABEL_H + 2 });
        out.push({ key: `${p.sku ?? p.name}-${i}`, text, left: spot.x, top: spot.y });
        break;
      }
    }
  }
  return out;
}

/**
 * Marja xaritasi: ScatterMap + to'qnashmaydigan yozuvlar.
 *
 * Ilgari ScatterMap har nuqta yoniga yozuvni o'zi qo'yardi (doim o'ng yoki
 * chap tomonga) va yaqin turgan tovarlar nomi ustma-ust tushib o'qilmasdi
 * ("Idish-tovoq to'pl" ustida "Sport krossovka R…"). Endi ScatterMap'ga bo'sh
 * yozuv beriladi, yozuvlar esa ustidagi qatlamda bo'sh tomonga joylanadi.
 * Variant nomi oldinda ("41 · Sport krossovka…") — u qisqartirishda kesilmaydi.
 */
export function MarginMap({
  points,
  avg,
  xLabel,
  yLabel,
  height = 300,
}: {
  points: MarginMapPoint[];
  avg?: number;
  xLabel: string;
  yLabel: string;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  // Layout effekt: yozuvlar birinchi kadrdayoq to'g'ri joyda chiqsin
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => {
      const w = Math.round(el.getBoundingClientRect().width);
      // Faqat o'zgarganda — har kadrda qayta chizilmasin
      setWidth((prev) => (prev === w ? prev : w));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ScatterMap o'z yozuvini chizmaydi: bo'sh satr `label ?? name` da saqlanadi
  const bare = useMemo(() => points.map((p) => ({ ...p, label: '' })), [points]);
  const labels = useMemo(() => placeLabels(points, avg, width, height), [points, avg, width, height]);

  return (
    <div ref={ref} className="relative w-full min-w-0">
      <ScatterMap data={bare} height={height} xLabel={xLabel} yLabel={yLabel} medianY={avg} />
      {/* Grafik maydoni ScatterMap'ning pastki `height` pikseli (tepasida afsona qatori) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0" style={{ height }} aria-hidden>
        {labels.map((l) => (
          <span
            key={l.key}
            className="absolute whitespace-nowrap rounded-[5px] bg-surface/80 px-1 text-[11px] font-semibold leading-4 text-ink-soft"
            style={{ left: l.left, top: l.top }}
          >
            {l.text}
          </span>
        ))}
      </div>
    </div>
  );
}
