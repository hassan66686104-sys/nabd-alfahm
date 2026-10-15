// شخصية الطالب: رمز داخل دائرة ملونة، واختيار الشخصية قبل اللعب
import { useState } from 'react';
import { AVATARS, AVATAR_GROUPS, avatarInfo } from '@/lib/avatars';
import { cx } from './ui';

export function Avatar({ id, size = 'md', className }: { id: string | null | undefined; size?: 'sm' | 'md' | 'lg' | 'xl'; className?: string }) {
  const a = avatarInfo(id);
  if (!a) return null;
  const dims = { sm: 'h-7 w-7 text-base', md: 'h-9 w-9 text-xl', lg: 'h-14 w-14 text-3xl', xl: 'h-24 w-24 text-6xl' }[size];
  return (
    <span className={cx('inline-flex shrink-0 items-center justify-center rounded-full shadow-sm ring-2 ring-white', dims, className)} style={{ background: a.bg }} title={a.name} aria-label={a.name} role="img">
      {a.emoji}
    </span>
  );
}

export function AvatarPicker({ value, onChange }: { value: string | null; onChange: (id: string) => void }) {
  const [group, setGroup] = useState<(typeof AVATAR_GROUPS)[number]['id']>(avatarInfo(value)?.group ?? 'sport');
  const chosen = avatarInfo(value);
  return (
    <div className="space-y-2" data-testid="avatar-picker">
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-purple-900">اختر شخصيتك</span>
        {chosen && <span className="flex items-center gap-2 text-sm font-bold text-purple-800"><Avatar id={chosen.id} size="sm" />{chosen.name}</span>}
      </div>
      <div className="flex gap-1 rounded-xl bg-purple-50 p-1" role="tablist" aria-label="أنواع الشخصيات">
        {AVATAR_GROUPS.map((g) => (
          <button key={g.id} type="button" role="tab" aria-selected={group === g.id} onClick={() => setGroup(g.id)}
            className={cx('flex-1 rounded-lg px-2 py-1.5 text-sm font-bold transition', group === g.id ? 'bg-white text-purple-800 shadow' : 'text-purple-600 hover:text-purple-800')}>
            {g.title}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-8" role="radiogroup" aria-label="الشخصيات">
        {AVATARS.filter((a) => a.group === group).map((a) => (
          <button key={a.id} type="button" role="radio" aria-checked={value === a.id} aria-label={a.name} title={a.name} onClick={() => onChange(a.id)}
            className={cx('flex flex-col items-center gap-1 rounded-xl p-1.5 text-[11px] font-semibold leading-tight text-purple-900 transition hover:-translate-y-0.5',
              value === a.id ? 'bg-purple-100 ring-2 ring-purple-500' : 'hover:bg-purple-50')}>
            <span className={cx('flex h-11 w-11 items-center justify-center rounded-full text-2xl shadow-sm', value === a.id && 'motion-safe:animate-bounceIn')} style={{ background: a.bg }}>{a.emoji}</span>
            <span className="line-clamp-1">{a.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
