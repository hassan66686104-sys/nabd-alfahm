// الشعار: مربع بتدرج بنفسجي وردي، ونبضة بيضاء تنتهي بنقطة شمسية
export function Logo({ className = 'h-10 w-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden>
      <defs>
        <linearGradient id="nabd-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6440e3" />
          <stop offset="1" stopColor="#c03fd0" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="128" fill="url(#nabd-g)" />
      <path d="M84 276h92l36-86 48 172 44-136 28 50h52" fill="none" stroke="#fff" strokeWidth="36" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="408" cy="276" r="34" fill="#ffb81f" />
    </svg>
  );
}

export function Brand({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <Logo className={compact ? 'h-9 w-9' : 'h-12 w-12'} />
      <div className="leading-tight">
        <div className={compact ? 'text-lg font-black text-brand-900' : 'text-2xl font-black text-brand-900'}>نبض الفهم</div>
        {!compact && <div className="text-sm font-bold text-brand-500">اسأل، شارك، افهم</div>}
      </div>
    </div>
  );
}

// اسم معدّ التطبيق: يظهر في أسفل الصفحات
export const AUTHOR_CREDIT = 'إعداد الأستاذ الحسن علي';

export function Credit({ light, className = '' }: { light?: boolean; className?: string }) {
  return <p className={`text-center text-sm font-semibold ${light ? 'text-white/80' : 'text-brand-500'} ${className}`}>{AUTHOR_CREDIT}</p>;
}
