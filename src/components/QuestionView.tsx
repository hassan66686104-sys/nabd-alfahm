import { BookOpenText, Lightbulb, Timer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cx } from './ui';
import type { StimulusKind } from '@/lib/types';
import { splitBlanks } from '@/lib/text';

export function Stimulus({ kind, text, source, large }: { kind: StimulusKind; text: string | null; source: string | null; large?: boolean }) {
  if (kind === 'none' || !text) return null;
  const label = kind === 'ayah' ? 'قال تعالى' : kind === 'hadith' ? 'الحديث الشريف' : 'النص';
  return (
    <figure className={cx('stimulus', large && 'text-3xl leading-[2.2] sm:text-4xl')}>
      <figcaption className="mb-1 flex items-center gap-1 font-sans text-sm font-bold text-gold-600"><BookOpenText className="h-4 w-4" />{label}</figcaption>
      {/* يُعرض النص كما أدخله المعلم حرفيًا دون أي تعديل */}
      <blockquote>{kind === 'ayah' ? <>﴿{text}﴾</> : text}</blockquote>
      {source && <div className="mt-2 font-sans text-sm text-brand-600">المصدر: {source}</div>}
    </figure>
  );
}

export function QuestionText({ text, large, blanksAs }: { text: string; large?: boolean; blanksAs?: 'line' }) {
  const parts = blanksAs ? splitBlanks(text) : [text];
  return (
    <h2 className={cx('whitespace-pre-wrap font-extrabold leading-relaxed text-brand-900', large ? 'text-3xl sm:text-5xl sm:leading-[1.5]' : 'text-xl sm:text-2xl')}>
      {parts.map((p, i) => (
        <span key={i}>{p}{i < parts.length - 1 && <span className="mx-1 inline-block min-w-[4ch] border-b-4 border-dashed border-gold-400 text-gold-500">({i + 1})</span>}</span>
      ))}
    </h2>
  );
}

export function QuestionImage({ url, large }: { url: string | null; large?: boolean }) {
  if (!url) return null;
  return <img src={url} alt="صورة السؤال" className={cx('mx-auto rounded-2xl border border-brand-100 object-contain', large ? 'max-h-[40vh]' : 'max-h-64')} loading="lazy" />;
}

export function Hint({ hint }: { hint: string | null }) {
  const [open, setOpen] = useState(false);
  if (!hint) return null;
  return open
    ? <div className="flex items-start gap-2 rounded-xl bg-gold-50 p-3 text-brand-800"><Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-gold-500" />{hint}</div>
    : <button className="inline-flex items-center gap-1 text-sm font-semibold text-gold-600 underline" onClick={() => setOpen(true)}><Lightbulb className="h-4 w-4" />أظهر التلميح</button>;
}

export function Countdown({ closesAt, now, large }: { closesAt: string | null; now: number; large?: boolean }) {
  if (!closesAt) return null;
  const left = Math.max(0, Math.ceil((new Date(closesAt).getTime() - now) / 1000));
  const urgent = left <= 5;
  return (
    <div className={cx('inline-flex items-center gap-2 rounded-2xl px-4 py-2 font-extrabold tabular-nums', urgent ? 'bg-red-600 text-white' : 'bg-brand-700 text-white', large ? 'text-4xl' : 'text-xl')} role="timer" aria-live={urgent ? 'assertive' : 'off'}>
      <Timer className={large ? 'h-9 w-9' : 'h-5 w-5'} />
      {left > 0 ? (left >= 60 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : left) : 'انتهى الوقت'}
    </div>
  );
}

export function useTick(ms = 250, offset = 0) {
  const [now, setNow] = useState(Date.now() + offset);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offset), ms);
    return () => clearInterval(id);
  }, [ms, offset]);
  return now;
}
