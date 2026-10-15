export function Logo({ className = 'h-10 w-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden>
      <rect width="512" height="512" rx="112" fill="#0f4d3a" />
      <circle cx="256" cy="256" r="168" fill="none" stroke="#1f7754" strokeWidth="20" />
      <path d="M76 268h96l34-78 48 168 44-132 26 42h112" fill="none" stroke="#e0bd55" strokeWidth="34" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Brand({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <Logo className={compact ? 'h-9 w-9' : 'h-12 w-12'} />
      <div className="leading-tight">
        <div className={compact ? 'text-lg font-extrabold text-brand-800' : 'text-2xl font-extrabold text-brand-800'}>نبض الفهم</div>
        {!compact && <div className="text-sm font-semibold text-gold-500">اسأل، شارك، افهم</div>}
      </div>
    </div>
  );
}

// اسم معدّ التطبيق: يظهر في أسفل الصفحات
export const AUTHOR_CREDIT = 'إعداد الأستاذ الحسن علي';

export function Credit({ light, className = '' }: { light?: boolean; className?: string }) {
  return <p className={`text-center text-sm font-semibold ${light ? 'text-brand-100' : 'text-brand-600'} ${className}`}>{AUTHOR_CREDIT}</p>;
}
