// «اختبر فهمهم الآن»: سؤال سريع وحصة فورية في أقل من دقيقة
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cloud, ListChecks, Plus, ToggleLeft, Trash2, Zap } from 'lucide-react';
import { Button, Card, ErrorBox, Field, Input, OptionLetter, PageHeader, Textarea, Toggle, cx } from '@/components/ui';
import { createSession, deleteQuestion, listSessionQuestions, live, saveQuestion } from '@/lib/api';
import { toAppError } from '@/lib/errors';
import { OPTION_LETTERS } from '@/lib/constants';
import { optionsProblem } from '@/lib/schemas';
import { useSettings } from '@/hooks/useAuth';
import type { QuestionType } from '@/lib/types';

type Kind = 'mcq' | 'true_false' | 'open';

export default function QuickCheck() {
  const settings = useSettings();
  const nav = useNavigate();
  const [kind, setKind] = useState<Kind>('mcq');
  const [text, setText] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correct, setCorrect] = useState(0);
  const [time, setTime] = useState('');
  const [anonymous, setAnonymous] = useState(settings.anonymous);
  const [keep, setKeep] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const opts = kind === 'true_false' ? ['صح', 'خطأ'] : options;

  const start = async () => {
    setError(null);
    if (text.trim().length < 3) return setError('اكتب السؤال أولًا');
    const type: QuestionType = kind === 'open' ? 'open_ended' : kind;
    const fmt = kind === 'open' ? 'open' : 'single';
    const optionRows = kind === 'open' ? [] : opts.map((t, i) => ({ text: t.trim(), is_correct: i === correct })).filter((o) => o.text);
    const problem = optionsProblem(type, fmt, optionRows, text, {});
    if (problem) return setError(problem);
    if (time && (Number(time) < 5 || Number(time) > 3600)) return setError('الزمن بين 5 ثوانٍ وساعة');
    setBusy(true);
    let qid: string | null = null;
    try {
      qid = await saveQuestion({
        type, answer_format: fmt, text: text.trim(), stimulus_kind: 'none', stimulus_text: null, stimulus_source: null, image_url: null,
        subject_id: null, grade: '', unit: '', lesson: '', domain: '', difficulty: 'medium', bloom: 'understand', skill: '',
        points: 1, time_limit_seconds: time ? Number(time) : null, hint: null, explanation: null, answer_key: {}, template_key: null,
        tags: ['سؤال سريع'], is_favorite: false, options: optionRows,
      });
      const title = `سؤال سريع — ${new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date())}`;
      const s = await createSession(
        { title, class_id: null, subject_id: null, grade: '', unit: '', lesson: '', anonymous, hide_names: settings.hide_names, hide_results: true, leaderboard_enabled: false, teams_enabled: false, auto_approve_open: false, is_quick: true },
        [{ question_id: qid, time_limit_seconds: time ? Number(time) : null }], [],
      );
      // بلا مؤقت: نرسل السؤال فورًا ويظهر لكل طالب لحظة انضمامه.
      // مع مؤقت: ينتظر المعلم انضمام الطلاب ثم يضغط «إرسال» حتى لا يبدأ العد قبل دخولهم.
      if (!time) {
        const [sq] = await listSessionQuestions(s.id);
        await live.push(sq.id);
      }
      // اللقطة محفوظة في الحصة؛ إن لم يرغب المعلم بالاحتفاظ بالسؤال في البنك نحذفه منه فقط
      if (!keep) await deleteQuestion(qid).catch(() => {});
      nav(`/t/live/${s.id}`);
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full space-y-4">
      <PageHeader title={<span className="flex items-center gap-2"><Zap className="h-8 w-8 text-gold-400" /> اختبر فهمهم الآن</span>} />
      <Card className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {([
            { k: 'mcq', label: 'اختيار من متعدد', icon: ListChecks },
            { k: 'true_false', label: 'صح أو خطأ', icon: ToggleLeft },
            { k: 'open', label: 'مفتوح / سحابة كلمات', icon: Cloud },
          ] as const).map((x) => (
            <button key={x.k} type="button" onClick={() => { setKind(x.k); setCorrect(0); }}
              className={cx('flex flex-col items-center gap-1 rounded-2xl border-2 p-3 font-bold', kind === x.k ? 'border-brand-700 bg-brand-50' : 'border-brand-100')} aria-pressed={kind === x.k}>
              <x.icon className="h-7 w-7" /><span className="text-center text-sm sm:text-base">{x.label}</span>
            </button>
          ))}
        </div>
        <Field label="السؤال">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} className="text-xl" placeholder={kind === 'open' ? 'مثال: ما أهم قيمة تعلمتها من الدرس؟' : 'اكتب سؤالك…'} autoFocus />
        </Field>
        {kind !== 'open' && (
          <div className="space-y-2">
            <div className="text-sm font-semibold text-brand-700">اضغط الحرف لتحديد الإجابة الصحيحة</div>
            {opts.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <button type="button" onClick={() => setCorrect(i)} aria-pressed={correct === i} aria-label={`الإجابة الصحيحة ${OPTION_LETTERS[i]}`}>
                  <OptionLetter letter={OPTION_LETTERS[i]} tone={correct === i ? 'green' : 'brand'} />
                </button>
                <Input value={o} disabled={kind === 'true_false'} onChange={(e) => setOptions((l) => l.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`الخيار ${OPTION_LETTERS[i]}`} />
                {kind === 'mcq' && options.length > 2 && <button onClick={() => { setOptions((l) => l.filter((_, j) => j !== i)); if (correct >= i && correct > 0) setCorrect(correct - 1); }} className="p-2 text-red-600" aria-label="حذف"><Trash2 className="h-4 w-4" /></button>}
              </div>
            ))}
            {kind === 'mcq' && options.length < 6 && <Button size="sm" variant="soft" icon={<Plus className="h-4 w-4" />} onClick={() => setOptions((l) => [...l, ''])}>خيار آخر</Button>}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="الزمن بالثواني (اختياري)"><Input type="number" min={5} value={time} onChange={(e) => setTime(e.target.value)} placeholder="بدون مؤقت" /></Field>
        </div>
        <Toggle checked={anonymous} onChange={setAnonymous} label="إجابات مجهولة الهوية" />
        <Toggle checked={keep} onChange={setKeep} label="حفظ السؤال في بنك الأسئلة" />
        {error && <ErrorBox error={error} />}
        <Button size="xl" variant="gold" className="w-full" loading={busy} icon={<Zap className="h-6 w-6" />} onClick={start}>ابدأ الآن</Button>
      </Card>
    </div>
  );
}
