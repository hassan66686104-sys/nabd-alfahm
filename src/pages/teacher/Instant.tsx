// «الأسئلة الفورية»: يطرح المعلم سؤالًا (مكتوبًا أو شفهيًا) ويجيب الطلاب بنعم/لا أو صح/خطأ،
// وتظهر النتيجة لحظيًا. كل الأسئلة تُطرح في حصة واحدة مستمرة وتُحفظ في تقرير عند إنهائها.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Eye, Lock, MessageCircleQuestion, MonitorPlay, Send, Square, ThumbsDown, ThumbsUp, XCircle } from 'lucide-react';
import { Badge, Button, Card, ErrorBox, Input, PageHeader, Spinner, cx } from '@/components/ui';
import { useFeedback } from '@/components/feedback';
import { JoinInfo, SyncBadge } from '@/components/live';
import { addInstantQuestion, createSession, getSession, live } from '@/lib/api';
import { toAppError } from '@/lib/errors';
import { isPoll } from '@/lib/stats';
import { pct } from '@/lib/text';
import { uuid } from '@/lib/uuid';
import { useSettings } from '@/hooks/useAuth';
import { useLiveSession } from '@/hooks/useLiveSession';
import type { SessionQuestion, Snapshot } from '@/lib/types';
import { openPresent } from '@/lib/native';

const STORE_KEY = 'nabd.instant-session';
type Mode = 'yes_no' | 'true_false';
const MODES: Record<Mode, { label: string; options: [string, string] }> = {
  yes_no: { label: 'نعم / لا', options: ['نعم', 'لا'] },
  true_false: { label: 'صح / خطأ', options: ['صح', 'خطأ'] },
};
// -1 = سؤال رأي بلا إجابة صحيحة
type Correct = -1 | 0 | 1;
const DEFAULT_TEXT = 'سؤال شفهي: استمع إلى المعلم ثم أجب';

function readStored(): string | null {
  try { return localStorage.getItem(STORE_KEY); } catch { return null; }
}
function store(id: string | null) {
  try { if (id) localStorage.setItem(STORE_KEY, id); else localStorage.removeItem(STORE_KEY); } catch { /* التخزين غير متاح */ }
}

function buildSnapshot(text: string, mode: Mode, correct: Correct): Snapshot {
  const [a, b] = MODES[mode].options;
  return {
    question_id: null,
    type: 'true_false',
    answer_format: 'single',
    text: text.trim() || DEFAULT_TEXT,
    stimulus_kind: 'none', stimulus_text: null, stimulus_source: null, image_url: null,
    hint: null, explanation: null, bloom: 'understand', difficulty: 'easy', skill: '', unit: '', lesson: '', domain: '',
    answer_key: correct === -1 ? { poll: true } : {},
    options: [a, b].map((t, i) => ({ id: uuid(), position: i, text: t, match_text: null, is_correct: correct === i })),
  };
}

export default function Instant() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  // استئناف جلسة الأسئلة الفورية المفتوحة إن وُجدت
  useEffect(() => {
    const id = readStored();
    if (!id) { setChecking(false); return; }
    getSession(id)
      .then((s) => { if (s.status !== 'ended') setSessionId(s.id); else store(null); })
      .catch(() => store(null))
      .finally(() => setChecking(false));
  }, []);

  if (checking) return <Spinner />;
  return sessionId
    ? <InstantLive sessionId={sessionId} onEnded={() => { store(null); setSessionId(null); }} />
    : <InstantStart onStarted={(id) => { store(id); setSessionId(id); }} />;
}

function InstantStart({ onStarted }: { onStarted: (id: string) => void }) {
  const settings = useSettings();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = async () => {
    setBusy(true); setError(null);
    try {
      const title = `أسئلة فورية — ${new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date())}`;
      const s = await createSession({
        title, class_id: null, subject_id: null, grade: '', unit: '', lesson: '',
        anonymous: settings.anonymous, hide_names: settings.hide_names, hide_results: false,
        leaderboard_enabled: false, teams_enabled: false, auto_approve_open: false, is_quick: true,
      }, [], []);
      onStarted(s.id);
    } catch (e) { setError(toAppError(e).message); } finally { setBusy(false); }
  };
  return (
    <div className="w-full space-y-4">
      <PageHeader title={<span className="flex items-center gap-2"><MessageCircleQuestion className="h-8 w-8 text-gold-400" /> الأسئلة الفورية</span>}
        subtitle="اطرح سؤالًا في أي لحظة من الدرس، ويجيب الطلاب من أجهزتهم بنعم أو لا، أو صح أو خطأ." />
      <Card className="space-y-4 p-6 text-center">
        <div className="flex justify-center gap-3 text-brand-700"><ThumbsUp className="h-10 w-10" /><ThumbsDown className="h-10 w-10" /></div>
        <p className="text-lg">ابدأ جلسة واحدة، اعرض الرمز على الطلاب، ثم اطرح ما تشاء من الأسئلة واحدًا تلو الآخر دون تجهيز مسبق.</p>
        {error && <ErrorBox error={error} />}
        <Button size="xl" variant="gold" className="w-full" loading={busy} onClick={start}>ابدأ جلسة الأسئلة الفورية</Button>
      </Card>
    </div>
  );
}

function InstantLive({ sessionId, onEnded }: { sessionId: string; onEnded: () => void }) {
  const nav = useNavigate();
  const { toast, confirm } = useFeedback();
  const { session, sqs, participants, responses, sync, error, loading, reload } = useLiveSession(sessionId);
  const [mode, setMode] = useState<Mode>('yes_no');
  const [text, setText] = useState('');
  const [correct, setCorrect] = useState<Correct>(-1);
  const [busy, setBusy] = useState<string | null>(null);

  const asked = useMemo(() => sqs.filter((s) => s.status !== 'draft').sort((a, b) => b.position - a.position), [sqs]);
  const current = asked[0] ?? null;
  const joined = participants.filter((p) => !p.is_removed).length;

  useEffect(() => { if (session?.status === 'ended') onEnded(); }, [session?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try { await fn(); await reload(); } catch (e) { toast(toAppError(e).message, 'error'); } finally { setBusy(null); }
  };

  const ask = () => act('ask', async () => {
    const sq = await addInstantQuestion(sessionId, buildSnapshot(text, mode, correct));
    await live.push(sq.id, null);
    setText('');
    setCorrect(-1); // لا تبقى الإجابة الصحيحة السابقة محددة للسؤال التالي
    toast('وصل السؤال إلى الطلاب');
  });

  const end = async () => {
    if (!(await confirm({ title: 'إنهاء جلسة الأسئلة الفورية؟', body: 'يُغلق السؤال الحالي ويُحفظ تقرير بكل الأسئلة التي طرحتها.', confirmText: 'إنهاء' }))) return;
    await act('end', async () => {
      await live.end(sessionId);
      store(null);
      nav(`/t/reports/${sessionId}`);
    });
  };

  if (loading && !session) return <Spinner />;
  if (error && !session) return <ErrorBox error={error} onRetry={reload} />;
  if (!session) return null;

  return (
    <div className="space-y-4">
      <PageHeader title={<span className="flex items-center gap-2"><MessageCircleQuestion className="h-8 w-8 text-gold-400" /> الأسئلة الفورية</span>}
        actions={<div className="flex flex-wrap items-center gap-2">
          <SyncBadge sync={sync} />
          <Button variant="outline" icon={<MonitorPlay className="h-5 w-5" />} onClick={() => openPresent(sessionId, nav)}>شاشة العرض</Button>
          <Button variant="danger" loading={busy === 'end'} icon={<Square className="h-5 w-5" />} onClick={end}>إنهاء وعرض التقرير</Button>
        </div>} />

      <Card><JoinInfo code={session.code} count={joined} compact /></Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-4">
          <h2 className="text-xl font-extrabold">اطرح سؤالًا</h2>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="نوع الإجابة">
            {(Object.keys(MODES) as Mode[]).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => { setMode(m); setCorrect(-1); }}
                className={cx('rounded-2xl border-2 p-4 text-xl font-extrabold', mode === m ? 'border-brand-700 bg-brand-50 text-brand-800' : 'border-brand-100 text-brand-600')}>
                {MODES[m].label}
              </button>
            ))}
          </div>
          <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} className="h-14 text-lg"
            placeholder="اكتب السؤال (اختياري، أو اطرحه شفهيًا)" aria-label="نص السؤال"
            onKeyDown={(e) => { if (e.key === 'Enter' && !busy) void ask(); }} />
          <div className="space-y-2">
            <div className="text-sm font-semibold text-brand-700">الإجابة الصحيحة</div>
            <div className="flex flex-wrap gap-2">
              {([-1, 0, 1] as Correct[]).map((c) => (
                <button key={c} type="button" aria-pressed={correct === c} onClick={() => setCorrect(c)}
                  className={cx('rounded-xl border-2 px-4 py-2 font-bold', correct === c ? 'border-brand-700 bg-brand-700 text-white' : 'border-brand-100 text-brand-700')}>
                  {c === -1 ? 'لا توجد (سؤال رأي)' : MODES[mode].options[c]}
                </button>
              ))}
            </div>
          </div>
          <Button size="xl" variant="gold" className="w-full" loading={busy === 'ask'} disabled={!!busy && busy !== 'ask'} icon={<Send className="h-6 w-6" />} onClick={ask}>
            اطرح السؤال الآن
          </Button>
          <p className="text-sm text-brand-600">طرح سؤال جديد يُغلق السؤال السابق تلقائيًا.</p>
        </Card>

        {current ? (
          <CurrentResult sq={current} responses={responses} joined={joined} busy={busy}
            onClose={() => act('close', () => live.close(current.id))}
            onReveal={() => act('reveal', () => live.reveal(current.id))} />
        ) : (
          <Card className="flex items-center justify-center p-10 text-center text-lg text-brand-600">
            ستظهر نتيجة السؤال هنا لحظة إجابة الطلاب.
          </Card>
        )}
      </div>

      {asked.length > 1 && (
        <Card className="space-y-2">
          <h2 className="text-lg font-extrabold">الأسئلة السابقة</h2>
          {asked.slice(1).map((sq, i) => <HistoryRow key={sq.id} sq={sq} n={asked.length - 1 - i} responses={responses} />)}
        </Card>
      )}
    </div>
  );
}

function counts(sq: SessionQuestion, responses: { sq_id: string; answer: { option_id?: string } }[]) {
  const rs = responses.filter((r) => r.sq_id === sq.id);
  const per = sq.snapshot.options.map((o) => rs.filter((r) => r.answer.option_id === o.id).length);
  return { total: rs.length, per };
}

function CurrentResult({ sq, responses, joined, busy, onClose, onReveal }: {
  sq: SessionQuestion; responses: { sq_id: string; answer: { option_id?: string } }[]; joined: number; busy: string | null; onClose: () => void; onReveal: () => void;
}) {
  const { total, per } = counts(sq, responses);
  const poll = isPoll(sq);
  return (
    <Card className="space-y-4" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-xl font-extrabold">{sq.snapshot.text}</h2>
        {sq.status === 'open' ? <Badge tone="green">مفتوح للإجابة</Badge> : <Badge tone="gray">مغلق</Badge>}
      </div>
      <div className="text-lg font-bold text-brand-700"><span data-testid="instant-answered">{total}</span> من {Math.max(joined, total)} أجابوا</div>
      <div className="grid grid-cols-2 gap-3">
        {sq.snapshot.options.map((o, i) => {
          const share = total ? (per[i] / total) * 100 : 0;
          const shown = sq.revealed && !poll;
          const tone = shown ? (o.is_correct ? 'border-green-600 bg-green-50' : 'border-red-300 bg-red-50') : i === 0 ? 'border-brand-200 bg-brand-50' : 'border-gold-200 bg-gold-50';
          return (
            <div key={o.id} className={cx('rounded-2xl border-2 p-4 text-center', tone)}>
              <div className="flex items-center justify-center gap-1 text-2xl font-extrabold">
                {shown && (o.is_correct ? <CheckCircle2 className="h-6 w-6 text-green-700" /> : <XCircle className="h-6 w-6 text-red-600" />)}{o.text}
              </div>
              <div className="mt-1 text-5xl font-extrabold" data-testid={`instant-count-${i}`}>{per[i]}</div>
              <div className="text-brand-600">{pct(share)}</div>
              <div className="mt-2 h-3 overflow-hidden rounded-full bg-white">
                <div className={cx('h-full rounded-full transition-all', i === 0 ? 'bg-brand-700' : 'bg-gold-400')} style={{ width: `${share}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        {sq.status === 'open' && <Button variant="outline" loading={busy === 'close'} icon={<Lock className="h-5 w-5" />} onClick={onClose}>أغلق الإجابة</Button>}
        {!sq.revealed && <Button loading={busy === 'reveal'} icon={<Eye className="h-5 w-5" />} onClick={onReveal}>{poll ? 'أظهر النتيجة للطلاب' : 'اكشف الإجابة الصحيحة'}</Button>}
        {sq.revealed && <Badge tone="gold">{poll ? 'عُرضت النتيجة' : 'كُشفت الإجابة'}</Badge>}
      </div>
    </Card>
  );
}

function HistoryRow({ sq, n, responses }: { sq: SessionQuestion; n: number; responses: { sq_id: string; answer: { option_id?: string } }[] }) {
  const { total, per } = counts(sq, responses);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-50 pb-2">
      <span className="min-w-0 flex-1"><b>{n}.</b> {sq.snapshot.text}</span>
      <span className="flex gap-2 text-sm">
        {sq.snapshot.options.map((o, i) => (
          <Badge key={o.id} tone={!isPoll(sq) && o.is_correct ? 'green' : 'gray'}>{o.text}: {per[i]}{total ? ` (${pct((per[i] / total) * 100)})` : ''}</Badge>
        ))}
      </span>
    </div>
  );
}
