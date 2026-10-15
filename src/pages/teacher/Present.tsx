// شاشة العرض للصف (جهاز العرض): خط كبير، بلا أسماء حقيقية افتراضيًا، والنتائج حسب قرار المعلم
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Expand, Users } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { ErrorBox, OptionLetter, ProgressBar, Spinner, cx } from '@/components/ui';
import { DistributionChart, JoinInfo, LeaderboardView, WordCloud } from '@/components/live';
import { Countdown, QuestionImage, QuestionText, Stimulus } from '@/components/QuestionView';
import { useLiveSession, useNow } from '@/hooks/useLiveSession';
import { useSettings } from '@/hooks/useAuth';
import { computeLeaderboard, computeQuestionStats } from '@/lib/stats';
import { OPTION_LETTERS, gameLabel } from '@/lib/constants';
import ChallengePresent from './ChallengePresent';
import NativeBack from '@/components/NativeBack';

export default function Present() {
  const { id } = useParams();
  const settings = useSettings();
  const { session, sqs, participants, responses, teams, error, loading, clockOffset } = useLiveSession(id);
  const now = useNow(250, clockOffset);
  const [cloud, setCloud] = useState(true);
  const active = useMemo(() => participants.filter((p) => !p.is_removed), [participants]);
  const sq = sqs.find((s) => s.id === session?.current_sq_id && s.status !== 'draft') ?? null;
  const stats = useMemo(() => (sq ? computeQuestionStats(sq, active, responses, settings) : null), [sq, active, responses, settings]);
  const board = useMemo(() => computeLeaderboard(sqs, participants, responses, teams), [sqs, participants, responses, teams]);

  if (loading) return <Spinner />;
  if (error && !session) return <div className="p-8"><ErrorBox error={error} /></div>;
  if (!session) return null;
  if (session.mode === 'self') return <ChallengePresent id={session.id} />;

  const showNames = !session.hide_names && !session.anonymous;
  const showResults = !!sq && (!session.hide_results || sq.status === 'closed');
  const fmt = sq?.snapshot.answer_format;
  const textual = fmt === 'open' || fmt === 'short';
  const approved = sq ? responses.filter((r) => r.sq_id === sq.id && r.approved && !r.flagged) : [];

  const fullscreen = () => { void document.documentElement.requestFullscreen?.().catch(() => {}); };

  return (
    <div className="min-h-dvh bg-ivory">
      <header className="flex items-center justify-between gap-4 bg-brand-800 px-6 py-3 text-white">
        <div className="flex items-center gap-3"><NativeBack /><Logo className="h-10 w-10" /><span className="text-2xl font-extrabold">{session.title}</span></div>
        <div className="flex items-center gap-6 text-2xl font-bold">
          {sq && <span dir="ltr" className="font-mono tracking-widest text-gold-300">{session.code}</span>}
          <span className="flex items-center gap-2"><Users className="h-7 w-7" />{active.length}</span>
          <button onClick={fullscreen} className="rounded-lg p-2 hover:bg-brand-700" aria-label="ملء الشاشة"><Expand className="h-6 w-6" /></button>
        </div>
      </header>

      {session.status === 'ended' ? (
        <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 text-center">
          <Logo className="h-28 w-28" />
          <h1 className="text-6xl font-extrabold">انتهت الحصة</h1>
          <p className="text-3xl text-brand-600">شكرًا لمشاركتكم — اسأل، شارك، افهم</p>
        </div>
      ) : !sq ? (
        <div className="flex min-h-[80vh] flex-col items-center justify-center gap-8 px-6">
          <h1 className="text-5xl font-extrabold text-brand-800">انضم إلى الحصة</h1>
          <JoinInfo code={session.code} count={active.length} large />
        </div>
      ) : (
        <main className="w-full space-y-6 px-6 py-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-2xl">
              {sq.game_mode !== 'none' && <span className="rounded-full bg-gold-400 px-5 py-1.5 font-extrabold text-brand-900">{gameLabel(sq.game_mode)}{Number(sq.multiplier) > 1 && ` ×${Number(sq.multiplier)}`}</span>}
              {sq.status === 'closed' && <span className="rounded-full bg-brand-100 px-5 py-1.5 font-bold">أُغلق السؤال</span>}
            </div>
            {sq.status === 'open' && <Countdown closesAt={sq.closes_at} now={now} large />}
          </div>

          <Stimulus kind={sq.snapshot.stimulus_kind} text={sq.snapshot.stimulus_text} source={sq.snapshot.stimulus_source} large />
          <QuestionImage url={sq.snapshot.image_url} large />
          <QuestionText text={sq.snapshot.text} large blanksAs={fmt === 'blanks' ? 'line' : undefined} />

          {(fmt === 'single' || fmt === 'multi') && (
            <div className="grid gap-4 md:grid-cols-2">
              {sq.snapshot.options.map((o, i) => {
                const right = sq.revealed && o.is_correct;
                const count = stats?.distribution[i]?.count ?? 0;
                return (
                  <div key={o.id} className={cx('flex items-center gap-4 rounded-3xl border-4 bg-white p-5 text-3xl font-bold transition', right ? 'border-green-600 bg-green-50' : sq.revealed ? 'border-brand-100 opacity-60' : 'border-brand-100')}>
                    <OptionLetter letter={OPTION_LETTERS[i]} tone={right ? 'green' : 'brand'} />
                    <span className="flex-1">{o.text}</span>
                    {showResults && <span className="tabular-nums text-brand-700">{count}</span>}
                  </div>
                );
              })}
            </div>
          )}
          {sq.revealed && fmt === 'order' && <div className="rounded-3xl bg-green-50 p-6 text-3xl font-bold text-green-900">الترتيب الصحيح: {sq.snapshot.options.map((o) => o.text).join(' ← ')}</div>}
          {sq.revealed && fmt === 'match' && <div className="grid gap-3 md:grid-cols-2">{sq.snapshot.options.map((o) => <div key={o.id} className="rounded-2xl bg-green-50 p-4 text-2xl font-bold text-green-900">{o.text} ⟵ {o.match_text}</div>)}</div>}
          {sq.revealed && fmt === 'short' && (sq.snapshot.answer_key.accepted ?? []).length > 0 && <div className="rounded-3xl bg-green-50 p-6 text-3xl font-bold text-green-900">الإجابة: {sq.snapshot.answer_key.accepted!.join(' / ')}</div>}
          {sq.revealed && fmt === 'blanks' && <div className="rounded-3xl bg-green-50 p-6 text-3xl font-bold text-green-900">{(sq.snapshot.answer_key.blanks ?? []).map((b, i) => `(${i + 1}) ${b[0]}`).join('   ')}</div>}
          {sq.revealed && sq.snapshot.explanation && <div className="rounded-3xl bg-gold-50 p-6 text-2xl">{sq.snapshot.explanation}</div>}

          {stats && (
            <div className="space-y-2">
              <div className="flex justify-between text-2xl font-bold"><span>أجاب {stats.answered} من {stats.eligible}</span><span>{Math.round(stats.participation)}%</span></div>
              <ProgressBar value={stats.participation} className="h-6" tone="gold" label="نسبة المشاركة" />
            </div>
          )}

          {showResults && stats && (fmt === 'single' || fmt === 'multi') && stats.answered > 0 && (
            <div className="rounded-3xl bg-white p-4 shadow-card"><DistributionChart data={stats.distribution} showCorrect={sq.revealed} height={340} large /></div>
          )}
          {showResults && stats && !(fmt === 'single' || fmt === 'multi') && !textual && stats.answered > 0 && sq.revealed && (
            <div className="rounded-3xl bg-white p-6 text-center text-4xl font-extrabold shadow-card">إجابات صحيحة: {stats.correct} من {stats.answered}</div>
          )}

          {textual && (
            <div className="rounded-3xl bg-white p-6 shadow-card">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-3xl font-extrabold">إجابات الطلاب {approved.length > 0 && `(${approved.length})`}</h2>
                <button onClick={() => setCloud(!cloud)} className="rounded-xl bg-brand-50 px-4 py-2 text-xl font-bold">{cloud ? 'عرض البطاقات' : 'سحابة الكلمات'}</button>
              </div>
              {approved.length === 0 ? <p className="text-2xl text-brand-500">تظهر الإجابات هنا بعد أن يعتمدها المعلم.</p>
                : cloud ? <WordCloud texts={approved.map((r) => r.answer.text ?? '')} large />
                  : <div className="grid gap-3 md:grid-cols-3">{approved.map((r) => (
                    <div key={r.id} className="rounded-2xl bg-ivory-100 p-4 text-2xl">
                      <div>{r.answer.text}</div>
                      {showNames && <div className="mt-2 text-base text-brand-600">— {participants.find((p) => p.id === r.participant_id)?.display_name}</div>}
                    </div>))}</div>}
            </div>
          )}

          {(session.leaderboard_enabled || session.teams_enabled) && sq.revealed && (
            <div className="rounded-3xl bg-white p-6 shadow-card"><LeaderboardView data={board} showNames={showNames} large /></div>
          )}
        </main>
      )}
    </div>
  );
}
