import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../../lib/theme.js';

const SRC = 'https://accounts.google.com/gsi/client';
let loading;
const loadGoogle = () => {
  if (window.google?.accounts?.id) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SRC;
    s.async = true;
    s.onload = resolve;
    s.onerror = () => { loading = undefined; reject(new Error('Could not load Google sign-in')); };
    document.head.appendChild(s);
  });
  return loading;
};

// Google's own button when the owner has configured a client id; otherwise a clearly inactive one.
export default function GoogleButton({ clientId, intent = 'login', onCredential, onError }) {
  const box = useRef(null);
  const handlers = useRef({ onCredential, onError });
  handlers.current = { onCredential, onError };
  const { theme } = useTheme();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!clientId) return undefined;
    let cancelled = false;
    loadGoogle()
      .then(() => {
        if (cancelled || !box.current) return;
        window.google.accounts.id.initialize({ client_id: clientId, callback: (r) => handlers.current.onCredential(r.credential), ux_mode: 'popup' });
        box.current.innerHTML = '';
        window.google.accounts.id.renderButton(box.current, {
          type: 'standard', shape: 'pill', size: 'large', logo_alignment: 'center',
          theme: theme === 'dark' ? 'filled_black' : 'outline',
          text: intent === 'register' ? 'signup_with' : 'signin_with',
          width: Math.min(380, box.current.offsetWidth || 320),
        });
        setReady(true);
      })
      .catch((e) => handlers.current.onError?.(e));
    return () => { cancelled = true; };
  }, [clientId, theme, intent]);

  if (!clientId) {
    return (
      <div>
        <button type="button" disabled className="flex min-h-[44px] w-full items-center justify-center gap-3 rounded-full border border-slate-300 bg-white px-4 text-[15px] font-medium text-slate-500 opacity-70">
          <GoogleMark /> Continue with Google
        </button>
        <p className="mt-1.5 text-center text-xs text-slate-500">Google sign-in is switched off until the site owner connects a Google client.</p>
      </div>
    );
  }
  return <div ref={box} className={`flex min-h-[44px] w-full justify-center ${ready ? '' : 'animate-pulse rounded-full bg-slate-100'}`} aria-label="Continue with Google" />;
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17.5z" />
      <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.3 0 11.7-2.1 15.6-5.7l-7.5-5.8c-2.1 1.4-4.8 2.3-8.1 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}
