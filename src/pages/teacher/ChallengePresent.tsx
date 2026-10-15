// شاشة العرض لـ«تحدي الكأس»: الترتيب المباشر والأحداث والعد التنازلي ثم منصة الفائزين
import { useEffect, useRef } from 'react';
import { Expand, Timer, Trophy } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { ErrorBox, Spinner } from '@/components/ui';
import { JoinInfo } from '@/components/live';
import { EventFeed, Leaderboard, Podium, TeamScores } from '@/components/challenge';
import SoundToggle from '@/components/SoundToggle';
import { useTick } from '@/components/QuestionView';
import { useChallenge } from '@/hooks/useChallenge';
import { formatClock, goalText } from '@/lib/game';
import { sfx } from '@/lib/sound';

export default function ChallengePresent({ id }: { id: string }) {
  const c = useChallenge(id);
  const now = useTick(500, c.clockOffset);
  const prev = useRef<string | null>(null);
  const lastEvent = useRef<number | null>(null);
  const s = c.session;

  useEffect(() => {
    if (!s) return;
    if (prev.current && prev.current !== s.status) { if (s.status === 'live') sfx.start(); if (s.status === 'ended') sfx.win(); }
    prev.current = s.status;
  }, [s]);
  useEffect(() => {
    const newest = c.feed[0]?.id ?? 0;
    if (lastEvent.current !== null && newest > lastEvent.current) {
      const k = c.feed[0].kind;
      if (k === 'bomb') sfx.bomb(); else if (k === 'take' || k === 'raid') sfx.take(); else if (k.startsWith('blocked') || k === 'roll_shield') sfx.shield(); else if (k === 'freeze') sfx.freeze(); else if (k !== 'trophy') sfx.coin();
    }
    lastEvent.current = newest;
  }, [c.feed]);

  if (c.loading) return <Spinner />;
  if (!s) return <div className="p-8"><ErrorBox error={c.error ?? 'التحدي غير موجود'} /></div>;
  const target = s.game.end === 'target' ? s.game.target ?? 100 : null;
  const timeLeft = s.ends_at ? new Date(s.ends_at).getTime() - now : null;

  return (
    <div className="min-h-dvh bg-ivory">
      <header className="flex items-center justify-between gap-4 bg-brand-800 px-6 py-3 text-white">
        <div className="flex items-center gap-3"><Logo className="h-10 w-10" /><Trophy className="h-8 w-8 text-gold-300" /><span className="text-2xl font-extrabold">{s.title}</span></div>
        <div className="flex items-center gap-3">
          {s.status === 'live' && timeLeft != null && <span className="flex items-center gap-2 rounded-xl bg-white/15 px-4 py-1 text-3xl font-extrabold tabular-nums"><Timer className="h-7 w-7" />{formatClock(timeLeft)}</span>}
          <SoundToggle />
          <button onClick={() => void document.documentElement.requestFullscreen?.().catch(() => {})} className="rounded-lg p-2 hover:bg-white/10" aria-label="ملء الشاشة"><Expand className="h-6 w-6" /></button>
        </div>
      </header>
      <main className="space-y-6 p-6">
        <div className="text-center text-2xl font-bold text-brand-700">{goalText(s.game)}{s.game.prize && <> · 🎁 {s.game.prize}</>}</div>
        {s.status === 'ended' ? (
          <Podium rows={c.rows} winner={c.winner} prize={s.game.prize} large />
        ) : (
          <>
            {s.status === 'lobby' && <div className="flex justify-center"><JoinInfo code={s.code} count={c.joined} large /></div>}
            {s.status === 'live' && <div className="flex justify-center"><JoinInfo code={s.code} count={c.joined} compact /></div>}
            <TeamScores teams={c.teamRows} large />
            <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
              <Leaderboard rows={c.rows} target={target} limit={10} large />
              <div className="rounded-2xl bg-ivory-100 p-4"><h2 className="mb-2 text-2xl font-extrabold">ماذا يحدث؟</h2><EventFeed events={c.feed.slice(0, 8)} large /></div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
