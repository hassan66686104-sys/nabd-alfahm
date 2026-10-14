// لوحة المعلم أثناء الحصة: التحكم بالأسئلة + المؤشرات اللحظية + الإجابات المفتوحة + المشاركون
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  CheckCircle2, ChevronLeft, Clock, Dice5, Eye, EyeOff, Flag, LibraryBig, MonitorPlay, Plus, RotateCcw, Send, Shuffle, Square, TimerOff,
  UserMinus, Users, XCircle, AlertTriangle, Cloud, LayoutGrid, List,
} from 'lucide-react';
import { Badge, Button, Card, EmptyState, ErrorBox, Input, LevelBadge, Modal, OptionLetter, ProgressBar, Select, Spinner, StatCard, cx } from '@/components/ui';
import { useFeedback } from '@/components/feedback';
import { DistributionChart, JoinInfo, LeaderboardView, SyncBadge, WordCloud } from '@/components/live';
import { Countdown, QuestionImage, QuestionText, Stimulus } from '@/components/QuestionView';
import QuestionPicker from '@/components/QuestionPicker';
import QuestionForm from '@/components/QuestionForm';
import { useLiveSession, useNow } from '@/hooks/useLiveSession';
import { useSettings } from '@/hooks/useAuth';
import { addSessionQuestion, getQuestion, live, removeParticipant, removeSessionQuestion, reports, updateSession, updateSessionQuestion } from '@/lib/api';
import { toAppError } from '@/lib/errors';
import { computeLeaderboard, computeQuestionStats, suggestActions, summarizeSession } from '@/lib/stats';
import { GAME_MODES, OPTION_LETTERS, gameLabel, typeLabel } from '@/lib/constants';
import { formatDuration } from '@/lib/text';
import type { GameMode, ResponseRow, SessionQuestion } from '@/lib/types';

export default function LiveSession() {
  const { id } = useParams();
  const nav = useNavigate();
  const settings = useSettings();
  const { toast, confirm } = useFeedback();
  const data = useLiveSession(id);
  const { session, sqs, participants, responses, teams, error, loading, sync, clockOffset, reloadQuestions, reload } = data;
  const now = useNow(250, clockOffset);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [newQ, setNewQ] = useState(false);
  const [tab, setTab] = useState<'insights' | 'answers' | 'students' | 'board'>('insights');
  const [showNames, setShowNames] = useState(!settings.hide_names);
  const autoClosed = useRef<Set<string>>(new Set());

  const active = useMemo(() => participants.filter((p) => !p.is_removed), [participants]);
  const current = sqs.find((s) => s.id === session?.current_sq_id) ?? null;
  const selected = sqs.find((s) => s.id === selectedId) ?? current ?? sqs.find((s) => s.status === 'draft') ?? null;

  // اتباع السؤال الجاري تلقائيًا عند تغييره
  useEffect(() => { if (session?.current_sq_id) setSelectedId(session.current_sq_id); }, [session?.current_sq_id]);

  const thresholds = { mastery: settings.mastery, reinforce: settings.reinforce };
  const stats = useMemo(() => (selected ? computeQuestionStats(selected, active, responses, thresholds) : null), [selected, active, responses, thresholds.mastery, thresholds.reinforce]); // eslint-disable-line react-hooks/exhaustive-deps
  const board = useMemo(() => computeLeaderboard(sqs, participants, responses, teams), [sqs, participants, responses, teams]);
  const nameOf = useCallback((pid: string) => {
    const p = participants.find((x) => x.id === pid);
    return p ? (showNames && !session?.anonymous ? p.display_name : p.alias) : '—';
  }, [participants, showNames, session?.anonymous]);

  const act = useCallback(async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try { await fn(); if (ok) toast(ok); await reloadQuestions(); }
    catch (e) { toast(toAppError(e).message, 'error'); }
    finally { setBusy(null); }
  }, [toast, reloadQuestions]);

  // إغلاق السؤال تلقائيًا عند انتهاء الوقت
  useEffect(() => {
    if (!current || current.status !== 'open' || !current.closes_at) return;
    if (now > new Date(current.closes_at).getTime() + 1500 && !autoClosed.current.has(current.id)) {
      autoClosed.current.add(current.id);
      void act('close', () => live.close(current.id), 'انتهى الوقت وأُغلق السؤال');
    }
  }, [now, current, act]);

  if (loading) return <Spinner label="جارٍ تحميل الحصة…" />;
  if (error && !session) return <ErrorBox error={error} onRetry={reload} />;
  if (!session) return null;

  const ended = session.status === 'ended';
  const drafts = sqs.filter((s) => s.status === 'draft');
  const nextDraft = [...drafts].sort((a, b) => a.position - b.position)[0];

  const push = (sq: SessionQuestion) => act('push', () => live.push(sq.id), 'أُرسل السؤال إلى الطلاب');
  const next = () => {
    if (!nextDraft) { toast('لا توجد أسئلة أخرى في القائمة. أضف سؤالًا من البنك أو سؤالًا جديدًا.', 'info'); return; }
    void push(nextDraft);
  };
  const surprise = () => {
    if (!drafts.length) { toast('لا توجد أسئلة متبقية للمفاجأة', 'info'); return; }
    const pick = drafts[Math.floor(Math.random() * drafts.length)];
    void act('push', async () => { await updateSessionQuestion(pick.id, { game_mode: 'surprise' }); await live.push(pick.id); }, 'سؤال مفاجئ!');
  };
  const endSession = async () => {
    if (!(await confirm({ title: 'إنهاء الحصة؟', body: 'سيُغلق السؤال الحالي ولن يستطيع الطلاب الانضمام أو الإجابة. تبقى النتائج محفوظة في تقاريرك.', confirmText: 'إنهاء الحصة', danger: true }))) return;
    setBusy('end');
    try {
      await live.end(session.id);
      await reload();
      // نحفظ لقطة التقرير؛ وإن فشلت تُنشأ تلقائيًا عند فتح التقرير
      const fresh = { ...session, status: 'ended' as const, ended_at: new Date().toISOString() };
      await reports.save(session.id, summarizeSession(fresh, sqs.map((s) => (s.status === 'open' ? { ...s, status: 'closed' as const } : s)), participants, responses, teams, thresholds)).catch(() => {});
      toast('انتهت الحصة وحُفظ التقرير');
      nav(`/t/reports/${session.id}`);
    } catch (e) { toast(toAppError(e).message, 'error'); }
    finally { setBusy(null); }
  };

  const addFromBank = async (ids: { id: string; time_limit_seconds: number | null; type: string }[]) => {
    try {
      for (const q of ids) await addSessionQuestion(session.id, q.id, { time_limit_seconds: q.time_limit_seconds, game_mode: q.type === 'exit_ticket' ? 'exit' : 'none' });
      toast(`أضيف ${ids.length} سؤال إلى القائمة`);
      await reloadQuestions();
    } catch (e) { toast(toAppError(e).message, 'error'); }
  };

  return (
    <div className="space-y-4">
      {/* رأس الحصة */}
      <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-extrabold sm:text-2xl">{session.title}</h1>
            <SyncBadge sync={sync} />
            {ended && <Badge tone="gray">منتهية</Badge>}
          </div>
          {!ended && <JoinInfo code={session.code} count={active.length} compact />}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" icon={<MonitorPlay className="h-5 w-5" />} onClick={() => window.open(`/present/${session.id}`, `present-${session.id}`, 'noopener')}>شاشة العرض</Button>
          {ended
            ? <Button onClick={() => nav(`/t/reports/${session.id}`)}>التقرير</Button>
            : <Button variant="danger" icon={<Flag className="h-5 w-5" />} loading={busy === 'end'} onClick={endSession}>إنهاء الحصة</Button>}
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {/* السؤال المحدد والتحكم */}
          {!selected ? (
            <EmptyState icon={<LibraryBig className="h-10 w-10" />} title="لا توجد أسئلة في هذه الحصة بعد"
              action={<div className="flex gap-2"><Button onClick={() => setPicker(true)}>من بنك الأسئلة</Button><Button variant="soft" onClick={() => setNewQ(true)}>سؤال جديد</Button></div>}>
              أضف سؤالًا ثم أرسله إلى الطلاب.
            </EmptyState>
          ) : (
            <Card className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={selected.status === 'open' ? 'green' : selected.status === 'closed' ? 'gray' : 'gold'}>
                    {selected.status === 'open' ? 'مفتوح للإجابة' : selected.status === 'closed' ? 'مغلق' : 'لم يُرسل بعد'}
                  </Badge>
                  <Badge>{typeLabel(selected.snapshot.type)}</Badge>
                  {selected.game_mode !== 'none' && <Badge tone="gold">{gameLabel(selected.game_mode)}{Number(selected.multiplier) > 1 && ` ×${Number(selected.multiplier)}`}</Badge>}
                  {selected.revealed && <Badge tone="blue">الإجابة مكشوفة</Badge>}
                  {selected.allow_retry && <Badge tone="yellow">إعادة المحاولة مفعلة</Badge>}
                </div>
                {selected.status === 'open' && <Countdown closesAt={selected.closes_at} now={now} />}
              </div>
              <Stimulus kind={selected.snapshot.stimulus_kind} text={selected.snapshot.stimulus_text} source={selected.snapshot.stimulus_source} />
              <QuestionImage url={selected.snapshot.image_url} />
              <QuestionText text={selected.snapshot.text} blanksAs={selected.snapshot.answer_format === 'blanks' ? 'line' : undefined} />
              {(selected.snapshot.answer_format === 'single' || selected.snapshot.answer_format === 'multi') && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {selected.snapshot.options.map((o, i) => {
                    const count = stats?.distribution[i]?.count ?? 0;
                    const pct = stats && stats.answered ? (count / stats.answered) * 100 : 0;
                    return (
                      <div key={o.id} className={cx('relative overflow-hidden rounded-xl border-2 p-2', o.is_correct ? 'border-green-500' : 'border-brand-100')}>
                        <div className="absolute inset-y-0 right-0 bg-brand-50 transition-all" style={{ width: `${pct}%` }} />
                        <div className="relative flex items-center gap-2">
                          <OptionLetter letter={OPTION_LETTERS[i]} tone={o.is_correct ? 'green' : 'brand'} />
                          <span className="flex-1 font-semibold">{o.text}</span>
                          <span className="font-extrabold tabular-nums">{selected.status === 'draft' ? '' : count}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {selected.snapshot.answer_format === 'order' && <p className="text-sm text-brand-600">الترتيب الصحيح: {selected.snapshot.options.map((o) => o.text).join(' ← ')}</p>}
              {selected.snapshot.answer_format === 'match' && <p className="text-sm text-brand-600">الأزواج: {selected.snapshot.options.map((o) => `${o.text} = ${o.match_text}`).join('، ')}</p>}
              {selected.snapshot.answer_format === 'short' && <p className="text-sm text-brand-600">الإجابات المقبولة: {(selected.snapshot.answer_key.accepted ?? []).join(' / ') || 'تصحيح يدوي'}</p>}

              {stats && selected.status !== 'draft' && (
                <div className="space-y-1">
                  <div className="flex justify-between text-sm font-semibold"><span>أجاب {stats.answered} من {stats.eligible}</span><span>{Math.round(stats.participation)}%</span></div>
                  <ProgressBar value={stats.participation} label="نسبة المشاركة" />
                </div>
              )}

              {/* أزرار التحكم */}
              {!ended && (
                <div className="flex flex-wrap gap-2 border-t border-brand-50 pt-3">
                  {selected.status === 'draft' && <>
                    <Button size="lg" icon={<Send className="h-5 w-5" />} loading={busy === 'push'} onClick={() => push(selected)}>إرسال السؤال</Button>
                    <DraftSettings sq={selected} teams={teams} onSaved={reloadQuestions} />
                    <Button variant="ghost" className="text-red-700" onClick={() => act('rm', () => removeSessionQuestion(selected.id), 'أزيل من القائمة')}>إزالة من القائمة</Button>
                  </>}
                  {selected.status === 'open' && <>
                    <Button size="lg" variant="danger" icon={<Square className="h-5 w-5" />} loading={busy === 'close'} onClick={() => act('close', () => live.close(selected.id), 'أُغلق السؤال')}>إغلاق السؤال</Button>
                    {selected.closes_at && <Button variant="outline" icon={<TimerOff className="h-5 w-5" />} onClick={() => act('timer', () => live.cancelTimer(selected.id), 'أُلغي المؤقت')}>إلغاء المؤقت</Button>}
                  </>}
                  {selected.status !== 'draft' && (
                    selected.revealed
                      ? <Button variant="outline" icon={<EyeOff className="h-5 w-5" />} onClick={() => act('reveal', () => live.reveal(selected.id, false))}>إخفاء الإجابة</Button>
                      : <Button variant="gold" size="lg" icon={<Eye className="h-5 w-5" />} loading={busy === 'reveal'} onClick={() => act('reveal', () => live.reveal(selected.id, true), 'كُشفت الإجابة الصحيحة للطلاب')}>إظهار الإجابة الصحيحة</Button>
                  )}
                  {selected.status === 'closed' && <>
                    <Button variant="outline" icon={<RotateCcw className="h-5 w-5" />} onClick={() => act('retry', () => live.reopen(selected.id, selected.time_limit_seconds), 'أعيد فتح السؤال مع السماح بتغيير الإجابة')}>إعادة المحاولة</Button>
                    {session.leaderboard_enabled && <Button variant="outline" icon={<Dice5 className="h-5 w-5" />} onClick={() => act('luck', async () => { const m = await live.drawLuck(selected.id); toast(`بطاقة الحظ: ×${m}`, 'info'); })}>بطاقة الحظ</Button>}
                  </>}
                  <Button size="lg" variant="soft" icon={<ChevronLeft className="h-5 w-5" />} loading={busy === 'push'} onClick={next} disabled={!nextDraft}>السؤال التالي</Button>
                  {drafts.length > 1 && <Button variant="ghost" icon={<Shuffle className="h-5 w-5" />} onClick={surprise}>سؤال مفاجئ</Button>}
                </div>
              )}
            </Card>
          )}

          {/* اللوحات */}
          {selected && selected.status !== 'draft' && stats && (
            <Card className="space-y-4">
              <div className="flex flex-wrap gap-1 rounded-xl bg-brand-50 p-1">
                {([
                  ['insights', 'مؤشرات الفهم'],
                  ['answers', `الإجابات (${stats.answered})`],
                  ['students', 'الطلاب'],
                  ...(session.leaderboard_enabled || session.teams_enabled ? [['board', 'الترتيب']] : []),
                ] as [typeof tab, string][]).map(([k, label]) => (
                  <button key={k} onClick={() => setTab(k)} className={cx('flex-1 rounded-lg px-3 py-2 text-sm font-bold', tab === k ? 'bg-white shadow' : 'text-brand-600')}>{label}</button>
                ))}
              </div>
              {tab === 'insights' && <Insights sq={selected} stats={stats} nameOf={nameOf} />}
              {tab === 'answers' && <Answers sq={selected} responses={responses.filter((r) => r.sq_id === selected.id)} nameOf={nameOf} onChanged={reload} />}
              {tab === 'students' && (
                <StudentsPanel
                  participants={active}
                  answered={new Set(responses.filter((r) => r.sq_id === selected.id).map((r) => r.participant_id))}
                  correctness={new Map(responses.filter((r) => r.sq_id === selected.id).map((r) => [r.participant_id, r.is_correct]))}
                  nameOf={nameOf}
                  teams={teams}
                  onRemove={async (pid) => { if (await confirm({ title: 'إزالة الطالب من الحصة؟', body: 'لن يستطيع الإجابة عن الأسئلة التالية. تبقى إجاباته السابقة محفوظة.', danger: true, confirmText: 'إزالة' })) await act('rmp', () => removeParticipant(pid), 'أزيل الطالب'); await reload(); }}
                />
              )}
              {tab === 'board' && <LeaderboardView data={board} showNames={showNames && !session.anonymous} />}
              <div className="flex items-center justify-end gap-2 text-sm">
                <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-brand-700" checked={showNames} onChange={(e) => setShowNames(e.target.checked)} disabled={session.anonymous} />إظهار الأسماء الحقيقية على شاشتي</label>
              </div>
            </Card>
          )}
        </div>

        {/* قائمة الأسئلة */}
        <aside className="space-y-3">
          <Card className="space-y-3 p-3">
            <div className="flex items-center justify-between">
              <h2 className="font-extrabold">أسئلة الحصة</h2>
              <Badge>{sqs.filter((s) => s.status !== 'draft').length} / {sqs.length}</Badge>
            </div>
            <div className="max-h-[50vh] space-y-1.5 overflow-y-auto">
              {sqs.map((s, i) => (
                <button key={s.id} onClick={() => setSelectedId(s.id)}
                  className={cx('flex w-full items-start gap-2 rounded-xl border p-2 text-start text-sm', selected?.id === s.id ? 'border-brand-600 bg-brand-50' : 'border-brand-100 hover:bg-ivory-100')}>
                  <span className={cx('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold', s.status === 'open' ? 'bg-green-600 text-white' : s.status === 'closed' ? 'bg-brand-200' : 'bg-gold-100')}>{i + 1}</span>
                  <span className="line-clamp-2 flex-1">{s.snapshot.text}</span>
                  {s.status === 'closed' && <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-400" />}
                </button>
              ))}
            </div>
            {!ended && (
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant="outline" icon={<LibraryBig className="h-4 w-4" />} onClick={() => setPicker(true)}>من البنك</Button>
                <Button size="sm" variant="soft" icon={<Plus className="h-4 w-4" />} onClick={() => setNewQ(true)}>سؤال جديد</Button>
              </div>
            )}
          </Card>
          {!ended && (
            <Card className="space-y-1 p-3 text-sm">
              <h3 className="font-bold">إعدادات العرض</h3>
              <label className="flex items-center justify-between py-1">إخفاء النتائج حتى الإغلاق<input type="checkbox" className="h-5 w-5 accent-brand-700" checked={session.hide_results} onChange={(e) => act('s', () => updateSession(session.id, { hide_results: e.target.checked }))} /></label>
              <label className="flex items-center justify-between py-1">أسماء مستعارة على الشاشة<input type="checkbox" className="h-5 w-5 accent-brand-700" checked={session.hide_names} onChange={(e) => act('s', () => updateSession(session.id, { hide_names: e.target.checked }))} /></label>
              <label className="flex items-center justify-between py-1">النقاط والترتيب<input type="checkbox" className="h-5 w-5 accent-brand-700" checked={session.leaderboard_enabled} onChange={(e) => act('s', () => updateSession(session.id, { leaderboard_enabled: e.target.checked }))} /></label>
              <label className="flex items-center justify-between py-1">عرض الإجابات المفتوحة تلقائيًا<input type="checkbox" className="h-5 w-5 accent-brand-700" checked={session.auto_approve_open} onChange={(e) => act('s', () => updateSession(session.id, { auto_approve_open: e.target.checked }))} /></label>
            </Card>
          )}
        </aside>
      </div>

      <QuestionPicker open={picker} onClose={() => setPicker(false)} exclude={sqs.map((s) => s.question_id ?? '')} onPick={(qs) => addFromBank(qs.map((q) => ({ id: q.id, time_limit_seconds: q.time_limit_seconds, type: q.type })))} />
      <Modal open={newQ} onClose={() => setNewQ(false)} title="سؤال جديد" wide>
        <QuestionForm compact onCancel={() => setNewQ(false)} onSaved={async (qid) => {
          setNewQ(false);
          try { const q = await getQuestion(qid); await addFromBank([{ id: q.id, time_limit_seconds: q.time_limit_seconds, type: q.type }]); } catch (e) { toast(toAppError(e).message, 'error'); }
        }} />
      </Modal>
    </div>
  );
}

function DraftSettings({ sq, teams, onSaved }: { sq: SessionQuestion; teams: { id: string; name: string }[]; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [time, setTime] = useState(sq.time_limit_seconds ? String(sq.time_limit_seconds) : '');
  const [game, setGame] = useState<GameMode>(sq.game_mode);
  const [retry, setRetry] = useState(sq.allow_retry);
  const [points, setPoints] = useState(String(sq.points));
  const [team, setTeam] = useState(sq.team_id ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setTime(sq.time_limit_seconds ? String(sq.time_limit_seconds) : ''); setGame(sq.game_mode); setRetry(sq.allow_retry); setPoints(String(sq.points)); setTeam(sq.team_id ?? '');
  }, [sq]);
  const save = async () => {
    const t = time ? Number(time) : null;
    if (t != null && (t < 3 || t > 3600)) return setErr('الزمن بين 3 ثوانٍ وساعة');
    if (Number(points) < 0 || Number.isNaN(Number(points))) return setErr('درجة غير صالحة');
    setBusy(true);
    try {
      await updateSessionQuestion(sq.id, { time_limit_seconds: game === 'five_seconds' ? 5 : t, game_mode: game, allow_retry: retry, points: Number(points), team_id: team || null, multiplier: game === 'golden' ? 2 : 1 });
      await onSaved(); setOpen(false);
    } catch (e) { setErr(toAppError(e).message); } finally { setBusy(false); }
  };
  return (
    <>
      <Button variant="outline" icon={<Clock className="h-5 w-5" />} onClick={() => setOpen(true)}>إعدادات السؤال</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="إعدادات السؤال قبل إرساله" footer={<><Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button><Button loading={busy} onClick={save}>حفظ</Button></>}>
        <div className="space-y-3">
          <label className="block"><span className="text-sm font-semibold">الزمن بالثواني (فارغ = بلا مؤقت)</span><Input type="number" min={3} value={game === 'five_seconds' ? '5' : time} disabled={game === 'five_seconds'} onChange={(e) => setTime(e.target.value)} /></label>
          <label className="block"><span className="text-sm font-semibold">الدرجة</span><Input type="number" min={0} step="0.5" value={points} onChange={(e) => setPoints(e.target.value)} /></label>
          <label className="block"><span className="text-sm font-semibold">وضع اللعبة</span>
            <Select value={game} onChange={(e) => setGame(e.target.value as GameMode)}>{GAME_MODES.map((g) => <option key={g.value} value={g.value}>{g.label} — {g.hint}</option>)}</Select>
          </label>
          {teams.length > 0 && (
            <label className="block"><span className="text-sm font-semibold">موجّه إلى فريق</span>
              <Select value={team} onChange={(e) => setTeam(e.target.value)}><option value="">كل الطلاب</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
            </label>
          )}
          <label className="flex items-center gap-2"><input type="checkbox" className="h-5 w-5 accent-brand-700" checked={retry} onChange={(e) => setRetry(e.target.checked)} />السماح بتغيير الإجابة قبل الإغلاق</label>
          {err && <p className="text-red-700">{err}</p>}
        </div>
      </Modal>
    </>
  );
}

function Insights({ sq, stats, nameOf }: { sq: SessionQuestion; stats: ReturnType<typeof computeQuestionStats>; nameOf: (id: string) => string }) {
  const suggestions = suggestActions(stats, sq);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatCard label="المشاركون" value={stats.eligible} icon={<Users className="h-5 w-5" />} />
        <StatCard label="أجابوا" value={stats.answered} sub={`لم يجيبوا: ${stats.notAnswered} · مشاركة ${Math.round(stats.participation)}%`} tone="gold" />
        <StatCard label="إجابات صحيحة" value={stats.correct} sub={`خاطئة: ${stats.incorrect}${stats.pending ? ` · للمراجعة: ${stats.pending}` : ''}`} icon={<CheckCircle2 className="h-5 w-5" />} tone="green" />
        <StatCard label="نسبة الصحة" value={stats.correctPct == null ? '—' : `${Math.round(stats.correctPct)}%`} sub={`متوسط الزمن ${formatDuration(stats.avgMs)}`} tone={stats.level === 'green' ? 'green' : stats.level === 'red' ? 'red' : 'yellow'} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <LevelBadge level={stats.level} pct={stats.correctPct} />
        {stats.mostChosen && <Badge tone="gray">الأكثر اختيارًا: {stats.mostChosen.label} ({stats.mostChosen.count})</Badge>}
      </div>
      {stats.distribution.length > 0 && <DistributionChart data={stats.distribution} showCorrect />}
      {stats.textAnswers.length > 0 && (
        <div>
          <h4 className="mb-1 font-bold">الإجابات المتكررة</h4>
          <div className="flex flex-wrap gap-1.5">{stats.textAnswers.slice(0, 12).map((t) => <Badge key={t.text} tone="gray">{t.text} ×{t.count}</Badge>)}</div>
        </div>
      )}
      <div className={cx('rounded-2xl p-4', stats.level === 'red' ? 'bg-red-50' : stats.level === 'yellow' ? 'bg-amber-50' : stats.level === 'green' ? 'bg-green-50' : 'bg-brand-50')}>
        <h4 className="mb-2 flex items-center gap-2 font-extrabold"><AlertTriangle className="h-5 w-5" />ماذا أفعل الآن؟</h4>
        <ul className="list-inside list-disc space-y-1">{suggestions.map((s) => <li key={s}>{s}</li>)}</ul>
        <p className="mt-2 text-xs text-brand-600">نتيجة سؤال واحد مؤشر مساعد وليست حكمًا نهائيًا على مستوى الطالب.</p>
      </div>
      {(stats.wrong.length > 0 || stats.missing.length > 0) && (
        <div className="rounded-2xl border border-brand-100 p-3">
          <h4 className="mb-2 font-extrabold">طلاب قد يحتاجون إلى دعم <span className="text-xs font-normal text-brand-600">(يظهر لك فقط)</span></h4>
          {stats.wrong.length > 0 && <div className="mb-1 flex flex-wrap gap-1"><span className="text-sm font-semibold text-red-700">أخطؤوا:</span>{stats.wrong.map((id) => <Badge key={id} tone="red">{nameOf(id)}</Badge>)}</div>}
          {stats.missing.length > 0 && <div className="flex flex-wrap gap-1"><span className="text-sm font-semibold text-amber-700">لم يجيبوا:</span>{stats.missing.map((id) => <Badge key={id} tone="yellow">{nameOf(id)}</Badge>)}</div>}
        </div>
      )}
    </div>
  );
}

function Answers({ sq, responses, nameOf, onChanged }: { sq: SessionQuestion; responses: ResponseRow[]; nameOf: (id: string) => string; onChanged: () => Promise<void> }) {
  const { toast } = useFeedback();
  const [view, setView] = useState<'list' | 'cards' | 'cloud'>(sq.snapshot.answer_format === 'open' ? 'cards' : 'list');
  const fmt = sq.snapshot.answer_format;
  const textual = fmt === 'open' || fmt === 'short' || fmt === 'blanks';
  const optText = (id?: string) => sq.snapshot.options.find((o) => o.id === id)?.text ?? '—';
  const render = (r: ResponseRow) => {
    const a = r.answer;
    if (fmt === 'single') return optText(a.option_id);
    if (fmt === 'multi') return (a.option_ids ?? []).map(optText).join('، ');
    if (fmt === 'order') return (a.order ?? []).map(optText).join(' ← ');
    if (fmt === 'match') return Object.entries(a.pairs ?? {}).map(([k, v]) => `${optText(k)} = ${v}`).join('، ');
    if (fmt === 'blanks') return (a.blanks ?? []).join(' / ');
    return a.text ?? '';
  };
  const run = async (fn: () => Promise<unknown>) => { try { await fn(); await onChanged(); } catch (e) { toast(toAppError(e).message, 'error'); } };
  const sorted = [...responses].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  if (!responses.length) return <p className="py-6 text-center text-brand-600">لم تصل إجابات بعد.</p>;
  return (
    <div className="space-y-3">
      {textual && (
        <div className="flex gap-1">
          <Button size="sm" variant={view === 'list' ? 'primary' : 'outline'} icon={<List className="h-4 w-4" />} onClick={() => setView('list')}>قائمة</Button>
          <Button size="sm" variant={view === 'cards' ? 'primary' : 'outline'} icon={<LayoutGrid className="h-4 w-4" />} onClick={() => setView('cards')}>بطاقات</Button>
          <Button size="sm" variant={view === 'cloud' ? 'primary' : 'outline'} icon={<Cloud className="h-4 w-4" />} onClick={() => setView('cloud')}>سحابة كلمات</Button>
        </div>
      )}
      {textual && <p className="text-xs text-brand-600">«اعتماد» يعرض الإجابة على شاشة العرض العامة. الإجابات التي قد تحتوي معلومات شخصية معلَّمة ولا تُعتمد تلقائيًا.</p>}
      {view === 'cloud' && textual ? <WordCloud texts={responses.map(render)} /> : (
        <div className={cx(view === 'cards' ? 'grid gap-2 sm:grid-cols-2' : 'space-y-1.5')}>
          {sorted.map((r) => (
            <div key={r.id} className={cx('rounded-xl border p-2.5', r.flagged ? 'border-amber-400 bg-amber-50' : 'border-brand-100 bg-white')}>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-bold">{nameOf(r.participant_id)}</span>
                <span className="flex items-center gap-1">
                  {r.flagged && <Badge tone="yellow">قد تحتوي معلومات شخصية</Badge>}
                  {r.attempts > 1 && <Badge tone="gray">محاولة {r.attempts}</Badge>}
                  {r.is_correct === true && <Badge tone="green">صحيحة</Badge>}
                  {r.is_correct === false && <Badge tone="red">خاطئة</Badge>}
                  {r.is_correct === null && <Badge tone="yellow">للمراجعة</Badge>}
                </span>
              </div>
              <div className={cx('mt-1 whitespace-pre-wrap break-words', view === 'cards' && 'text-lg')}>{render(r)}</div>
              <div className="mt-2 flex flex-wrap gap-1">
                {(r.needs_review || r.is_correct === null || textual) && <>
                  <Button size="sm" variant={r.is_correct === true ? 'primary' : 'outline'} icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => run(() => live.grade(r.id, true))}>صحيحة</Button>
                  <Button size="sm" variant={r.is_correct === false ? 'danger' : 'outline'} icon={<XCircle className="h-4 w-4" />} onClick={() => run(() => live.grade(r.id, false))}>خاطئة</Button>
                </>}
                {textual && <Button size="sm" variant={r.approved ? 'gold' : 'ghost'} onClick={() => run(() => live.approve(r.id, !r.approved))}>{r.approved ? 'معتمدة للعرض ✓' : 'اعتماد للعرض'}</Button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StudentsPanel({ participants, answered, correctness, nameOf, teams, onRemove }: {
  participants: { id: string; team_id: string | null; last_seen_at: string }[]; answered: Set<string>; correctness: Map<string, boolean | null>;
  nameOf: (id: string) => string; teams: { id: string; name: string; color: string }[]; onRemove: (id: string) => void;
}) {
  if (!participants.length) return <p className="py-6 text-center text-brand-600">لم ينضم أي طالب بعد.</p>;
  const teamOf = (id: string | null) => teams.find((t) => t.id === id);
  return (
    <div className="grid gap-1.5 sm:grid-cols-2">
      {participants.map((p) => {
        const c = correctness.get(p.id);
        const recent = Date.now() - new Date(p.last_seen_at).getTime() < 60000;
        return (
          <div key={p.id} className="flex items-center justify-between rounded-xl border border-brand-100 bg-white px-3 py-2">
            <span className="flex items-center gap-2">
              <span className={cx('h-2.5 w-2.5 rounded-full', recent ? 'bg-green-500' : 'bg-gray-300')} title={recent ? 'متصل' : 'غير نشط مؤخرًا'} />
              <span className="font-semibold">{nameOf(p.id)}</span>
              {teamOf(p.team_id) && <span className="text-xs font-bold" style={{ color: teamOf(p.team_id)!.color }}>{teamOf(p.team_id)!.name}</span>}
            </span>
            <span className="flex items-center gap-1">
              {!answered.has(p.id) ? <Badge tone="gray">لم يُجب</Badge> : c === true ? <Badge tone="green">صحيحة</Badge> : c === false ? <Badge tone="red">خاطئة</Badge> : <Badge tone="yellow">أجاب</Badge>}
              <button onClick={() => onRemove(p.id)} className="rounded p-1 text-brand-400 hover:text-red-600" aria-label="إزالة الطالب"><UserMinus className="h-4 w-4" /></button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

