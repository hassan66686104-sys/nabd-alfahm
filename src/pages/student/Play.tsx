import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { CheckCircle2, CloudOff, Coffee, Loader2, PartyPopper, Star, XCircle } from 'lucide-react';
import { Logo, Credit } from '@/components/Logo';
import { Badge, Button, Card, ErrorBox, cx } from '@/components/ui';
import { OfflineBanner } from '@/components/feedback';
import { AnswerInput, answerComplete, emptyAnswer } from '@/components/AnswerInput';
import { Countdown, Hint, QuestionImage, QuestionText, Stimulus, useTick } from '@/components/QuestionView';
import { participantStore, useStudent } from '@/hooks/useStudent';
import { gameLabel } from '@/lib/constants';
import type { Answer } from '@/lib/types';

export default function Play() {
  const stored = useMemo(() => participantStore.get(), []);
  const nav = useNavigate();
  const { state, fatal, transient, live, clockOffset, submit, answer, resetSubmit } = useStudent(stored);
  const now = useTick(250, clockOffset);
  const q = state?.question ?? null;
  const [draft, setDraft] = useState<Answer>({});
  const [draftKey, setDraftKey] = useState('');

  const attemptKey = q ? `${q.sq_id}:${q.my_response?.attempts ?? 0}:${q.allow_retry ? 'r' : ''}` : '';

  // تهيئة الإجابة عند ظهور سؤال جديد أو فتح محاولة جديدة
  useEffect(() => {
    if (!q) return;
    const key = `${q.sq_id}:${q.allow_retry}`;
    if (key !== draftKey) {
      setDraft(q.my_response?.answer ?? emptyAnswer(q));
      setDraftKey(key);
      resetSubmit();
    }
  }, [q, draftKey, resetSubmit]);

  if (!stored) return <Navigate to="/join" replace />;

  if (fatal) {
    return (
      <Shell>
        <Card className="space-y-4 text-center">
          <XCircle className="mx-auto h-12 w-12 text-red-600" />
          <p className="text-lg">{fatal}</p>
          <Button onClick={() => { participantStore.clear(); nav('/join'); }}>الانضمام إلى حصة</Button>
        </Card>
      </Shell>
    );
  }

  if (!state) {
    return <Shell><div className="flex items-center justify-center gap-2 py-20 text-white"><Loader2 className="h-6 w-6 animate-spin" />{transient ?? 'جارٍ الاتصال بالحصة…'}</div></Shell>;
  }

  const header = (
    <div className="flex items-center justify-between gap-2 text-white">
      <div className="flex items-center gap-2">
        <Logo className="h-9 w-9" />
        <div className="leading-tight">
          <div className="font-bold">{state.session.title}</div>
          <div className="text-sm text-brand-100">{state.me.display_name}{state.me.team && <> · فريق <span style={{ color: '#fde68a' }}>{state.me.team.name}</span></>}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {state.session.leaderboard_enabled && state.me.points != null && <Badge tone="gold"><Star className="h-3.5 w-3.5" />{Number(state.me.points)} نقطة</Badge>}
        <span className={cx('h-2.5 w-2.5 rounded-full', transient ? 'bg-amber-400' : live ? 'animate-pulseDot bg-green-400' : 'bg-brand-300')} title={live ? 'متصل لحظيًا' : 'تحديث دوري'} />
      </div>
    </div>
  );

  if (state.session.status === 'ended') {
    return (
      <Shell>
        {header}
        <Card className="space-y-3 py-10 text-center">
          <PartyPopper className="mx-auto h-14 w-14 text-gold-400" />
          <h1 className="text-2xl font-extrabold">انتهت الحصة</h1>
          <p className="text-brand-600">شكرًا لمشاركتك، {state.me.display_name}.</p>
          <Button variant="outline" onClick={() => { participantStore.clear(); nav('/'); }}>الخروج</Button>
        </Card>
      </Shell>
    );
  }

  if (!q) {
    return (
      <Shell>
        {header}
        <Card className="space-y-3 py-12 text-center">
          <Coffee className="mx-auto h-14 w-14 text-brand-400" />
          <h1 className="text-2xl font-extrabold">أنت في الحصة!</h1>
          <p className="text-brand-600">انتظر حتى يرسل المعلم السؤال. سيظهر هنا تلقائيًا.</p>
          <div className="text-sm text-brand-500">اسمك المستعار: {state.me.alias}</div>
        </Card>
        {transient && <p className="text-center text-sm text-amber-200">{transient}</p>}
      </Shell>
    );
  }

  const expired = q.closes_at ? now > new Date(q.closes_at).getTime() : false;
  const submittedOk = submit.kind === 'done';
  const alreadyAnswered = !!q.my_response;
  const canEdit = q.can_answer && !expired && q.status === 'open' && (!alreadyAnswered || q.allow_retry) && submit.kind !== 'sending';
  const showForm = q.status === 'open' && canEdit;
  const notForMe = q.for_team && state.me.team?.name !== q.for_team;

  return (
    <Shell>
      {header}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>السؤال {q.number}</Badge>
            {q.game_mode !== 'none' && <Badge tone="gold">{gameLabel(q.game_mode)}{q.game_mode === 'golden' && ' ×2'}</Badge>}
            {q.for_team && <Badge tone="blue">لفريق {q.for_team}</Badge>}
          </div>
          {q.status === 'open' && <Countdown closesAt={q.closes_at} now={now} />}
        </div>
        <Stimulus kind={q.stimulus_kind} text={q.stimulus_text} source={q.stimulus_source} />
        <QuestionImage url={q.image_url} />
        <QuestionText text={q.text} blanksAs={q.answer_format === 'blanks' ? 'line' : undefined} />
        {q.status === 'open' && !alreadyAnswered && <Hint hint={q.hint} />}

        {notForMe ? (
          <p className="rounded-xl bg-sky-50 p-4 text-sky-800">هذا السؤال لفريق {q.for_team}. تابع معهم وانتظر السؤال التالي.</p>
        ) : (
          <AnswerInput q={q} value={draft} onChange={setDraft} disabled={!showForm} />
        )}

        {/* الحالة بعد الإرسال: لا تظهر رسالة النجاح إلا بعد تأكيد الخادم */}
        {submit.kind === 'sending' && <Status tone="info" icon={<Loader2 className="h-6 w-6 animate-spin" />}>جارٍ إرسال إجابتك…</Status>}
        {submit.kind === 'queued' && <Status tone="warn" icon={<CloudOff className="h-6 w-6" />}>لا يوجد اتصال. إجابتك محفوظة على جهازك وستُرسل تلقائيًا عند عودة الاتصال.</Status>}
        {submit.kind === 'error' && <ErrorBox error={submit.message} />}
        {(submittedOk || (alreadyAnswered && submit.kind === 'idle')) && !q.revealed && (
          <Status tone="ok" icon={<CheckCircle2 className="h-6 w-6" />}>
            تم استلام إجابتك{q.my_response && q.my_response.attempts > 1 ? ` (المحاولة ${q.my_response.attempts})` : ''}. {q.status === 'open' && q.allow_retry ? 'يمكنك تعديلها قبل إغلاق السؤال.' : 'انتظر قرار المعلم.'}
          </Status>
        )}

        {showForm && !notForMe && (
          <Button size="xl" className="w-full" disabled={!answerComplete(q, draft)} onClick={() => answer(q.sq_id, draft, attemptKey)}>
            {alreadyAnswered ? 'تحديث إجابتي' : 'إرسال الإجابة'}
          </Button>
        )}

        {q.status === 'closed' && !q.revealed && !alreadyAnswered && <Status tone="info">أُغلق السؤال. انتظر السؤال التالي.</Status>}
        {q.status === 'open' && expired && !alreadyAnswered && <Status tone="warn">انتهى الوقت.</Status>}

        {q.revealed && (
          <div className="space-y-2">
            {q.my_response ? (
              q.my_response.is_correct === true ? <Status tone="ok" icon={<CheckCircle2 className="h-6 w-6" />}>إجابتك صحيحة، أحسنت!{q.my_response.score != null && ` (+${Number(q.my_response.score)})`}</Status>
                : q.my_response.is_correct === false ? <Status tone="bad" icon={<XCircle className="h-6 w-6" />}>إجابتك غير صحيحة هذه المرة. راجع الإجابة الصحيحة الموضحة.</Status>
                  : <Status tone="info">إجابتك بانتظار مراجعة المعلم.</Status>
            ) : <Status tone="info">لم تُجب عن هذا السؤال.</Status>}
            {q.my_response?.feedback && <div className="rounded-xl bg-brand-50 p-3">ملاحظة المعلم: {q.my_response.feedback}</div>}
            {q.explanation && <div className="rounded-xl bg-gold-50 p-3 text-brand-800"><b>التفسير:</b> {q.explanation}</div>}
          </div>
        )}
      </Card>
      {transient && <p className="text-center text-sm text-amber-200">{transient}</p>}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-gradient-to-b from-brand-800 to-brand-900">
      <OfflineBanner extra="إجاباتك تُحفظ وتُرسل عند عودة الاتصال." />
      <div className="mx-auto flex max-w-xl flex-col gap-4 px-3 py-4 sm:px-4">{children}<Credit light className="pt-4" /></div>
    </div>
  );
}

function Status({ tone, icon, children }: { tone: 'ok' | 'bad' | 'info' | 'warn'; icon?: React.ReactNode; children: React.ReactNode }) {
  const tones = { ok: 'bg-green-50 text-green-800', bad: 'bg-red-50 text-red-800', info: 'bg-brand-50 text-brand-800', warn: 'bg-amber-50 text-amber-800' };
  return <div role="status" className={cx('flex items-center gap-2 rounded-xl p-3 font-semibold', tones[tone])}>{icon}{children}</div>;
}
