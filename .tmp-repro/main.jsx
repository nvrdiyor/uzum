import React, { useState, useContext } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence, motion, PresenceContext } from 'framer-motion';

const ITEMS = ['a', 'b', 'c'];
window.__log = [];
const NOLAYOUT = new URLSearchParams(location.search).has('nolayout');

function Probe() {
  const ctx = useContext(PresenceContext);
  if (ctx && !ctx.__wrapped) {
    ctx.__wrapped = true;
    const r = ctx.register, o = ctx.onExitComplete;
    ctx.register = (id) => { window.__log.push(['register', String(id)]); return r(id); };
    ctx.onExitComplete = (id) => { window.__log.push(['exitComplete', String(id)]); return o(id); };
    window.__ctx = ctx;
  }
  return null;
}

function SidebarContent({ route, onNavigate }) {
  return (
    <ul>
      {ITEMS.map((it) => {
        const isActive = route === it;
        return (
          <li key={it} style={{ position: 'relative' }}>
            <button onClick={() => onNavigate(it)}>{it}</button>
            {isActive ? (
              <motion.span
                {...(NOLAYOUT ? {} : { layoutId: 'nav-active' })}
                style={{ position: 'absolute', left: 0, top: 0, width: 3, height: 20, background: 'red' }}
                transition={{ duration: 0.25 }}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function App() {
  const [route, setRoute] = useState('a');
  const [open, setOpen] = useState(false);
  window.__setOpen = setOpen;

  return (
    <div>
      <button id="toggle" onClick={() => setOpen(true)}>open drawer</button>
      <div id="desktop-sidebar" style={{ display: 'none' }}>
        <SidebarContent route={route} onNavigate={setRoute} />
      </div>
      <AnimatePresence onExitComplete={() => window.__log.push(['AP-onExitComplete'])}>
        {open ? (
          <div id="overlay" style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
            <Probe />
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)' }}
              onClick={() => setOpen(false)}
            />
            <motion.aside
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
              transition={{ duration: 0.28 }}
              style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 280, background: '#fff' }}
            >
              <SidebarContent route={route} onNavigate={(r) => { setOpen(false); setRoute(r); }} />
            </motion.aside>
          </div>
        ) : null}
      </AnimatePresence>
      <div>route = {route}</div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
