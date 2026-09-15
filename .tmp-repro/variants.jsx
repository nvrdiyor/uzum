import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence, motion } from 'framer-motion';

function Box({ id }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{ width: 50, height: 20, background: 'teal' }}
    >{id}</motion.div>
  );
}
function ActiveSpan() {
  return <motion.span layoutId="shared-ind" style={{ display:'block', width: 5, height: 10, background: 'red' }} />;
}

// A: motion child with key
function A({ open }) {
  return <AnimatePresence>{open ? <motion.div key="a" id="A"
    initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:0.2}}
    style={{width:50,height:20,background:'teal'}} /> : null}</AnimatePresence>;
}
// B: plain div wrapper, no key (same as AppLayout)
function B({ open }) {
  return <AnimatePresence>{open ? <div id="B"><Box id="b" /></div> : null}</AnimatePresence>;
}
// C: plain div wrapper WITH key
function C({ open }) {
  return <AnimatePresence>{open ? <div key="c" id="C"><Box id="c" /></div> : null}</AnimatePresence>;
}
// D: plain div wrapper, no key, containing a layoutId span (app-like)
function D({ open }) {
  return <AnimatePresence>{open ? <div id="D"><Box id="d" /><ActiveSpan /></div> : null}</AnimatePresence>;
}

function App() {
  const [open, setOpen] = useState(true);
  window.__setOpen = setOpen;
  return <div>
    {/* second, always-mounted copy of the shared layoutId element, like the desktop sidebar */}
    <div style={{ display:'none' }}><ActiveSpan /></div>
    <A open={open} /><B open={open} /><C open={open} /><D open={open} />
  </div>;
}
createRoot(document.getElementById('variants-root')).render(<App />);
