import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

/**
 * Oddiy render.
 *
 * Ilgari bu yer `startTransition` ichida edi (lazy sahifada React #426
 * xatosining oldini olish uchun). Ammo shu sabab ilova "concurrent" o'tishlarga
 * bog'lanib qolardi: marshrut almashuvi ham o'tish (transition) bo'lgani uchun
 * u ba'zan umuman yakunlanmasdi — manzil o'zgarardi-yu, ekran eskiligicha
 * qolardi (oddiy yangilanishlar, masalan mavzu almashtirish, ishlayverardi).
 *
 * #426 ning haqiqiy sababi Suspense chegarasi yo'qligi edi — u endi
 * `App.tsx` da ham, `AppLayout` da ham bor, shuning uchun bu hiyla kerak emas.
 */
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
