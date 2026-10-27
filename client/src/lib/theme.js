import { useCallback, useEffect, useState } from 'react';

// Light/dark follows the system until the person picks one; the pick is remembered on this device.
const KEY = 'stayos-theme';
const read = () => {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
};
const systemTheme = () => (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

export function useTheme() {
  const [picked, setPicked] = useState(read);
  const [system, setSystem] = useState(systemTheme);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return undefined;
    const onChange = () => setSystem(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const theme = picked ?? system;

  useEffect(() => {
    if (picked) document.documentElement.dataset.theme = picked;
    else delete document.documentElement.dataset.theme;
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', theme === 'dark' ? '#121214' : '#f5f5f7'));
  }, [picked, theme]);

  const toggle = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setPicked(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* private mode: the choice just lasts for this visit */
    }
  }, [theme]);

  return { theme, toggle };
}
