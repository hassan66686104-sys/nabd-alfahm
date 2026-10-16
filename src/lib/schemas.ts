// التحقق من صحة البيانات في الواجهة (Zod). التحقق النهائي يتم أيضًا في قاعدة البيانات.
import { z } from 'zod';
import type { AnswerFormat, QuestionType } from './types';
import { QUESTION_TYPES } from './constants';
import { countBlanks } from './text';

const trimmed = (max: number, msg: string) => z.string().trim().max(max, msg);

export const optionSchema = z.object({
  text: z.string().trim().min(1, 'نص الخيار فارغ').max(1000, 'نص الخيار طويل جدًا'),
  match_text: z.string().trim().max(1000).nullable().optional(),
  is_correct: z.boolean(),
});

export const questionTypes = QUESTION_TYPES.map((t) => t.value) as [QuestionType, ...QuestionType[]];
export const answerFormats = ['single', 'multi', 'short', 'open', 'blanks', 'order', 'match'] as const;

export const questionSchema = z
  .object({
    id: z.string().uuid().optional(),
    type: z.enum(questionTypes),
    answer_format: z.enum(answerFormats),
    text: z.string().trim().min(3, 'اكتب نص السؤال (3 أحرف على الأقل)').max(4000, 'نص السؤال طويل جدًا'),
    stimulus_kind: z.enum(['none', 'ayah', 'hadith', 'text']),
    stimulus_text: trimmed(6000, 'النص المرجعي طويل جدًا').nullable().optional(),
    stimulus_source: trimmed(300, 'المصدر طويل جدًا').nullable().optional(),
    image_url: z.string().trim().url('رابط الصورة غير صالح').regex(/^https?:\/\//, 'رابط الصورة يجب أن يبدأ بـ http').nullable().optional().or(z.literal('')),
    subject_id: z.string().uuid().nullable().optional().or(z.literal('')),
    grade: trimmed(60, 'الصف طويل جدًا'),
    unit: trimmed(120, 'اسم الوحدة طويل جدًا'),
    lesson: trimmed(160, 'اسم الدرس طويل جدًا'),
    domain: trimmed(80, 'المجال طويل جدًا'),
    difficulty: z.enum(['easy', 'medium', 'hard']),
    bloom: z.enum(['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']),
    skill: trimmed(160, 'المهارة طويلة جدًا'),
    points: z.coerce.number({ invalid_type_error: 'الدرجة يجب أن تكون رقمًا' }).min(0, 'الدرجة لا تكون سالبة').max(1000, 'الدرجة كبيرة جدًا'),
    time_limit_seconds: z.coerce.number().int('الزمن بالثواني عدد صحيح').min(5, 'أقل زمن 5 ثوانٍ').max(3600, 'أقصى زمن ساعة').nullable(),
    hint: trimmed(1000, 'التلميح طويل جدًا').nullable().optional(),
    explanation: trimmed(2000, 'التفسير طويل جدًا').nullable().optional(),
    answer_key: z.object({ accepted: z.array(z.string().trim().min(1)).optional(), blanks: z.array(z.array(z.string().trim().min(1))).optional() }),
    template_key: z.string().nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20),
    is_favorite: z.boolean(),
    // قسم السؤال: المنهج (false) أو عامة (true)، والدرس عندها هو القسم مثل «ألغاز» أو «رياضة»
    is_general: z.boolean().optional(),
    options: z.array(optionSchema),
  })
  .superRefine((q, ctx) => {
    const allowed = QUESTION_TYPES.find((t) => t.value === q.type)?.formats ?? [];
    if (!allowed.includes(q.answer_format)) ctx.addIssue({ code: 'custom', path: ['answer_format'], message: 'صيغة الإجابة لا تناسب نوع السؤال' });
    if (q.stimulus_kind !== 'none' && !q.stimulus_text?.trim()) ctx.addIssue({ code: 'custom', path: ['stimulus_text'], message: 'أدخل النص المرجعي كما هو في مصدره' });
    if ((q.stimulus_kind === 'ayah' || q.stimulus_kind === 'hadith') && !q.stimulus_source?.trim())
      ctx.addIssue({ code: 'custom', path: ['stimulus_source'], message: 'اذكر مصدر النص (السورة ورقم الآية، أو راوي الحديث ومخرّجه)' });
    if (q.type === 'image_based' && !q.image_url) ctx.addIssue({ code: 'custom', path: ['image_url'], message: 'أرفق صورة للسؤال' });
    const problem = optionsProblem(q.type, q.answer_format, q.options, q.text, q.answer_key);
    if (problem) ctx.addIssue({ code: 'custom', path: ['options'], message: problem });
  });

export type QuestionInput = z.infer<typeof questionSchema>;

// نفس قواعد question_problem في قاعدة البيانات
export function optionsProblem(
  type: QuestionType,
  fmt: AnswerFormat,
  options: { text: string; match_text?: string | null; is_correct: boolean }[],
  text: string,
  key: { accepted?: string[]; blanks?: string[][] },
): string | null {
  const n = options.length;
  const correct = options.filter((o) => o.is_correct).length;
  if (fmt === 'single') {
    if (type === 'true_false' && n !== 2) return 'سؤال الصح والخطأ يحتاج خيارين بالضبط';
    if (n < 2 || n > 6) return 'سؤال الاختيار يحتاج من 2 إلى 6 خيارات';
    if (correct !== 1) return 'حدد إجابة صحيحة واحدة بالضبط';
  } else if (fmt === 'multi') {
    if (n < 2 || n > 8) return 'سؤال الاختيار المتعدد يحتاج من 2 إلى 8 خيارات';
    if (correct < 1) return 'حدد إجابة صحيحة واحدة على الأقل';
  } else if (fmt === 'order') {
    if (n < 2 || n > 10) return 'سؤال الترتيب يحتاج من 2 إلى 10 عناصر';
  } else if (fmt === 'match') {
    if (n < 2 || n > 8) return 'سؤال التوصيل يحتاج من 2 إلى 8 أزواج';
    if (options.some((o) => !o.match_text?.trim())) return 'أكمل الطرف المقابل لكل عنصر في سؤال التوصيل';
  } else if (fmt === 'blanks') {
    const nb = countBlanks(text);
    if (nb === 0) return 'ضع فراغًا واحدًا على الأقل في نص السؤال باستخدام ___';
    if (key.blanks && key.blanks.length > 0 && key.blanks.length !== nb) return 'عدد الإجابات النموذجية لا يساوي عدد الفراغات';
  }
  return null;
}

export const joinSchema = z.object({
  code: z.string().transform((s) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).toUpperCase().replace(/[^A-Z0-9]/g, ''))
    .pipe(z.string().length(6, 'رمز الحصة مكوّن من 6 أحرف وأرقام')),
  name: z.string().trim().max(40, 'الاسم طويل جدًا').optional(),
});

export const settingsSchema = z
  .object({
    mastery: z.coerce.number().min(1, 'قيمة غير صالحة').max(100, 'أقصى قيمة 100'),
    reinforce: z.coerce.number().min(0, 'قيمة غير صالحة').max(99),
    default_time: z.coerce.number().int().min(5).max(3600).nullable(),
    hide_names: z.boolean(),
    anonymous: z.boolean(),
  })
  .refine((s) => s.reinforce < s.mastery, { message: 'حد التعزيز يجب أن يكون أقل من حد الإتقان', path: ['reinforce'] });

export const sessionSchema = z.object({
  title: z.string().trim().min(2, 'اكتب اسم الحصة').max(160, 'الاسم طويل جدًا'),
  class_id: z.string().uuid().nullable(),
  subject_id: z.string().uuid().nullable(),
  grade: trimmed(60, 'الصف طويل جدًا'),
  unit: trimmed(120, 'الوحدة طويلة جدًا'),
  lesson: trimmed(160, 'الدرس طويل جدًا'),
  anonymous: z.boolean(),
  hide_names: z.boolean(),
  hide_results: z.boolean(),
  leaderboard_enabled: z.boolean(),
  teams_enabled: z.boolean(),
  auto_approve_open: z.boolean(),
  teams: z.array(z.string().trim().min(1, 'اسم الفريق فارغ').max(40)).max(6),
}).refine((s) => !s.teams_enabled || s.teams.length >= 2, { message: 'أضف فريقين على الأقل', path: ['teams'] });

export const authSchema = z.object({
  email: z.string().trim().email('البريد الإلكتروني غير صالح'),
  password: z.string().min(8, 'كلمة المرور 8 أحرف على الأقل'),
  full_name: z.string().trim().max(120).optional(),
});

export function firstError(e: z.ZodError): string {
  return e.issues[0]?.message ?? 'بيانات غير صالحة';
}
