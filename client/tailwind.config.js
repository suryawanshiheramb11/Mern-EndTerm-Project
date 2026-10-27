/** @type {import('tailwindcss').Config} */
// Every colour is a CSS variable (see src/index.css) so light and dark appearances share one set of class names.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
const scale = (name, shades) => Object.fromEntries(shades.map((s) => [s, v(`${name}-${s}`)]));

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      white: v('surface'), // the raised surface: white in light, elevated grey in dark
      black: '#000',
      onaccent: '#fff', // text on accent / danger fills, constant in both appearances
      accent: { DEFAULT: v('accent'), hover: v('accent-hover'), ink: v('accent-ink'), tint: v('accent-tint') },
      danger: v('danger'),
      slate: scale('slate', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]),
      red: scale('red', [50, 300, 600, 700]),
      amber: scale('amber', [50, 200, 300, 500, 800, 900]),
      orange: scale('orange', [50, 300, 500, 800]),
      green: scale('green', [50, 700, 800, 900]),
      emerald: scale('emerald', [50, 300, 500, 700, 800]),
      blue: scale('blue', [50, 200, 700, 900]),
      indigo: scale('indigo', [50, 700]),
    },
    fontFamily: {
      sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"SF Pro Display"', 'Inter', 'system-ui', '"Segoe UI"', 'Roboto', 'sans-serif'],
      mono: ['ui-monospace', '"SF Mono"', 'Menlo', 'monospace'],
    },
    borderRadius: { none: '0', sm: '6px', DEFAULT: '8px', md: '10px', lg: '14px', xl: '18px', '2xl': '22px', full: '9999px' },
    extend: {
      boxShadow: {
        card: '0 1px 2px rgb(0 0 0 / 0.04), 0 6px 20px rgb(0 0 0 / 0.04)',
        sheet: '0 24px 64px rgb(0 0 0 / 0.28)',
      },
      keyframes: {
        'sheet-in': { from: { opacity: 0, transform: 'translateY(12px) scale(0.98)' }, to: { opacity: 1, transform: 'none' } },
        'fade-in': { from: { opacity: 0 }, to: { opacity: 1 } },
      },
      animation: { 'sheet-in': 'sheet-in 180ms cubic-bezier(0.2, 0.8, 0.2, 1)', 'fade-in': 'fade-in 150ms ease-out' },
    },
  },
  plugins: [],
};
