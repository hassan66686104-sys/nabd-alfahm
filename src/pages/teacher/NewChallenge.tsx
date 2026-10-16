// إنشاء «تحدي الكأس»: يختار المعلم الدرس وأسئلته، وطريقة الفوز، ثم يلعب الطلاب وحدهم
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dices, LibraryBig, Timer, Trash2, Trophy, Users } from 'lucide-react';
import { Badge, Button, Card, ErrorBox, Field, Input, PageHeader, Toggle, cx } from '@/components/ui';
import QuestionPicker from '@/components/QuestionPicker';
import PracticeLinkCard from '@/components/PracticeLinkCard';
import { useFeedback } from '@/components/feedback';
import { createSession, listQuestions } from '@/lib/api';
import { toAppError } from '@/lib/errors';
import { TEAM_COLORS, typeLabel } from '@/lib/constants';
import { luckTable } from '@/lib/game';
import { useSettings } from '@/hooks/useAuth';
import type { Question } from '@/lib/types';

// الأسئلة التي تحتاج كتابة (مفتوحة، قصيرة، ملء فراغ) لا تدخل التحدي؛ يجيب الطالب بالضغط فقط
const TYPED = ['open', 'short', 'blanks'];
const playable = (q: Question) => !TYPED.includes(q.answer_format) && !q.answer_key?.poll;

export default function NewChallenge() {
  const settings = useSettings();
  const nav = useNavigate();
  const { toast } = useFeedback();
  const [bank, setBank] = useState<Question[] | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [items, setItems] = useState<Question[]>([]);
  const [end, setEnd] = useState<'target' | 'time'>('target');
  const [target, setTarget] = useState('100');
  const [minutes, setMinutes] = useState('10');
  // في «من يصل أولًا» الوقت حد أقصى اختياري؛ فارغ = بلا حد
  const [maxMinutes, setMaxMinutes] = useState('');
  const [powers, setPowers] = useState(true);
  const [heartsOn, setHeartsOn] = useState(true);
  const [helpsOn, setHelpsOn] = useState(true);
  const [prize, setPrize] = useState('');
  const [teamsOn, setTeamsOn] = useState(false);
  const [teams, setTeams] = useState<string[]>(['المجموعة الأولى', 'المجموعة الثانية']);
  const [hideNames, setHideNames] = useState(settings.hide_names);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { listQuestions({ limit: 300 }).then(setBank).catch((e) => setError(toAppError(e).message)); }, []);
  const lessons = useMemo(() => [...new Set((bank ?? []).filter(playable).map((q) => q.lesson.trim()).filter(Boolean))].sort(), [bank]);

  // اختيار درس أو أكثر: الضغط يضيف أسئلة الدرس، والضغط مرة أخرى يزيلها
  const toggleLesson = (l: string) => {
    if (!bank) return;
    const on = !chosen.includes(l);
    const next = on ? [...chosen, l] : chosen.filter((x) => x !== l);
    setChosen(next);
    const qs = bank.filter((q) => playable(q) && q.lesson.trim() === l);
    setItems((cur) => on ? [...cur, ...qs.filter((q) => !cur.some((c) => c.id === q.id))] : cur.filter((c) => c.lesson.trim() !== l));
    if (!title.trim() || title.startsWith('تحدي الكأس: ')) setTitle(next.length ? `تحدي الكأس: ${next.join(' + ')}`.slice(0, 120) : '');
  };

  const create = async () => {
    setError(null);
    if (title.trim().length < 2) return setError('اكتب اسم التحدي');
    if (items.length < 2) return setError('اختر سؤالين على الأقل من الدرس');
    const t = Number(target); const m = Number(minutes);
    if (end === 'target' && !(t >= 20 && t <= 10000)) return setError('النقاط المطلوبة للفوز بين 20 و10000');
    if (end === 'time' && !(m >= 1 && m <= 120)) return setError('مدة التحدي بين دقيقة و120 دقيقة');
    const mx = Number(maxMinutes);
    if (end === 'target' && maxMinutes.trim() && !(mx >= 1 && mx <= 120)) return setError('الحد الأقصى للوقت بين دقيقة و120 دقيقة');
    const teamNames = teams.map((x) => x.trim()).filter(Boolean);
    if (teamsOn && teamNames.length < 2) return setError('أضف مجموعتين على الأقل');
    setBusy(true);
    try {
      const s = await createSession({
        title: title.trim(), class_id: null, subject_id: items[0]?.subject_id ?? null, grade: items[0]?.grade ?? '', unit: items[0]?.unit ?? '', lesson: (chosen.join(' + ') || items[0]?.lesson || '').slice(0, 160),
        anonymous: false, hide_names: hideNames, hide_results: false, leaderboard_enabled: true, teams_enabled: teamsOn, auto_approve_open: false,
        mode: 'self',
        game: { end, ...(end === 'target' ? { target: t, ...(maxMinutes.trim() ? { minutes: mx } : {}) } : { minutes: m }), powers, hearts: heartsOn ? 3 : 0, helps: helpsOn, ...(prize.trim() ? { prize: prize.trim().slice(0, 80) } : {}) },
      }, items.map((q) => ({ question_id: q.id })), teamsOn ? teamNames.map((name, i) => ({ name, color: TEAM_COLORS[i % TEAM_COLORS.length] })) : []);
      toast('تم إنشاء التحدي');
      nav(`/t/challenge/${s.id}`);
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full space-y-4">
      <PageHeader title={<span className="flex items-center gap-2"><Trophy className="h-7 w-7 text-gold-400" />تحدي الكأس</span>} />

      <PracticeLinkCard />
      <h2 className="pt-2 text-xl font-extrabold">أو أنشئ تحديًا للفصل كله الآن</h2>

      <Card className="space-y-3">
        <h2 className="text-lg font-bold">1. الدرس والأسئلة <Badge>{items.length}</Badge></h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <div className="mb-1 font-semibold">اختر درسًا أو أكثر</div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="الدروس" data-testid="challenge-lessons">
              {lessons.map((l) => {
                const on = chosen.includes(l);
                return (
                  <button key={l} type="button" aria-pressed={on} onClick={() => toggleLesson(l)}
                    className={cx('rounded-full border-2 px-3 py-1.5 font-bold transition', on ? 'border-transparent bg-gradient-to-r from-brand-500 to-fuchsia-500 text-white shadow' : 'border-brand-100 bg-white text-brand-800 hover:bg-brand-50')}>
                    {on ? '✓ ' : ''}{l}
                  </button>
                );
              })}
            </div>
          </div>
          <Field label="اسم التحدي"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: تحدي الكأس — الصدق" /></Field>
        </div>
        <Button variant="outline" icon={<LibraryBig className="h-5 w-5" />} onClick={() => setPicker(true)}>اختيار أسئلة من البنك</Button>
        {bank && lessons.length === 0 && <p className="rounded-xl bg-ivory-100 p-3 text-brand-700">لا توجد دروس مسماة في البنك. اختر الأسئلة يدويًا، أو اكتب اسم الدرس عند حفظ الأسئلة.</p>}
        <div className="space-y-1.5">
          {items.map((q, i) => (
            <div key={q.id} className="flex items-center gap-2 rounded-xl border border-brand-100 p-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-700 text-sm font-bold text-white">{i + 1}</span>
              <span className="line-clamp-1 flex-1">{q.text}</span>
              <Badge tone="gray">{typeLabel(q.type)}</Badge>
              <button onClick={() => setItems((l) => l.filter((x) => x.id !== q.id))} className="rounded-lg p-1.5 text-red-600 hover:bg-red-50" aria-label="إزالة"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-lg font-bold">2. كيف يُحسم الفوز؟</h2>
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="طريقة الفوز">
          {([['target', 'من يصل إلى الكأس أولًا', 'أول طالب يجمع النقاط المطلوبة يفوز وينتهي التحدي', Trophy], ['time', 'تحدٍّ بوقت محدد', 'عند انتهاء الوقت يفوز صاحب أعلى نقاط', Timer]] as const).map(([v, label, hint, Icon]) => (
            <button key={v} type="button" role="radio" aria-checked={end === v} onClick={() => setEnd(v)}
              className={cx('rounded-xl border-2 p-3 text-start', end === v ? 'border-gold-400 bg-gold-50' : 'border-brand-100')}>
              <div className="flex items-center gap-2 font-bold"><Icon className="h-5 w-5" />{label}</div>
              <div className="text-sm text-brand-600">{hint}</div>
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {end === 'target'
            ? <>
              <Field label="النقاط المطلوبة للكأس" hint="كل إجابة صحيحة = 10 نقاط"><Input type="number" min={20} max={10000} step={10} value={target} onChange={(e) => setTarget(e.target.value)} /></Field>
              <Field label="الحد الأقصى للوقت بالدقائق (اختياري)" hint="اتركه فارغًا لتحدٍّ بلا وقت. يمكنك زيادته أو إنقاصه أثناء اللعب"><Input type="number" min={1} max={120} value={maxMinutes} onChange={(e) => setMaxMinutes(e.target.value)} placeholder="بلا حد" /></Field>
            </>
            : <Field label="مدة التحدي بالدقائق" hint="يمكنك زيادتها أو إنقاصها أثناء اللعب"><Input type="number" min={1} max={120} value={minutes} onChange={(e) => setMinutes(e.target.value)} /></Field>}
          <Field label="الجائزة (اختياري)" hint="تظهر للفائز وعلى شاشة العرض"><Input value={prize} onChange={(e) => setPrize(e.target.value)} maxLength={80} placeholder="مثال: كأس الفصل وشهادة تميّز" /></Field>
        </div>
      </Card>

      <Card className="space-y-1">
        <h2 className="text-lg font-bold">3. رقم الحظ والقلوب والمساعدات والمجموعات</h2>
        <Toggle checked={powers} onChange={setPowers} label="رقم الحظ والقدرات" hint="كل 3 إجابات صحيحة متتالية = رمية حظ من 1 إلى 6" />
        {powers && (
          <div className="grid gap-1.5 rounded-xl bg-ivory-100 p-3 sm:grid-cols-2">
            {luckTable(teamsOn).map(({ n, info }) => (
              <div key={n} className="flex items-start gap-2 text-sm"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white font-bold"><Dices className="h-4 w-4" />{n}</span><span><b>{info.emoji} {info.title}:</b> {info.text}</span></div>
            ))}
          </div>
        )}
        <Toggle checked={heartsOn} onChange={setHeartsOn} label="❤️ ثلاثة قلوب وعقوبة الخطأ" hint="كل خطأ يُفقد الطالب قلبًا و5 نقاط، ومن تنتهي قلوبه يخرج من اللعبة" />
        <Toggle checked={helpsOn} onChange={setHelpsOn} label="🆘 وسائل المساعدة والمتجر" hint="حذف إجابتين، رأي الجمهور، تبديل السؤال، وشراء قلوب ودروع بالنقاط" />
        <Toggle checked={teamsOn} onChange={setTeamsOn} label="تنافس المجموعات" hint="يجمع كل فريق نقاط أعضائه، ويمكن الانتزاع من مجموعة منافسة أو قصفها" />
        {teamsOn && (
          <div className="space-y-2 rounded-xl bg-ivory-100 p-3">
            {teams.map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                <Users className="h-5 w-5" style={{ color: TEAM_COLORS[i % TEAM_COLORS.length] }} />
                <Input value={t} onChange={(e) => setTeams((l) => l.map((x, j) => (j === i ? e.target.value : x)))} maxLength={40} aria-label={`اسم المجموعة ${i + 1}`} />
                {teams.length > 2 && <button onClick={() => setTeams((l) => l.filter((_, j) => j !== i))} className="p-2 text-red-600" aria-label="حذف المجموعة"><Trash2 className="h-4 w-4" /></button>}
              </div>
            ))}
            {teams.length < 6 && <Button size="sm" variant="soft" onClick={() => setTeams((l) => [...l, `المجموعة ${l.length + 1}`])}>مجموعة أخرى</Button>}
          </div>
        )}
        <Toggle checked={hideNames} onChange={setHideNames} label="إظهار الأسماء المستعارة فقط في الترتيب" />
      </Card>

      {error && <ErrorBox error={error} />}
      <div className="sticky bottom-20 z-10 flex justify-end rounded-2xl bg-white/90 p-2 shadow-card backdrop-blur lg:bottom-4">
        <Button size="lg" variant="gold" icon={<Trophy className="h-6 w-6" />} loading={busy} onClick={create}>إنشاء التحدي والحصول على الرمز</Button>
      </div>

      <QuestionPicker open={picker} onClose={() => setPicker(false)} exclude={items.map((q) => q.id)}
        onPick={(qs) => { const ok = qs.filter(playable); if (ok.length < qs.length) toast('لم تُضف الأسئلة التي تحتاج كتابة'); setItems((l) => [...l, ...ok]); }} />
    </div>
  );
}
