// نموذج إنشاء/تعديل سؤال بجميع الأنواع، يُستخدم في البنك وفي الحصة المباشرة
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, BookMarked, ImagePlus, Plus, Trash2, X } from 'lucide-react';
import { Badge, Button, Card, ErrorBox, Field, Input, OptionLetter, Select, Textarea, Toggle, cx } from './ui';
import { useFeedback } from './feedback';
import { BLOOM, CATEGORY_EMOJI, GENERAL_CATEGORIES, DIFFICULTY, FORMAT_LABELS, ISLAMIC_DOMAINS, ISLAMIC_TEMPLATES, OPTION_LETTERS, QUESTION_TYPES, STIMULUS_KINDS } from '@/lib/constants';
import { questionSchema, firstError, type QuestionInput } from '@/lib/schemas';
import { saveQuestion, subjects as subjectsApi, uploadQuestionImage } from '@/lib/api';
import { toAppError } from '@/lib/errors';
import { countBlanks } from '@/lib/text';
import type { AnswerFormat, Question, QuestionType, Subject } from '@/lib/types';
import { useSettings } from '@/hooks/useAuth';

export type FormState = Omit<QuestionInput, 'time_limit_seconds' | 'points'> & { time_limit_seconds: string; points: string; acceptedText: string; blanksText: string[] };

export function blankForm(defaultTime: number | null): FormState {
  return {
    type: 'mcq', answer_format: 'single', text: '', stimulus_kind: 'none', stimulus_text: '', stimulus_source: '', image_url: '',
    subject_id: '', grade: '', unit: '', lesson: '', domain: '', difficulty: 'medium', bloom: 'understand', skill: '',
    points: '1', time_limit_seconds: defaultTime ? String(defaultTime) : '', hint: '', explanation: '', answer_key: {}, template_key: null,
    tags: [], is_favorite: false, is_general: false,
    options: [{ text: '', is_correct: true, match_text: '' }, { text: '', is_correct: false, match_text: '' }, { text: '', is_correct: false, match_text: '' }, { text: '', is_correct: false, match_text: '' }],
    acceptedText: '', blanksText: [],
  };
}

export function formFromQuestion(q: Question): FormState {
  return {
    id: q.id, type: q.type, answer_format: q.answer_format, text: q.text, stimulus_kind: q.stimulus_kind, stimulus_text: q.stimulus_text ?? '',
    stimulus_source: q.stimulus_source ?? '', image_url: q.image_url ?? '', subject_id: q.subject_id ?? '', grade: q.grade, unit: q.unit,
    lesson: q.lesson, domain: q.domain, difficulty: q.difficulty, bloom: q.bloom, skill: q.skill, points: String(q.points),
    time_limit_seconds: q.time_limit_seconds ? String(q.time_limit_seconds) : '', hint: q.hint ?? '', explanation: q.explanation ?? '',
    answer_key: q.answer_key ?? {}, template_key: q.template_key, tags: q.tags ?? [], is_favorite: q.is_favorite, is_general: q.is_general ?? false,
    options: (q.question_options ?? []).map((o) => ({ text: o.text, is_correct: o.is_correct, match_text: o.match_text ?? '' })),
    acceptedText: (q.answer_key?.accepted ?? []).join('\n'),
    blanksText: (q.answer_key?.blanks ?? []).map((b) => b.join(' | ')),
  };
}

function toInput(f: FormState): unknown {
  const fmt = f.answer_format;
  const usesOptions = fmt === 'single' || fmt === 'multi' || fmt === 'order' || fmt === 'match';
  return {
    ...f,
    points: f.points === '' ? 1 : Number(f.points),
    time_limit_seconds: f.time_limit_seconds === '' ? null : Number(f.time_limit_seconds),
    stimulus_text: f.stimulus_kind === 'none' ? null : f.stimulus_text || null,
    stimulus_source: f.stimulus_kind === 'none' ? null : f.stimulus_source || null,
    hint: f.hint || null,
    explanation: f.explanation || null,
    options: usesOptions ? f.options.map((o) => ({ text: o.text, is_correct: fmt === 'single' || fmt === 'multi' ? o.is_correct : false, match_text: fmt === 'match' ? o.match_text : null })) : [],
    answer_key: fmt === 'short'
      ? { accepted: f.acceptedText.split('\n').map((s) => s.trim()).filter(Boolean) }
      : fmt === 'blanks'
        ? { blanks: f.blanksText.map((b) => b.split('|').map((s) => s.trim()).filter(Boolean)).filter((b) => b.length) }
        : {},
  };
}

interface Props {
  initial?: FormState;
  onSaved: (id: string) => void;
  onCancel?: () => void;
  compact?: boolean;
}

export default function QuestionForm({ initial, onSaved, onCancel, compact }: Props) {
  const settings = useSettings();
  const { toast } = useFeedback();
  const [f, setF] = useState<FormState>(initial ?? blankForm(settings.default_time));
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [newSubject, setNewSubject] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { subjectsApi.list().then(setSubjects).catch(() => {}); }, []);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));
  const typeMeta = QUESTION_TYPES.find((t) => t.value === f.type)!;
  const fmt = f.answer_format;
  const nBlanks = useMemo(() => countBlanks(f.text), [f.text]);

  // مزامنة مدخلات الفراغات مع عدد الفراغات في النص
  useEffect(() => {
    if (fmt !== 'blanks') return;
    setF((s) => (s.blanksText.length === nBlanks ? s : { ...s, blanksText: Array.from({ length: nBlanks }, (_, i) => s.blanksText[i] ?? '') }));
  }, [nBlanks, fmt]);

  const changeType = (t: QuestionType) => {
    const meta = QUESTION_TYPES.find((x) => x.value === t)!;
    setF((s) => {
      const format: AnswerFormat = meta.formats.includes(s.answer_format) ? s.answer_format : meta.formats[0];
      let options = s.options;
      if (t === 'true_false') options = [{ text: 'صح', is_correct: true, match_text: '' }, { text: 'خطأ', is_correct: false, match_text: '' }];
      else if (s.type === 'true_false') options = blankForm(null).options;
      if ((format === 'order' || format === 'match') && options.length < 3) options = [...options, ...Array.from({ length: 3 - options.length }, () => ({ text: '', is_correct: false, match_text: '' }))];
      const bloom = t === 'critical_thinking' ? 'evaluate' : t === 'reasoning' ? 'understand' : s.bloom;
      return { ...s, type: t, answer_format: format, options, bloom, stimulus_kind: t === 'text_based' && s.stimulus_kind === 'none' ? 'ayah' : s.stimulus_kind };
    });
  };

  const applyTemplate = (key: string) => {
    const tpl = ISLAMIC_TEMPLATES.find((x) => x.key === key);
    if (!tpl) return;
    setF((s) => ({
      ...s, template_key: tpl.key, type: tpl.type, answer_format: tpl.format, bloom: tpl.bloom,
      text: s.text.trim() ? s.text : tpl.stem,
      stimulus_kind: tpl.needsStimulus && s.stimulus_kind === 'none' ? 'ayah' : s.stimulus_kind,
      domain: s.domain || 'الأخلاق والقيم',
      options: tpl.format === 'single' && s.options.length < 2 ? blankForm(null).options : s.options,
    }));
  };

  const setOption = (i: number, patch: Partial<FormState['options'][number]>) =>
    setF((s) => ({ ...s, options: s.options.map((o, j) => (j === i ? { ...o, ...patch } : fmt === 'single' && patch.is_correct ? { ...o, is_correct: false } : o)) }));
  const maxOptions = fmt === 'single' ? 6 : fmt === 'order' ? 10 : 8;

  const submit = async () => {
    setError(null);
    const parsed = questionSchema.safeParse(toInput(f));
    if (!parsed.success) { setError(firstError(parsed.error)); return; }
    setSaving(true);
    try {
      let subjectId = parsed.data.subject_id;
      if (newSubject.trim()) {
        const s = await subjectsApi.create(newSubject.trim());
        subjectId = s.id;
      }
      const id = await saveQuestion({ ...parsed.data, subject_id: subjectId || null });
      toast(f.id ? 'تم حفظ التعديلات' : 'تم حفظ السؤال في البنك');
      onSaved(id);
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      setSaving(false);
    }
  };

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try { set('image_url', await uploadQuestionImage(file)); toast('تم رفع الصورة'); }
    catch (e) { toast(toAppError(e).message, 'error'); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="نوع السؤال" hint={typeMeta.hint}>
            <Select value={f.type} onChange={(e) => changeType(e.target.value as QuestionType)}>
              {QUESTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </Field>
          {typeMeta.formats.length > 1 ? (
            <Field label="صيغة الإجابة">
              <Select value={fmt} onChange={(e) => set('answer_format', e.target.value as AnswerFormat)}>
                {typeMeta.formats.map((x) => <option key={x} value={x}>{FORMAT_LABELS[x]}</option>)}
              </Select>
            </Field>
          ) : (
            <Field label="قالب للتربية الإسلامية (اختياري)">
              <Select value={f.template_key ?? ''} onChange={(e) => applyTemplate(e.target.value)}>
                <option value="">— بدون قالب —</option>
                {ISLAMIC_TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </Select>
            </Field>
          )}
        </div>
        {typeMeta.formats.length > 1 && (
          <Field label="قالب للتربية الإسلامية (اختياري)">
            <Select value={f.template_key ?? ''} onChange={(e) => applyTemplate(e.target.value)}>
              <option value="">— بدون قالب —</option>
              {ISLAMIC_TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </Select>
          </Field>
        )}

        {/* النص المرجعي: آية أو حديث أو نص */}
        {(f.type === 'text_based' || f.stimulus_kind !== 'none' || !compact) && (
          <div className="space-y-3 rounded-2xl bg-ivory-100 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <BookMarked className="h-5 w-5 text-gold-500" />
              <span className="font-semibold">نص مرجعي (آية، حديث، نص)</span>
              <div className="flex flex-wrap gap-1">
                {STIMULUS_KINDS.map((k) => (
                  <button key={k.value} type="button" onClick={() => set('stimulus_kind', k.value)}
                    className={cx('rounded-full border px-3 py-1 text-sm font-semibold', f.stimulus_kind === k.value ? 'border-brand-700 bg-brand-700 text-white' : 'border-brand-200 bg-white')}>{k.label}</button>
                ))}
              </div>
            </div>
            {f.stimulus_kind !== 'none' && <>
              <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <span>انسخ النص حرفيًا من مصدر موثوق (مصحف معتمد أو كتاب حديث محقق) وتحقق منه. التطبيق يحفظ النص كما تكتبه تمامًا ولا يعدّله ولا يولّد نصوصًا شرعية.</span>
              </div>
              <Field label="النص كما في المصدر">
                <Textarea value={f.stimulus_text ?? ''} onChange={(e) => set('stimulus_text', e.target.value)} className="font-quran text-xl leading-loose" rows={3} />
              </Field>
              <Field label="المصدر" hint={f.stimulus_kind === 'ayah' ? 'مثال: سورة (اسم السورة)، الآية (رقمها)' : f.stimulus_kind === 'hadith' ? 'مثال: رواه (المخرّج)، رقم الحديث، مع درجته إن وجدت' : 'عنوان الكتاب أو المرجع'}>
                <Input value={f.stimulus_source ?? ''} onChange={(e) => set('stimulus_source', e.target.value)} />
              </Field>
            </>}
          </div>
        )}

        <Field label="نص السؤال" hint={fmt === 'blanks' ? `اكتب ___ (ثلاث شرطات سفلية) مكان كل فراغ. عدد الفراغات الآن: ${nBlanks}` : undefined}>
          <Textarea value={f.text} onChange={(e) => set('text', e.target.value)} rows={3} className="text-lg" placeholder="اكتب السؤال بوضوح…" />
        </Field>

        {(f.type === 'image_based' || f.image_url || !compact) && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" icon={<ImagePlus className="h-4 w-4" />} loading={uploading} onClick={() => fileRef.current?.click()}>رفع صورة</Button>
              <Input value={f.image_url ?? ''} onChange={(e) => set('image_url', e.target.value)} placeholder="أو الصق رابط صورة https://" dir="ltr" className="h-9 flex-1 py-1 text-sm" />
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => onUpload(e.target.files?.[0])} />
            </div>
            {f.image_url && (
              <div className="relative inline-block">
                <img src={f.image_url} alt="معاينة الصورة" className="max-h-48 rounded-xl border" />
                <button type="button" onClick={() => set('image_url', '')} className="absolute left-1 top-1 rounded-full bg-white p-1 shadow" aria-label="إزالة الصورة"><X className="h-4 w-4" /></button>
              </div>
            )}
          </div>
        )}

        {/* الخيارات / مفتاح الإجابة */}
        {(fmt === 'single' || fmt === 'multi') && (
          <div className="space-y-2">
            <div className="font-semibold">الخيارات <span className="text-sm font-normal text-brand-600">— {fmt === 'single' ? 'اضغط الحرف لتحديد الإجابة الصحيحة' : 'حدد كل الإجابات الصحيحة'}</span></div>
            {f.options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <button type="button" onClick={() => setOption(i, { is_correct: fmt === 'single' ? true : !o.is_correct })} aria-pressed={o.is_correct} aria-label={`تحديد الخيار ${OPTION_LETTERS[i]} كإجابة صحيحة`}>
                  <OptionLetter letter={OPTION_LETTERS[i]} tone={o.is_correct ? 'green' : 'brand'} />
                </button>
                <Input value={o.text} onChange={(e) => setOption(i, { text: e.target.value })} placeholder={`الخيار ${OPTION_LETTERS[i]}`} disabled={f.type === 'true_false'} />
                {o.is_correct && <Badge tone="green">صحيح</Badge>}
                {f.type !== 'true_false' && f.options.length > 2 && (
                  <button type="button" onClick={() => setF((s) => ({ ...s, options: s.options.filter((_, j) => j !== i) }))} className="p-2 text-red-600" aria-label="حذف الخيار"><Trash2 className="h-4 w-4" /></button>
                )}
              </div>
            ))}
            {f.type !== 'true_false' && f.options.length < maxOptions && (
              <Button size="sm" variant="soft" icon={<Plus className="h-4 w-4" />} onClick={() => setF((s) => ({ ...s, options: [...s.options, { text: '', is_correct: false, match_text: '' }] }))}>خيار آخر</Button>
            )}
          </div>
        )}
        {fmt === 'order' && (
          <div className="space-y-2">
            <div className="font-semibold">العناصر بالترتيب الصحيح <span className="text-sm font-normal text-brand-600">— ستظهر للطلاب بترتيب مختلط</span></div>
            {f.options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-700 font-bold text-white">{i + 1}</span>
                <Input value={o.text} onChange={(e) => setOption(i, { text: e.target.value })} placeholder={`الخطوة ${i + 1}`} />
                {f.options.length > 2 && <button type="button" onClick={() => setF((s) => ({ ...s, options: s.options.filter((_, j) => j !== i) }))} className="p-2 text-red-600" aria-label="حذف"><Trash2 className="h-4 w-4" /></button>}
              </div>
            ))}
            {f.options.length < maxOptions && <Button size="sm" variant="soft" icon={<Plus className="h-4 w-4" />} onClick={() => setF((s) => ({ ...s, options: [...s.options, { text: '', is_correct: false, match_text: '' }] }))}>عنصر آخر</Button>}
          </div>
        )}
        {fmt === 'match' && (
          <div className="space-y-2">
            <div className="font-semibold">الأزواج المتناظرة <span className="text-sm font-normal text-brand-600">— سيُخلط العمود الثاني للطلاب</span></div>
            {f.options.map((o, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                <Input value={o.text} onChange={(e) => setOption(i, { text: e.target.value })} placeholder={`العنصر ${i + 1}`} />
                <Input value={o.match_text ?? ''} onChange={(e) => setOption(i, { match_text: e.target.value })} placeholder="ما يقابله" />
                {f.options.length > 2 ? <button type="button" onClick={() => setF((s) => ({ ...s, options: s.options.filter((_, j) => j !== i) }))} className="p-2 text-red-600" aria-label="حذف"><Trash2 className="h-4 w-4" /></button> : <span />}
              </div>
            ))}
            {f.options.length < maxOptions && <Button size="sm" variant="soft" icon={<Plus className="h-4 w-4" />} onClick={() => setF((s) => ({ ...s, options: [...s.options, { text: '', is_correct: false, match_text: '' }] }))}>زوج آخر</Button>}
          </div>
        )}
        {fmt === 'short' && (
          <Field label="الإجابات المقبولة (سطر لكل صيغة)" hint="يُصحح آليًا مع تجاهل التشكيل والهمزات. الإجابة غير المطابقة تبقى قابلة لمراجعتك. اتركه فارغًا للتصحيح اليدوي.">
            <Textarea value={f.acceptedText} onChange={(e) => set('acceptedText', e.target.value)} rows={3} />
          </Field>
        )}
        {fmt === 'blanks' && nBlanks > 0 && (
          <div className="space-y-2">
            <div className="font-semibold">الإجابة النموذجية لكل فراغ <span className="text-sm font-normal text-brand-600">— افصل الصيغ المقبولة بـ |</span></div>
            {f.blanksText.map((b, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-10 text-center font-bold text-gold-600">({i + 1})</span>
                <Input value={b} onChange={(e) => setF((s) => ({ ...s, blanksText: s.blanksText.map((x, j) => (j === i ? e.target.value : x)) }))} />
              </div>
            ))}
          </div>
        )}
        {fmt === 'open' && <p className="rounded-xl bg-brand-50 p-3 text-sm text-brand-700">الأسئلة المفتوحة تُصحح يدويًا منك، وتظهر إجاباتها لحظيًا مع سحابة كلمات. لا يُستخدم الذكاء الاصطناعي للحكم على الإجابات.</p>}
      </Card>

      <Card className="space-y-3">
        <h3 className="font-bold">التصنيف والإعدادات</h3>
        <div className="grid max-w-sm grid-cols-2 gap-1 rounded-2xl bg-brand-50 p-1" role="radiogroup" aria-label="القسم">
          {([[false, '📚 المنهج'], [true, '🌍 أسئلة عامة']] as const).map(([v, label]) => (
            <button key={label} type="button" role="radio" aria-checked={!!f.is_general === v} onClick={() => set('is_general', v)}
              className={cx('rounded-xl py-2 font-extrabold transition', !!f.is_general === v ? 'bg-white text-brand-800 shadow' : 'text-brand-600 hover:bg-white/60')}>{label}</button>
          ))}
        </div>
        {f.is_general && (
          <Field label="نوع الأسئلة العامة">
            <div className="flex flex-wrap gap-2">
              {GENERAL_CATEGORIES.map((c) => (
                <button key={c} type="button" aria-pressed={f.lesson === c} onClick={() => set('lesson', c)}
                  className={cx('rounded-full border-2 px-3 py-1.5 font-bold transition', f.lesson === c ? 'border-transparent bg-gradient-to-r from-brand-500 to-fuchsia-500 text-white shadow' : 'border-brand-100 bg-white text-brand-800 hover:bg-brand-50')}>
                  {CATEGORY_EMOJI[c]} {c}
                </button>
              ))}
            </div>
            <Input className="mt-2" value={f.lesson} onChange={(e) => set('lesson', e.target.value)} placeholder="أو اكتب نوعًا آخر" aria-label="نوع الأسئلة العامة" />
          </Field>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {!f.is_general && <>
          <Field label="المادة">
            <Select value={newSubject ? '__new' : f.subject_id ?? ''} onChange={(e) => { if (e.target.value === '__new') setNewSubject(' '); else { setNewSubject(''); set('subject_id', e.target.value); } }}>
              <option value="">— بدون —</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              <option value="__new">+ مادة جديدة…</option>
            </Select>
            {newSubject && <Input className="mt-2" autoFocus value={newSubject.trimStart()} onChange={(e) => setNewSubject(e.target.value || ' ')} placeholder="اسم المادة الجديدة" />}
          </Field>
          <Field label="الصف"><Input value={f.grade} onChange={(e) => set('grade', e.target.value)} placeholder="مثال: الخامس" /></Field>
          <Field label="الوحدة"><Input value={f.unit} onChange={(e) => set('unit', e.target.value)} /></Field>
          <Field label="الدرس"><Input value={f.lesson} onChange={(e) => set('lesson', e.target.value)} /></Field>
          </>}
          <Field label="المجال">
            <Input list="domains" value={f.domain} onChange={(e) => set('domain', e.target.value)} placeholder="اختر أو اكتب" />
            <datalist id="domains">{ISLAMIC_DOMAINS.map((d) => <option key={d} value={d} />)}</datalist>
          </Field>
          <Field label="المهارة المستهدفة"><Input value={f.skill} onChange={(e) => set('skill', e.target.value)} /></Field>
          <Field label="المستوى المعرفي">
            <Select value={f.bloom} onChange={(e) => set('bloom', e.target.value as FormState['bloom'])}>{BLOOM.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}</Select>
          </Field>
          <Field label="مستوى الصعوبة">
            <Select value={f.difficulty} onChange={(e) => set('difficulty', e.target.value as FormState['difficulty'])}>{DIFFICULTY.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</Select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="الدرجة"><Input type="number" min={0} step="0.5" value={f.points} onChange={(e) => set('points', e.target.value)} /></Field>
            <Field label="الزمن (ث)" hint="فارغ = بلا مؤقت"><Input type="number" min={5} max={3600} value={f.time_limit_seconds} onChange={(e) => set('time_limit_seconds', e.target.value)} /></Field>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="تلميح للطالب (اختياري)"><Textarea rows={2} value={f.hint ?? ''} onChange={(e) => set('hint', e.target.value)} /></Field>
          <Field label="تفسير مختصر يظهر بعد كشف الإجابة"><Textarea rows={2} value={f.explanation ?? ''} onChange={(e) => set('explanation', e.target.value)} /></Field>
        </div>
        <Toggle checked={f.is_favorite} onChange={(v) => set('is_favorite', v)} label="إضافة إلى المفضلة" />
      </Card>

      {error && <ErrorBox error={error} />}
      <div className="sticky bottom-20 z-10 flex justify-end gap-2 rounded-2xl bg-white/90 p-2 shadow-card backdrop-blur lg:bottom-4">
        {onCancel && <Button variant="outline" onClick={onCancel}>إلغاء</Button>}
        <Button size="lg" loading={saving} onClick={submit}>{f.id ? 'حفظ التعديلات' : 'حفظ السؤال'}</Button>
      </div>
    </div>
  );
}
