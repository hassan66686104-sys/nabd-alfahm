// متابعة «تحدي الكأس»: رمز الانضمام، البدء، الترتيب المباشر، الأحداث، ثم الفائز
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BarChart3, CheckCircle2, ChevronLeft, ListOrdered, MonitorPlay, PlayCircle, Send, Square, Timer, Trophy } from 'lucide-react';
import { Badge, Button, Card, ErrorBox, PageHeader, ProgressBar, Spinner, cx } from '@/components/ui';
import { useFeedback } from '@/components/feedback';
import { JoinInfo } from '@/components/live';
import { EventFeed, Leaderboard, Podium, TeamScores } from '@/components/challenge';
import WaitingRoom from '@/components/WaitingRoom';
import { useTick } from '@/components/QuestionView';
import { useChallenge } from '@/hooks/useChallenge';
import { game } from '@/lib/api';
import { toAppError } from '@/lib/errors';
import { formatClock, goalText } from '@/lib/game';
import { openPresent } from '@/lib/native';

export default function ChallengeLive() {
  const { id } = useParams();
  const nav = useNavigate();
  const { toast, confirm } = useFeedback();
  const c = useChallenge(id);
  const now = useTick(500, c.clockOffset);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoEnded = useRef(false);
  const s = c.session;

  const timeLeft = s?.ends_at ? new Date(s.ends_at).getTime() - now : null;

  // عند انتهاء الوقت يُغلق التحدي ويُعلن الفائز حتى لو لم يفتح أي طالب الصفحة
  useEffect(() => {
    if (!s || s.status !== 'live' || timeLeft == null || timeLeft > 0 || autoEnded.current) return;
    autoEnded.current = true;
    game.end(s.id).then(() => c.reload()).catch(() => { autoEnded.current = false; });
  }, [s, timeLeft, c]);

  if (c.loading) return <Spinner />;
  if (!s) return <ErrorBox error={c.error ?? 'التحدي غير موجود'} />;

  const start = async () => {
    setBusy(true); setError(null);
    try { await game.start(s.id); await c.reload(); toast('بدأ التحدي! يرى الطلاب أسئلتهم الآن'); }
    catch (e) { setError(toAppError(e).message); }
    finally { setBusy(false); }
  };
  const finish = async () => {
    if (!(await confirm({ title: 'إنهاء التحدي؟', body: 'يتوقف الطلاب عن الإجابة ويُعلن صاحب أعلى نقاط فائزًا بالكأس.', confirmText: 'إنهاء التحدي', danger: true }))) return;
    setBusy(true); setError(null);
    try { await game.end(s.id); await c.reload(); toast('انتهى التحدي'); }
    catch (e) { setError(toAppError(e).message); }
    finally { setBusy(false); }
  };

  // وضع تحكم المعلم: «التالي» يرسل السؤال التالي، أو يختار المعلم سؤالًا بعينه
  const send = async (sqId: string | null = null) => {
    setBusy(true); setError(null);
    try {
      const r = await game.sendQuestion(s.id, sqId);
      if (!r.ok) setError(r.error === 'GAME_OVER' ? 'انتهى التحدي.' : r.error);
      else if (r.done) toast('أُرسلت كل الأسئلة. أنهِ التحدي لإعلان الفائز');
      else toast(`ظهر السؤال ${r.sent} من ${r.total} لكل الطلاب`);
      await c.reload();
    } catch (e) { setError(toAppError(e).message); }
    finally { setBusy(false); }
  };

  const target = s.game.end === 'target' ? s.game.target ?? 100 : null;
  // المعلم يتحكم في الوقت: قبل البدء يعدّل المدة، وأثناء اللعب يزيدها أو ينقصها
  const addTime = async (m: number) => {
    setError(null);
    try { await game.addTime(s.id, m); await c.reload(); toast(m > 0 ? `أضيفت ${m} دقيقة` : `أُنقصت ${-m} دقيقة`); }
    catch (e) { setError(toAppError(e).message); }
  };
  const timeButtons = (steps: number[]) => (
    <div className="flex flex-wrap justify-center gap-1.5" role="group" aria-label="تعديل الوقت" data-testid="time-controls">
      {steps.map((m) => (
        <Button key={m} size="sm" variant={m > 0 ? 'soft' : 'outline'} onClick={() => addTime(m)}>{m > 0 ? `+${m}` : `−${-m}`} د</Button>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title={<span className="flex items-center gap-2"><Trophy className="h-7 w-7 text-gold-400" />{s.title}</span>}
        subtitle={<>{goalText(s.game)}{s.game.prize && <> · الجائزة: <b>{s.game.prize}</b></>}</>}
        actions={<>
          <Button variant="outline" icon={<MonitorPlay className="h-5 w-5" />} onClick={() => openPresent(s.id, nav)}>شاشة العرض</Button>
          {s.status === 'lobby' && <Button variant="gold" icon={<PlayCircle className="h-5 w-5" />} loading={busy} onClick={start}>ابدأ التحدي</Button>}
          {s.status === 'live' && <Button variant="danger" icon={<Square className="h-5 w-5" />} loading={busy} onClick={finish}>إنهاء التحدي</Button>}
          {s.status === 'ended' && <Button icon={<BarChart3 className="h-5 w-5" />} onClick={() => nav(`/t/reports/${s.id}`)}>تقرير الفهم</Button>}
        </>}
      />
      {(error || c.error) && <ErrorBox error={(error ?? c.error)!} />}

      {s.status === 'ended' ? (
        <Card className="bg-gradient-to-b from-gold-50 to-white py-8"><Podium rows={c.rows} winner={c.winner} prize={s.game.prize} /></Card>
      ) : (
        <Card className="flex flex-wrap items-center justify-between gap-4">
          <JoinInfo code={s.code} count={c.joined} />
          <div className="text-center">
            {s.status === 'lobby'
              ? <div className="space-y-2">
                  <Badge tone="gold">بانتظار البدء</Badge>
                  <p className="max-w-xs text-brand-600">عندما ينضم الطلاب اضغط «ابدأ التحدي». {c.questionCount} سؤالًا جاهزًا.</p>
                  <div className="text-sm font-semibold text-brand-700" data-testid="planned-minutes">{s.game.minutes ? `⏱️ مدة اللعب: ${s.game.minutes} دقيقة` : '⏱️ بلا حد للوقت'}</div>
                  {timeButtons(s.game.minutes ? [-5, -1, 1, 5] : [5, 10])}
                </div>
              : timeLeft != null
                ? <div className="space-y-2">
                    <div className="inline-flex items-center gap-2 rounded-2xl bg-brand-700 px-5 py-3 text-3xl font-extrabold tabular-nums text-white" role="timer"><Timer className="h-7 w-7" />{formatClock(timeLeft)}</div>
                    {timeButtons([-5, -1, 1, 5])}
                  </div>
                : <div className="space-y-2"><Badge tone="green">جارٍ الآن · الهدف {target} نقطة</Badge>{timeButtons([5, 10])}<p className="text-xs text-brand-600">أضف وقتًا لتحديد موعد نهاية للتحدي</p></div>}
          </div>
        </Card>
      )}

      {c.paced && s.status === 'lobby' && (
        <Card className="flex items-center gap-3 bg-violet-50" data-testid="paced-note">
          <ListOrdered className="h-6 w-6 shrink-0 text-violet-600" />
          <p className="text-brand-800"><b>أنت تتحكم في الأسئلة:</b> عند البدء يظهر السؤال الأول لكل الطلاب معًا، ثم تضغط «التالي» لإرسال السؤال الذي يليه.</p>
        </Card>
      )}

      {c.paced && s.status === 'live' && (
        <Card className="space-y-3 ring-2 ring-violet-200" data-testid="paced-control">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-lg font-extrabold"><ListOrdered className="h-6 w-6 text-violet-600" />السؤال الحالي <Badge tone="gold">{c.paced.sent} من {c.paced.total}</Badge></h2>
            {c.paced.remaining.length > 0
              ? <Button size="lg" variant="gold" icon={<ChevronLeft className="h-6 w-6" />} loading={busy} onClick={() => send()} data-testid="paced-next">التالي: أرسل السؤال {c.paced.sent + 1}</Button>
              : <Button size="lg" variant="danger" icon={<Trophy className="h-6 w-6" />} loading={busy} onClick={finish}>انتهت الأسئلة: أنهِ التحدي وأعلن الفائز</Button>}
          </div>
          {c.paced.current ? (
            <div className="space-y-2 rounded-xl bg-ivory-100 p-3">
              <p className="text-lg font-bold" data-testid="paced-current-text">{c.paced.current.snapshot.text}</p>
              {c.paced.current.snapshot.options?.length > 0 && (
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {[...c.paced.current.snapshot.options].sort((a, b) => a.position - b.position).map((o) => (
                    <div key={o.id} className={cx('flex items-center gap-2 rounded-lg border px-3 py-1.5', o.is_correct ? 'border-emerald-300 bg-emerald-50 font-bold text-emerald-800' : 'border-brand-100 bg-white')}>
                      {o.is_correct && <CheckCircle2 className="h-4 w-4" />}{o.text}{o.match_text ? ` = ${o.match_text}` : ''}
                    </div>
                  ))}
                </div>
              )}
              <ProgressBar value={c.paced.active ? Math.min(100, (c.paced.answered / c.paced.active) * 100) : 0} label={`أجاب ${c.paced.answered} من ${c.paced.active}`} />
              <div className="text-sm font-semibold text-brand-700" data-testid="paced-answered">أجاب {c.paced.answered} من {c.paced.active} طالبًا · الإجابات الصحيحة {c.paced.correct}</div>
            </div>
          ) : <p className="text-brand-600">لا يوجد سؤال ظاهر الآن.</p>}
          {c.paced.remaining.length > 0 && (
            <details className="rounded-xl border border-brand-100 p-2">
              <summary className="cursor-pointer font-bold text-brand-700">أو اختر السؤال الذي ترسله ({c.paced.remaining.length} لم يُرسل بعد)</summary>
              <div className="mt-2 space-y-1.5">
                {c.paced.remaining.map((q) => (
                  <div key={q.id} className="flex items-center gap-2 rounded-lg bg-white p-2">
                    <span className="line-clamp-1 flex-1">{q.snapshot.text}</span>
                    <Button size="sm" variant="soft" icon={<Send className="h-4 w-4" />} disabled={busy} onClick={() => send(q.id)}>أرسله الآن</Button>
                  </div>
                ))}
              </div>
            </details>
          )}
        </Card>
      )}

      {s.status === 'lobby' && <Card className="bg-gradient-to-br from-violet-50 to-white"><WaitingRoom people={c.waiting} sound /></Card>}

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card className="space-y-3">
          <h2 className="text-lg font-extrabold">الترتيب</h2>
          <TeamScores teams={c.teamRows} />
          <Leaderboard rows={c.rows} target={target} limit={50} showStats />
        </Card>
        <Card className="space-y-2 bg-ivory-100">
          <h2 className="text-lg font-extrabold">ماذا يحدث الآن؟</h2>
          <EventFeed events={c.feed} />
        </Card>
      </div>
    </div>
  );
}
