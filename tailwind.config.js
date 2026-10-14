/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef7f2', 100: '#d5ebdf', 200: '#a9d5bf', 300: '#74b897', 400: '#3f9670',
          500: '#1f7754', 600: '#145f43', 700: '#0f4d3a', 800: '#0b3a2c', 900: '#072a20',
        },
        gold: { 50: '#fbf6e6', 100: '#f5e8bf', 200: '#ecd48a', 300: '#e0bd55', 400: '#c9a227', 500: '#a8851b', 600: '#846816' },
        ivory: { DEFAULT: '#fbf8f1', 100: '#f6f1e4', 200: '#ece4cf' },
        ok: '#15803d', warn: '#b7791f', bad: '#b91c1c',
      },
      fontFamily: {
        sans: ['Cairo', 'Tajawal', 'system-ui', 'sans-serif'],
        quran: ['Amiri', 'Cairo', 'serif'],
      },
      boxShadow: { card: '0 1px 2px rgba(7,42,32,.06), 0 4px 16px rgba(7,42,32,.06)' },
      keyframes: {
        pop: { '0%': { transform: 'scale(.96)', opacity: '0' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        pulseDot: { '0%,100%': { opacity: '1' }, '50%': { opacity: '.35' } },
      },
      animation: { pop: 'pop .18s ease-out', pulseDot: 'pulseDot 1.4s ease-in-out infinite' },
    },
  },
  plugins: [],
};
