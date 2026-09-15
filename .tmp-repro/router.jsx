import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, NavLink, Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, PresenceContext } from 'framer-motion';
function Probe(){ const ctx = React.useContext(PresenceContext); if(ctx && !ctx.__w){ ctx.__w=1; const r=ctx.register,o=ctx.onExitComplete; ctx.register=(id)=>{window.__log.push('register:'+id); return r(id);}; ctx.onExitComplete=(id)=>{window.__log.push('childExitComplete:'+id); return o(id);}; } return null; }

const NAV = ['/one', '/two', '/three'];
window.__log = [];
const NOLAYOUT = new URLSearchParams(location.search).has('nolayout');

function SidebarContent({ onNavigate }) {
  return (
    <ul>
      {NAV.map((to) => (
        <li key={to} style={{ position: 'relative' }}>
          <NavLink to={to} onClick={onNavigate}>
            {({ isActive }) => (
              <>
                {isActive ? (
                  <motion.span
                    {...(NOLAYOUT ? {} : { layoutId: 'nav-active' })}
                    style={{ position: 'absolute', left: 0, top: '50%', width: 3, height: 24, background: 'red' }}
                    transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  />
                ) : null}
                <span>{to}</span>
              </>
            )}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

function Sidebar() {
  // desktop sidebar: always mounted, hidden below lg (display:none) -> second copy of layoutId
  return <aside id="desktop" style={{ display: 'none' }}><SidebarContent /></aside>;
}

function MobileNav({ open, setOpen }) {
  return (
    <AnimatePresence onExitComplete={() => window.__log.push('AP-onExitComplete')}>
      {open ? (
        <div id="overlay" style={{ position: 'fixed', inset: 0, zIndex: 50 }}><Probe />
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            id="backdrop" onAnimationComplete={(d)=>window.__log.push('backdropAnimDone:'+JSON.stringify(d))}
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)' }}
            onClick={() => setOpen(false)}
          />
          <motion.aside
            initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            id="drawer" onAnimationComplete={(d)=>window.__log.push('drawerAnimDone:'+JSON.stringify(d))}
            style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 280, background: '#fff' }}
          >
            <SidebarContent onNavigate={() => setOpen(false)} />
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

function Layout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  window.__setOpen = setOpen;
  return (
    <div>
      <button id="toggle" onClick={() => setOpen(true)}>open</button>
      <Sidebar />
      <MobileNav open={open} setOpen={setOpen} />
      <main>
        <motion.div key={location.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}>
          <Routes>
            {NAV.map((p) => <Route key={p} path={p} element={<div id="page">page {p}</div>} />)}
            <Route path="*" element={<div id="page">home</div>} />
          </Routes>
        </motion.div>
      </main>
    </div>
  );
}

createRoot(document.getElementById('router-root')).render(
  <BrowserRouter future={new URLSearchParams(location.search).has('notransition') ? { v7_relativeSplatPath: true } : { v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Layout />
  </BrowserRouter>
);
