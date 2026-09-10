import { useEffect, useState } from 'react';

/**
 * Qidiruv maydonlari uchun kechiktirilgan qiymat —
 * har bir harf uchun so'rov yubormaslik maqsadida.
 */
export function useDebounced<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
