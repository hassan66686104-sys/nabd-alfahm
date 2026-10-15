// متابعة «تحدي الكأس»: رمز الانضمام، البدء، الترتيب المباشر، الأحداث، ثم الفائز
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BarChart3, MonitorPlay, PlayCircle, Square, Timer, Trophy } from 'lucide-react';
import { Badge, Button, Card, ErrorBox, PageHeader, Spinner } from '@/components/ui';
import { useFeedback } from '@/components/feedback';
import { JoinInfo } from '@/components/live';
import { EventFeed, Leaderboard, Podium, TeamScores } from '@/components/challenge';
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

  const target = s.game.end === 'target' ? s.game.target ?? 100 : null;

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
              ? <><Badge tone="gold">بانتظار البدء</Badge><p className="mt-2 max-w-xs text-brand-600">عندما ينضم الطلاب اضغط «ابدأ التحدي». {c.questionCount} سؤالًا جاهزًا.</p></>
              : timeLeft != null
                ? <div className="inline-flex items-center gap-2 rounded-2xl bg-brand-700 px-5 py-3 text-3xl font-extrabold tabular-nums text-white" role="timer"><Timer className="h-7 w-7" />{formatClock(timeLeft)}</div>
                : <Badge tone="green">جارٍ الآن · الهدف {target} نقطة</Badge>}
          </div>
        </Card>
      )}

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
