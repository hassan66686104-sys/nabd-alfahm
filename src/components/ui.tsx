import { forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Loader2, X } from 'lucide-react';
import type { Level } from '@/lib/stats';
import { LEVEL_LABELS } from '@/lib/stats';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'gold' | 'outline' | 'ghost' | 'danger' | 'soft';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 focus-visible:ring-brand-400',
  gold: 'bg-gold-400 text-brand-900 hover:bg-gold-300 focus-visible:ring-gold-300',
  outline: 'border border-brand-200 bg-white text-brand-800 hover:bg-brand-50 focus-visible:ring-brand-300',
  ghost: 'text-brand-800 hover:bg-brand-50 focus-visible:ring-brand-200',
  danger: 'bg-bad text-white hover:bg-red-800 focus-visible:ring-red-300',
  soft: 'bg-brand-50 text-brand-800 hover:bg-brand-100 focus-visible:ring-brand-200',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest }, ref,
) {
  const sizes = { sm: 'h-9 px-3 text-sm gap-1.5', md: 'h-11 px-4 text-base gap-2', lg: 'h-14 px-6 text-lg gap-2', xl: 'h-16 px-7 text-xl gap-3' };
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cx(
        'inline-flex select-none items-center justify-center rounded-xl font-semibold transition focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant], sizes[size], className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('rounded-2xl border border-brand-100 bg-white p-4 shadow-card sm:p-5', className)} {...rest}>{children}</div>;
}

export function Field({ label, hint, error, children, className }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-sm font-semibold text-brand-800">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-brand-600/80">{hint}</span>}
      {error && <span role="alert" className="mt-1 block text-sm font-medium text-bad">{error}</span>}
    </label>
  );
}

const inputBase = 'w-full rounded-xl border border-brand-200 bg-white px-3 py-2.5 text-base text-brand-900 placeholder:text-brand-400/70 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:bg-ivory-100';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(inputBase, className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx(inputBase, 'min-h-[90px] leading-relaxed', className)} {...rest} />;
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(inputBase, 'appearance-auto pe-3', className)} {...rest}>{children}</select>;
}

export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <label htmlFor={id} className="cursor-pointer">
        <span className="block font-semibold text-brand-800">{label}</span>
        {hint && <span className="block text-sm text-brand-600/80">{hint}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx('relative mt-1 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:opacity-50', checked ? 'bg-brand-600' : 'bg-brand-200')}
      >
        <span className={cx('inline-block h-5 w-5 rounded-full bg-white shadow transition', checked ? '-translate-x-6' : '-translate-x-1')} />
      </button>
    </div>
  );
}

export function Spinner({ label = 'جارٍ التحميل…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-brand-600" role="status">
      <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-brand-200 bg-white/60 px-6 py-10 text-center">
      {icon && <div className="text-brand-400">{icon}</div>}
      <h3 className="text-lg font-bold text-brand-800">{title}</h3>
      {children && <div className="max-w-md text-brand-600">{children}</div>}
      {action}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800">
      <span>{error}</span>
      {onRetry && <Button size="sm" variant="outline" onClick={onRetry}>إعادة المحاولة</Button>}
    </div>
  );
}

export function Badge({ children, tone = 'brand', className }: { children: ReactNode; tone?: 'brand' | 'gold' | 'gray' | 'green' | 'yellow' | 'red' | 'blue'; className?: string }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-700 border-brand-100',
    gold: 'bg-gold-50 text-gold-600 border-gold-100',
    gray: 'bg-gray-100 text-gray-700 border-gray-200',
    green: 'bg-green-50 text-green-800 border-green-200',
    yellow: 'bg-amber-50 text-amber-800 border-amber-200',
    red: 'bg-red-50 text-red-800 border-red-200',
    blue: 'bg-sky-50 text-sky-800 border-sky-200',
  };
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold', tones[tone], className)}>{children}</span>;
}

export const LEVEL_STYLES: Record<Level, { bg: string; text: string; dot: string; tone: 'green' | 'yellow' | 'red' | 'gray'; fill: string }> = {
  green: { bg: 'bg-green-50', text: 'text-green-800', dot: 'bg-green-600', tone: 'green', fill: '#15803d' },
  yellow: { bg: 'bg-amber-50', text: 'text-amber-800', dot: 'bg-amber-500', tone: 'yellow', fill: '#d97706' },
  red: { bg: 'bg-red-50', text: 'text-red-800', dot: 'bg-red-600', tone: 'red', fill: '#b91c1c' },
  none: { bg: 'bg-gray-50', text: 'text-gray-600', dot: 'bg-gray-400', tone: 'gray', fill: '#9ca3af' },
};

export function LevelBadge({ level, pct }: { level: Level; pct?: number | null }) {
  const s = LEVEL_STYLES[level];
  return (
    <Badge tone={s.tone}>
      <span className={cx('h-2 w-2 rounded-full', s.dot)} />
      {LEVEL_LABELS[level]}
      {pct != null && <span className="ms-1">({Math.round(pct)}%)</span>}
    </Badge>
  );
}

export function ProgressBar({ value, tone = 'brand', className, label }: { value: number; tone?: 'brand' | 'gold' | 'green' | 'red'; className?: string; label?: string }) {
  const colors = { brand: 'bg-brand-600', gold: 'bg-gold-400', green: 'bg-green-600', red: 'bg-red-600' };
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cx('h-3 w-full overflow-hidden rounded-full bg-brand-100', className)} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={cx('h-full rounded-full transition-all duration-500', colors[tone])} style={{ width: `${v}%` }} />
    </div>
  );
}

export function StatCard({ label, value, sub, icon, tone = 'brand' }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; tone?: 'brand' | 'gold' | 'green' | 'red' | 'yellow' }) {
  const tones = { brand: 'text-brand-700 bg-brand-50', gold: 'text-gold-600 bg-gold-50', green: 'text-green-700 bg-green-50', red: 'text-red-700 bg-red-50', yellow: 'text-amber-700 bg-amber-50' };
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-brand-100 bg-white p-4 shadow-card">
      {icon && <div className={cx('rounded-xl p-2.5', tones[tone])}>{icon}</div>}
      <div className="min-w-0">
        <div className="text-sm text-brand-600">{label}</div>
        <div className="text-2xl font-extrabold text-brand-900">{value}</div>
        {sub && <div className="text-xs text-brand-600/80">{sub}</div>}
      </div>
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-brand-900/40 p-0 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" className={cx('flex max-h-[92vh] w-full animate-pop flex-col rounded-t-3xl bg-white shadow-2xl outline-none sm:rounded-3xl', wide ? 'sm:max-w-4xl' : 'sm:max-w-lg')}>
        <div className="flex items-center justify-between border-b border-brand-100 px-5 py-4">
          <h2 className="text-lg font-bold text-brand-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-brand-500 hover:bg-brand-50" aria-label="إغلاق"><X className="h-5 w-5" /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-brand-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold text-brand-900 sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-brand-600">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function OptionLetter({ letter, tone = 'brand' }: { letter: string; tone?: 'brand' | 'green' | 'red' | 'gold' }) {
  const tones = { brand: 'bg-brand-700 text-white', green: 'bg-green-600 text-white', red: 'bg-red-600 text-white', gold: 'bg-gold-400 text-brand-900' };
  return <span className={cx('inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg font-bold', tones[tone])}>{letter}</span>;
}
