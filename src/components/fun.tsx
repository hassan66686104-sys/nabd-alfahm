// روح اللعبة: خلفية زاهية متحركة، رموز تطفو، احتفال بالألوان، ونقاط تقفز
// كلها زخرفية (aria-hidden) ولا تعترض اللمس، وتتوقف عند تفعيل «تقليل الحركة» في الجهاز
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cx } from './ui';

const SYMBOLS = ['🏆', '⭐', '🎲', '💎', '🔥', '🛡️', '✨', '🚀', '🎯', '🌟', '💰', '⚡', '🎉', '👑', '🧠', '📚'];

// مواقع ثابتة (لا عشوائية) حتى لا تقفز الرموز عند كل إعادة رسم
const FLOATERS = Array.from({ length: 18 }, (_, i) => ({
  s: SYMBOLS[i % SYMBOLS.length],
  left: (i * 37 + 7) % 100,
  size: 22 + ((i * 13) % 26),
  dur: 11 + ((i * 7) % 12),
  delay: -((i * 23) % 20),
}));

export function FunBackdrop({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-[linear-gradient(135deg,#4c1d95,#7c3aed,#db2777,#f97316,#0ea5e9,#4c1d95)] bg-[length:400%_400%] motion-safe:animate-hue">
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-yellow-300/40 blur-3xl motion-safe:animate-drift" />
        <div className="absolute -left-20 top-1/3 h-96 w-96 rounded-full bg-cyan-300/30 blur-3xl motion-safe:animate-drift [animation-delay:-3s]" />
        <div className="absolute bottom-0 right-1/4 h-72 w-72 rounded-full bg-pink-400/40 blur-3xl motion-safe:animate-drift [animation-delay:-6s]" />
        {FLOATERS.map((f, i) => (
          <span key={i} className="absolute bottom-[-60px] select-none motion-reduce:hidden"
            style={{ left: `${f.left}%`, fontSize: f.size, animation: `floatUp ${f.dur}s linear ${f.delay}s infinite` }}>{f.s}</span>
        ))}
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  );
}

const CONFETTI_COLORS = ['#facc15', '#f472b6', '#22d3ee', '#a3e635', '#fb923c', '#c084fc', '#f87171', '#ffffff'];

// احتفال: يتجدد كلما تغيّر burst (رقم يزيد عند كل فوز أو إجابة صحيحة)
export function Confetti({ burst, pieces = 60 }: { burst: number; pieces?: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!burst) return;
    setShown(burst);
    const t = setTimeout(() => setShown(0), 2200);
    return () => clearTimeout(t);
  }, [burst]);
  if (!shown) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-50 overflow-hidden motion-reduce:hidden" key={shown}>
      {Array.from({ length: pieces }, (_, i) => {
        const style = {
          left: `${(i * 53 + shown * 17) % 100}%`,
          top: '-20px',
          width: 8 + (i % 3) * 4,
          height: 12 + (i % 4) * 3,
          background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          borderRadius: i % 3 === 0 ? '50%' : '2px',
          '--dx': `${((i * 29) % 160) - 80}px`,
          '--rot': `${360 + ((i * 47) % 720)}deg`,
          animation: `confetti ${1.3 + (i % 5) * 0.15}s cubic-bezier(.2,.6,.4,1) ${(i % 10) * 0.03}s forwards`,
        } as CSSProperties;
        return <span key={i} className="absolute" style={style} />;
      })}
    </div>
  );
}

// «+10» يقفز ويتلاشى فوق العنصر
export function ScorePop({ amount, k }: { amount: number; k: number }) {
  if (!k || !amount) return null;
  return (
    <span key={k} aria-hidden className="pointer-events-none absolute left-1/2 top-0 z-20 animate-rise whitespace-nowrap text-3xl font-black text-yellow-300 [text-shadow:0_2px_0_#9a3412,0_0_14px_rgba(250,204,21,.9)]">
      {amount > 0 ? `+${amount}` : amount}
    </span>
  );
}

// يعيد صنفًا يجعل الرقم يقفز لحظة تغيّره
export function useBump(value: unknown): string {
  const prev = useRef(value);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (prev.current !== value) { prev.current = value; setN((x) => x + 1); }
  }, [value]);
  return n ? (n % 2 ? 'animate-bump' : 'animate-[bump_.45s_ease-out]') : '';
}

// ألوان زاهية متناوبة للبطاقات والإحصاءات
export const VIVID = [
  'from-fuchsia-500 to-purple-600',
  'from-orange-400 to-pink-500',
  'from-cyan-400 to-blue-600',
  'from-lime-400 to-emerald-600',
  'from-yellow-400 to-orange-500',
  'from-rose-400 to-red-600',
];
export const LESSON_EMOJI = ['📘', '🌙', '🕌', '⭐', '🌿', '💡', '🎯', '📜', '🌟', '🧭'];

export function VividStat({ label, value, icon, i }: { label: string; value: ReactNode; icon?: ReactNode; i: number }) {
  const bump = useBump(value);
  return (
    <div className={cx('rounded-2xl bg-gradient-to-br p-2 text-white shadow-lg ring-2 ring-white/30', VIVID[i % VIVID.length])}>
      <div className="flex items-center justify-center gap-1 text-xs font-semibold text-white/90">{icon}{label}</div>
      <div className={cx('text-2xl font-black tabular-nums drop-shadow', bump)}>{value}</div>
    </div>
  );
}
