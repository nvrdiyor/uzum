import React, { startTransition } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

/**
 * Dastlabki render `startTransition` ichida bajariladi.
 *
 * Sahifalar `React.lazy` bilan yuklanadi, shuning uchun birinchi render "to'xtaydi"
 * (suspend). Agar bu oddiy (sinxron) yangilanish bo'lsa, React #426 xatosini beradi
 * va ekran vaqtincha qorayib qoladi. `startTransition` bilan React buni kutiladigan
 * o'tish deb hisoblaydi va Suspense fallback'ini tinch ko'rsatadi.
 */
startTransition(() => {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
