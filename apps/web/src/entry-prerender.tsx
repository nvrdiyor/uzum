/**
 * Yig'ish paytida sahifani HTML ga aylantiruvchi kirish nuqtasi.
 *
 * Bu fayl BRAUZERGA hech qachon yuborilmaydi — uni faqat `prerender.mjs`
 * Node ichida chaqiradi. Shu sababli bu yerda `document` ham, `window` ham
 * yo'q va bo'lmasligi kerak.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import Landing from '@/pages/Landing';
import { useLangStore, type Lang } from '@/i18n';

/** Prerender qilinadigan sahifalar */
export const ROUTES = [{ path: '/', lang: 'uz' as Lang }];

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

export function render(path: string, lang: Lang): string {
  /*
   * ZUSTAND 5 TUZOG'I — buni «soddalashtirmang».
   *
   * Zustand serverda `getServerSnapshot` sifatida
   * `() => selector(api.getInitialState())` ni beradi. React server tomonida
   * aynan o'shani chaqiradi, ya'ni oddiy `setState()` renderToString uchun
   * KO'RINMAY qoladi va qaysi til so'ralmasin, natija bir xil chiqadi.
   * Boshlang'ich holat obyektini o'zgartirish — ishlaydigan yagona yo'l.
   */
  const initial = useLangStore.getInitialState() as { lang: Lang };
  initial.lang = lang;
  useLangStore.setState({ lang });

  return renderToString(
    <QueryClientProvider client={queryClient}>
      <StaticRouter location={path}>
        <Landing />
      </StaticRouter>
    </QueryClientProvider>,
  );
}
