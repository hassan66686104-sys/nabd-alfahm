// مكونات «تحدي الكأس» المشتركة بين المعلم وشاشة العرض والطالب
import { Crown, Medal, Shield, Snowflake, Trophy } from 'lucide-react';
import { cx } from './ui';
import { Avatar } from './Avatar';
import { eventText } from '@/lib/game';
import type { GameBoardRow, GameEvent, GameTeamRow } from '@/lib/types';

export function Leaderboard({ rows, target, limit = 10, large, showStats }: { rows: GameBoardRow[]; target?: number | null; limit?: number; large?: boolean; showStats?: boolean }) {
  const top = rows.slice(0, limit);
  const me = rows.findIndex((r) => r.me);
  return (
    <div className="space-y-1.5" data-testid="game-board">
      {top.length === 0 && <p className="py-4 text-center text-brand-600">لم ينضم أحد بعد.</p>}
      {top.map((r, i) => <Row key={r.id} r={r} i={i} target={target} large={large} showStats={showStats} />)}
      {me >= limit && <><div className="text-center text-brand-400">…</div><Row r={rows[me]} i={me} target={target} large={large} /></>}
    </div>
  );
}

function Row({ r, i, target, large, showStats }: { r: GameBoardRow; i: number; target?: number | null; large?: boolean; showStats?: boolean }) {
  return (
    <div className={cx('relative overflow-hidden rounded-xl border px-3 py-2', r.me ? 'border-gold-400 bg-gold-50' : 'border-brand-100 bg-white', large && 'py-3 text-2xl', r.out && 'opacity-60 grayscale')}>
      {target ? <div className="absolute inset-y-0 right-0 bg-brand-50" style={{ width: `${Math.min(100, (r.points / target) * 100)}%` }} aria-hidden /> : null}
      <div className="relative flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <span className={cx('flex shrink-0 items-center justify-center rounded-lg font-bold', large ? 'h-11 w-11' : 'h-8 w-8',
            i === 0 ? 'bg-gold-400 text-brand-900' : i === 1 ? 'bg-slate-200' : i === 2 ? 'bg-amber-200' : 'bg-brand-50')}>
            {i === 0 ? <Crown className={large ? 'h-6 w-6' : 'h-4 w-4'} /> : i + 1}
          </span>
          <Avatar id={r.avatar} size={large ? 'lg' : 'sm'} />
          {r.color && <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: r.color }} title={r.team ?? ''} />}
          <span className="truncate font-semibold">{r.name}{r.me && ' (أنت)'}</span>
          {r.out && <span className="shrink-0 text-sm font-bold text-red-600">💔 خرج</span>}
          {r.shield && <Shield className="h-4 w-4 shrink-0 text-sky-600" aria-label="لديه درع" />}
          {r.frozen && <Snowflake className="h-4 w-4 shrink-0 text-sky-400" aria-label="مجمّد" />}
        </span>
        <span className="flex items-center gap-3">
          {showStats && r.answered != null && <span className="text-sm text-brand-600">{r.correct}/{r.answered} صحيحة</span>}
          <span className="font-extrabold tabular-nums">{r.points}</span>
        </span>
      </div>
    </div>
  );
}

export function TeamScores({ teams, large }: { teams: GameTeamRow[]; large?: boolean }) {
  if (!teams.length) return null;
  const sorted = [...teams].sort((a, b) => b.points - a.points);
  return (
    <div className={cx('grid gap-2', sorted.length > 2 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2')}>
      {sorted.map((t, i) => (
        <div key={t.id} className={cx('rounded-xl border-2 bg-white p-2 text-center', large && 'p-4')} style={{ borderColor: t.color }}>
          <div className={cx('flex items-center justify-center gap-1 font-bold', large && 'text-2xl')}>{i === 0 && t.points > 0 && <Crown className="h-4 w-4 text-gold-400" />}{t.name}{t.mine && ' (مجموعتك)'}</div>
          <div className={cx('font-extrabold tabular-nums', large ? 'text-4xl' : 'text-2xl')} style={{ color: t.color }}>{t.points}</div>
        </div>
      ))}
    </div>
  );
}

export function EventFeed({ events, large }: { events: GameEvent[]; large?: boolean }) {
  if (!events.length) return <p className="py-2 text-center text-sm text-brand-500">ستظهر هنا أحداث التحدي: الكنوز والدروع ومن أخذ النقاط.</p>;
  return (
    <ul className={cx('space-y-1', large && 'text-xl')} data-testid="game-events">
      {events.map((e) => <li key={e.id} className="rounded-lg bg-white/80 px-2 py-1">{eventText(e)}</li>)}
    </ul>
  );
}

export function Podium({ rows, winner, prize, large }: { rows: GameBoardRow[]; winner: { id: string; name: string; avatar?: string | null } | null; prize?: string; large?: boolean }) {
  const top = rows.slice(0, 3);
  const medals = ['text-yellow-100', 'text-white', 'text-amber-100'];
  return (
    <div className="space-y-4 text-center" data-testid="game-podium">
      <Trophy className={cx('mx-auto animate-bounceIn text-yellow-400 motion-safe:animate-glow', large ? 'h-32 w-32' : 'h-24 w-24')} />
      {winner ? (
        <div>
          <div className={cx('text-brand-600', large && 'text-3xl')}>الكأس من نصيب</div>
          {winner.avatar && <Avatar id={winner.avatar} size="xl" className="my-2 motion-safe:animate-bounce" />}
          <div className={cx('animate-bounceIn bg-gradient-to-l from-fuchsia-600 via-orange-500 to-purple-700 bg-clip-text font-black text-transparent', large ? 'text-7xl' : 'text-4xl')} data-testid="game-winner">{winner.name}</div>
          {prize && <div className={cx('mt-2 inline-block rounded-full bg-gold-100 px-4 py-1 font-bold text-brand-900', large && 'text-3xl')}>🎁 {prize}</div>}
        </div>
      ) : <div className="text-xl font-bold">انتهى التحدي</div>}
      {top.length > 0 && (
        <div className="mx-auto grid max-w-xl grid-cols-3 items-end gap-2">
          {[1, 0, 2].map((idx) => top[idx] && (
            <div key={top[idx].id} style={{ animationDelay: `${(2 - idx) * 150}ms` }}
              className={cx('animate-bounceIn rounded-t-2xl bg-gradient-to-b p-2 text-white shadow-xl [animation-fill-mode:both]', idx === 0 ? 'from-yellow-300 to-orange-500 pb-8 pt-4' : idx === 1 ? 'from-sky-300 to-indigo-500 pb-4' : 'from-pink-300 to-fuchsia-600 pb-2')}>
              {top[idx].avatar ? <Avatar id={top[idx].avatar} size={large ? 'lg' : 'md'} className="mx-auto" /> : <Medal className={cx('mx-auto drop-shadow', large ? 'h-12 w-12' : 'h-8 w-8', medals[idx], idx === 0 && 'motion-safe:animate-wiggle')} />}
              <div className={cx('truncate font-bold', large && 'text-2xl')}>{top[idx].name}</div>
              <div className={cx('font-extrabold', large ? 'text-3xl' : 'text-lg')}>{top[idx].points}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
