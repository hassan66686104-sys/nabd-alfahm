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
        // حركات اللعبة: رموز تطفو، خلفية تتلون، احتفال، اهتزاز للخطأ
        drift: { '0%,100%': { transform: 'translate(0,0) scale(1)' }, '50%': { transform: 'translate(30px,-40px) scale(1.15)' } },
        hue: { '0%,100%': { backgroundPosition: '0% 50%' }, '50%': { backgroundPosition: '100% 50%' } },
        bounceIn: { '0%': { transform: 'scale(.3)', opacity: '0' }, '55%': { transform: 'scale(1.15)', opacity: '1' }, '75%': { transform: 'scale(.95)' }, '100%': { transform: 'scale(1)' } },
        shake: { '0%,100%': { transform: 'translateX(0)' }, '20%,60%': { transform: 'translateX(-10px)' }, '40%,80%': { transform: 'translateX(10px)' } },
        wiggle: { '0%,100%': { transform: 'rotate(-6deg)' }, '50%': { transform: 'rotate(6deg)' } },
        bump: { '0%': { transform: 'scale(1)' }, '40%': { transform: 'scale(1.35)' }, '100%': { transform: 'scale(1)' } },
        rise: { '0%': { transform: 'translate(-50%,0) scale(.6)', opacity: '0' }, '20%': { transform: 'translate(-50%,-20px) scale(1.2)', opacity: '1' }, '100%': { transform: 'translate(-50%,-120px) scale(1)', opacity: '0' } },
        diceSpin: { '0%': { transform: 'rotate(0deg) scale(1)' }, '50%': { transform: 'rotate(180deg) scale(1.25)' }, '100%': { transform: 'rotate(360deg) scale(1)' } },
        glow: { '0%,100%': { filter: 'drop-shadow(0 0 6px rgba(250,204,21,.6))' }, '50%': { filter: 'drop-shadow(0 0 22px rgba(250,204,21,1))' } },
      },
      animation: {
        pop: 'pop .18s ease-out', pulseDot: 'pulseDot 1.4s ease-in-out infinite',
        drift: 'drift 9s ease-in-out infinite', hue: 'hue 12s ease infinite',
        bounceIn: 'bounceIn .6s cubic-bezier(.2,.8,.3,1.2)', shake: 'shake .45s ease-in-out', wiggle: 'wiggle 1.2s ease-in-out infinite',
        bump: 'bump .45s ease-out', rise: 'rise 1.2s ease-out forwards', diceSpin: 'diceSpin .5s linear infinite', glow: 'glow 2s ease-in-out infinite',
        floatSlow: 'bounce 2.4s infinite',
      },
    },
  },
  plugins: [],
};
