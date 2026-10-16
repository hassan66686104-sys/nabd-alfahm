/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          // هوية «نبض الفهم»: بنفسجي واثق مع لمسة شمسية دافئة
          50: '#f4f2ff', 100: '#ebe7ff', 200: '#d8d0ff', 300: '#b8a8ff', 400: '#957bff',
          500: '#7856f5', 600: '#6440e3', 700: '#5331c4', 800: '#41279b', 900: '#2c1b6b',
        },
        gold: { 50: '#fff8e6', 100: '#ffefc2', 200: '#ffe08a', 300: '#ffcd4d', 400: '#ffb81f', 500: '#f59f00', 600: '#c77d00' },
        ivory: { DEFAULT: '#faf9ff', 100: '#f3f1fb', 200: '#e8e4f6' },
        coral: { 400: '#ff7a59', 500: '#f45d3c' },
        ok: '#15803d', warn: '#b7791f', bad: '#b91c1c',
      },
      fontFamily: {
        sans: ['Cairo', 'Tajawal', 'system-ui', 'sans-serif'],
        quran: ['Amiri', 'Cairo', 'serif'],
      },
      boxShadow: { card: '0 1px 2px rgba(44,27,107,.05), 0 8px 24px rgba(44,27,107,.07)', lift: '0 12px 32px rgba(83,49,196,.18)' },
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
