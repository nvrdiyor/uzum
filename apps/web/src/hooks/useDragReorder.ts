import { useState, type DragEvent } from 'react';

/**
 * Jadval qatorlarini sudrab tartiblash (HTML5 drag-and-drop).
 *
 * Faqat TUTQICH sudraladi (`handleProps`), qatorning o'zi emas — aks holda
 * qator ichidagi kataklarda matnni belgilab bo'lmay qolardi. Qator ustida
 * sichqon qatorning yuqori yoki pastki yarmida turganiga qarab tashlash joyi
 * "oldin" yoki "keyin" bo'ladi; `dropPosition` shu chiziqni chizish uchun.
 *
 * Sensorli ekranda HTML5 sudrash ishlamaydi — u yerda chaqiruvchi sahifa
 * ↑/↓ tugmalarini ko'rsatadi, `onMove` ikkalasi uchun bitta.
 */
export function useDragReorder(onMove: (from: number, to: number) => void) {
  const [from, setFrom] = useState<number | null>(null);
  const [over, setOver] = useState<{ index: number; after: boolean } | null>(null);

  const reset = () => {
    setFrom(null);
    setOver(null);
  };

  const handleProps = (index: number) => ({
    draggable: true,
    onDragStart: (e: DragEvent<HTMLElement>) => {
      setFrom(index);
      e.dataTransfer.effectAllowed = 'move';
      // Firefox ma'lumotsiz sudrashni boshlamaydi
      e.dataTransfer.setData('text/plain', String(index));
    },
    onDragEnd: reset,
  });

  const rowProps = (index: number) => ({
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (from === null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const box = e.currentTarget.getBoundingClientRect();
      const after = e.clientY > box.top + box.height / 2;
      setOver((prev) => (prev && prev.index === index && prev.after === after ? prev : { index, after }));
    },
    onDrop: (e: DragEvent<HTMLElement>) => {
      if (from === null) return;
      e.preventDefault();
      const after = over && over.index === index ? over.after : false;
      // Qator o'z joyidan olingach keyingilar bir qadam yuqoriga suriladi
      let to = after ? index + 1 : index;
      if (from < to) to -= 1;
      if (to !== from) onMove(from, to);
      reset();
    },
  });

  /** Shu qator ustida tashlash chizig'i qayerda chizilsin */
  const dropPosition = (index: number): 'before' | 'after' | null =>
    from !== null && over && over.index === index && from !== index ? (over.after ? 'after' : 'before') : null;

  return { dragging: from, handleProps, rowProps, dropPosition };
}

/** Tashlash chizig'i — kataklarga ichki soya (tr'da soya border-collapse bilan chizilmaydi) */
const DROP_LINE = {
  before: '[&>td]:shadow-[inset_0_2px_0_0_rgb(var(--c-brand))]',
  after: '[&>td]:shadow-[inset_0_-2px_0_0_rgb(var(--c-brand))]',
} as const;

/** Qator uchun tashlash chizig'i klassi (chiziq kerak bo'lmasa — undefined) */
export const dropLine = (position: 'before' | 'after' | null): string | undefined =>
  position ? DROP_LINE[position] : undefined;
