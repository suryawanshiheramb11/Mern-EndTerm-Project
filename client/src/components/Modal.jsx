import { useEffect, useRef } from 'react';
import Icon from './Icon.jsx';

const FOCUSABLE = 'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

// A sheet: centred card on wide screens, bottom sheet on phones. One short task, always a way out
// (close button, Escape, or tapping outside). Focus moves in on open and returns to the opener on close.
export default function Modal({ title, onClose, children }) {
  const panel = useRef(null);

  useEffect(() => {
    const opener = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const first = panel.current?.querySelector('input, select, textarea') ?? panel.current?.querySelector(FOCUSABLE);
    first?.focus();

    const onKey = (e) => {
      if (e.key === 'Escape') return onClose();
      if (e.key !== 'Tab' || !panel.current) return undefined;
      const items = [...panel.current.querySelectorAll(FOCUSABLE)];
      if (!items.length) return undefined;
      const [head, tail] = [items[0], items[items.length - 1]];
      if (e.shiftKey && document.activeElement === head) { e.preventDefault(); tail.focus(); }
      else if (!e.shiftKey && document.activeElement === tail) { e.preventDefault(); head.focus(); }
      return undefined;
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-end justify-center bg-black/30 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[92vh] w-full max-w-md animate-sheet-in overflow-y-auto rounded-t-2xl border border-slate-200 bg-white p-6 shadow-sheet sm:rounded-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight text-slate-800">{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="-mr-2 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100">
            <Icon name="close" size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
