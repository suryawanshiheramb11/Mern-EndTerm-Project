import { createElement, useEffect, useRef, useState } from 'react';

// Fades and lifts its content in once, the first time it scrolls into view. Content is simply visible when
// IntersectionObserver is unavailable or the person prefers reduced motion (the CSS also neutralises it).
export default function Reveal({ as = 'div', delay = 0, className = '', children, ...rest }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    const el = ref.current;
    if (!el || shown) return undefined;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown]);

  return createElement(as, { ref, className: `reveal ${shown ? 'is-visible' : ''} ${className}`, style: { transitionDelay: `${delay}ms` }, ...rest }, children);
}
