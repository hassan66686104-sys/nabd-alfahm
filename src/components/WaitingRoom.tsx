// غرفة الانتظار: يرى المعلم (وشاشة العرض) كل طالب لحظة انضمامه، قبل بدء التحدي أو الحصة
import { useEffect, useRef } from 'react';
import { Avatar } from './Avatar';
import { cx } from './ui';
import { sfx } from '@/lib/sound';

export interface WaitingPerson { id: string; name: string; avatar?: string | null; team?: string | null; color?: string | null }

export default function WaitingRoom({ people, large, sound }: { people: WaitingPerson[]; large?: boolean; sound?: boolean }) {
  const prev = useRef(people.length);
  useEffect(() => {
    if (sound && people.length > prev.current) sfx.ok();
    prev.current = people.length;
  }, [people.length, sound]);

  return (
    <div className="space-y-3" data-testid="waiting-room" aria-live="polite">
      <h2 className={cx('flex items-center gap-2 font-extrabold', large ? 'text-4xl' : 'text-xl')}>
        <span className="motion-safe:animate-wiggle">👋</span>
        {people.length ? <>انضم حتى الآن <span className="tabular-nums text-violet-700" data-testid="waiting-count">{people.length}</span> طالب</> : 'بانتظار انضمام الطلاب…'}
      </h2>
      {people.length === 0 ? (
        <div className={cx('flex items-center gap-2 text-brand-600', large && 'text-2xl')}>
          <span className="h-3 w-3 animate-pulseDot rounded-full bg-green-500" />يظهر اسم كل طالب هنا لحظة دخوله.
        </div>
      ) : (
        <div className={cx('flex flex-wrap gap-2', large && 'gap-3')}>
          {people.map((p) => (
            <span key={p.id} data-testid="waiting-player"
              className={cx('inline-flex animate-bounceIn items-center gap-2 rounded-full bg-white py-1 pe-4 ps-1 font-bold shadow-md ring-2 ring-violet-100', large ? 'text-2xl' : 'text-base')}
              style={p.color ? { boxShadow: `0 0 0 2px ${p.color}` } : undefined}>
              {p.avatar ? <Avatar id={p.avatar} size={large ? 'lg' : 'md'} /> : <span className={cx('inline-flex items-center justify-center rounded-full bg-violet-100', large ? 'h-14 w-14 text-3xl' : 'h-9 w-9 text-xl')}>🙂</span>}
              {p.name}
              {p.team && <span className="text-sm font-semibold" style={{ color: p.color ?? undefined }}>· {p.team}</span>}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
