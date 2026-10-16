import type { AnswerFormat, Bloom, Difficulty, GameMode, QuestionType, StimulusKind } from './types';

export const QUESTION_TYPES: { value: QuestionType; label: string; hint: string; formats: AnswerFormat[] }[] = [
  { value: 'mcq', label: 'اختيار من متعدد', hint: 'من خيارين إلى ستة، إجابة صحيحة واحدة', formats: ['single'] },
  { value: 'true_false', label: 'صح أو خطأ', hint: 'خياران: صح / خطأ', formats: ['single'] },
  { value: 'multi_select', label: 'اختيار أكثر من إجابة', hint: 'أكثر من إجابة صحيحة', formats: ['multi'] },
  { value: 'short_answer', label: 'إجابة قصيرة', hint: 'كلمة أو جملة قصيرة مع إجابات نموذجية', formats: ['short'] },
  { value: 'open_ended', label: 'سؤال مفتوح', hint: 'رأي أو فكرة، يصلح لسحابة الكلمات', formats: ['open'] },
  { value: 'fill_blank', label: 'إكمال الفراغ', hint: 'اكتب ___ مكان كل فراغ', formats: ['blanks'] },
  { value: 'ordering', label: 'ترتيب الخطوات أو الأحداث', hint: 'أدخل العناصر بالترتيب الصحيح', formats: ['order'] },
  { value: 'matching', label: 'توصيل العناصر المتناظرة', hint: 'أزواج متقابلة', formats: ['match'] },
  { value: 'image_based', label: 'سؤال يعتمد على صورة', hint: 'أرفق صورة ثم اختر صيغة الإجابة', formats: ['single', 'multi', 'short', 'open'] },
  { value: 'text_based', label: 'سؤال على نص أو آية أو حديث', hint: 'أدخل النص حرفيًا مع مصدره', formats: ['single', 'multi', 'short', 'open'] },
  { value: 'reasoning', label: 'تعليل وتفسير', hint: 'علّل أو فسّر', formats: ['open', 'short', 'single'] },
  { value: 'critical_thinking', label: 'تفكير ناقد', hint: 'قارن، احكم، برهن', formats: ['open', 'short', 'single'] },
  { value: 'life_situation', label: 'موقف حياتي', hint: 'موقف يتطلب اتخاذ قرار', formats: ['single', 'multi', 'short', 'open'] },
  { value: 'exit_ticket', label: 'سؤال الخروج', hint: 'يقيس تحقق هدف الدرس', formats: ['open', 'short', 'single', 'multi'] },
];

export const typeLabel = (t: QuestionType) => QUESTION_TYPES.find((x) => x.value === t)?.label ?? t;

export const FORMAT_LABELS: Record<AnswerFormat, string> = {
  single: 'اختيار إجابة واحدة',
  multi: 'اختيار عدة إجابات',
  short: 'إجابة قصيرة',
  open: 'إجابة مفتوحة',
  blanks: 'إكمال فراغات',
  order: 'ترتيب',
  match: 'توصيل',
};

export const AUTO_GRADED: AnswerFormat[] = ['single', 'multi', 'order', 'match', 'short', 'blanks'];

export const BLOOM: { value: Bloom; label: string }[] = [
  { value: 'remember', label: 'التذكر' },
  { value: 'understand', label: 'الفهم' },
  { value: 'apply', label: 'التطبيق' },
  { value: 'analyze', label: 'التحليل' },
  { value: 'evaluate', label: 'التقويم' },
  { value: 'create', label: 'الإبداع' },
];
export const bloomLabel = (b: Bloom) => BLOOM.find((x) => x.value === b)?.label ?? b;

export const DIFFICULTY: { value: Difficulty; label: string }[] = [
  { value: 'easy', label: 'سهل' },
  { value: 'medium', label: 'متوسط' },
  { value: 'hard', label: 'صعب' },
];
export const difficultyLabel = (d: Difficulty) => DIFFICULTY.find((x) => x.value === d)?.label ?? d;

export const STIMULUS_KINDS: { value: StimulusKind; label: string }[] = [
  { value: 'none', label: 'بدون نص مرجعي' },
  { value: 'ayah', label: 'آية قرآنية' },
  { value: 'hadith', label: 'حديث شريف' },
  { value: 'text', label: 'نص' },
];

// مجالات التربية الإسلامية (قابلة للتوسعة بأي مجال يكتبه المعلم)
export const ISLAMIC_DOMAINS = [
  'القرآن الكريم وعلومه',
  'التفسير والتدبر',
  'الحديث الشريف',
  'العقيدة الإسلامية',
  'الفقه والعبادات',
  'السيرة النبوية',
  'الأخلاق والقيم',
];

export const DEFAULT_SUBJECTS = ['التربية الإسلامية', 'اللغة العربية', 'الرياضيات', 'العلوم', 'الدراسات الاجتماعية', 'اللغة الإنجليزية'];

// قوالب أسئلة التربية الإسلامية: صيغ عامة فقط؛ النص الشرعي يدخله المعلم بنفسه من مصدر موثوق
export interface QuestionTemplate {
  key: string;
  label: string;
  stem: string;
  type: QuestionType;
  format: AnswerFormat;
  bloom: Bloom;
  needsStimulus: boolean;
}
export const ISLAMIC_TEMPLATES: QuestionTemplate[] = [
  { key: 'extract_value', label: 'استنبط قيمة من النص', stem: 'استنبط قيمة واحدة من النص السابق.', type: 'text_based', format: 'open', bloom: 'analyze', needsStimulus: true },
  { key: 'ruling', label: 'ما الحكم الشرعي في الموقف؟', stem: 'ما الحكم الشرعي في الموقف الآتي؟ ', type: 'life_situation', format: 'single', bloom: 'apply', needsStimulus: false },
  { key: 'justify', label: 'علّل إجابتك', stem: 'علّل: ', type: 'reasoning', format: 'open', bloom: 'understand', needsStimulus: false },
  { key: 'benefit', label: 'استخرج الفائدة من الآية أو الحديث', stem: 'استخرج فائدة من النص السابق.', type: 'text_based', format: 'open', bloom: 'analyze', needsStimulus: true },
  { key: 'apply_value', label: 'طبّق القيمة على موقف حياتي', stem: 'كيف تطبّق هذه القيمة في الموقف الآتي؟ ', type: 'life_situation', format: 'open', bloom: 'apply', needsStimulus: false },
  { key: 'compare', label: 'قارن بين سلوكين', stem: 'قارن بين السلوكين الآتيين، وبيّن أيهما أفضل ولماذا: ', type: 'critical_thinking', format: 'open', bloom: 'evaluate', needsStimulus: false },
  { key: 'solve', label: 'اقترح حلًا لمشكلة أخلاقية', stem: 'اقترح حلًا للمشكلة الآتية مستندًا إلى ما تعلمته: ', type: 'critical_thinking', format: 'open', bloom: 'create', needsStimulus: false },
  { key: 'analyze_case', label: 'حلّل موقفًا واستدل على إجابتك', stem: 'حلّل الموقف الآتي، واستدل على رأيك بدليل مما درست: ', type: 'critical_thinking', format: 'open', bloom: 'analyze', needsStimulus: false },
];

export const GAME_MODES: { value: GameMode; label: string; hint: string }[] = [
  { value: 'none', label: 'عادي', hint: 'بدون لعبة' },
  { value: 'five_seconds', label: 'تحدي الخمس ثوانٍ', hint: 'مؤقت 5 ثوانٍ، ويمكن إلغاؤه' },
  { value: 'survival', label: 'سؤال النجاة', hint: 'يبقى في المنافسة من أجاب صحيحًا' },
  { value: 'golden', label: 'السؤال الذهبي', hint: 'الدرجة مضاعفة ×2' },
  { value: 'team', label: 'تحدي الفرق', hint: 'يمكن توجيهه لفريق محدد' },
  { value: 'streak', label: 'سلسلة الإجابات الصحيحة', hint: 'مكافأة لمن يحافظ على سلسلة صحيحة' },
  { value: 'surprise', label: 'سؤال المفاجأة', hint: 'يُختار عشوائيًا من القائمة' },
  { value: 'luck', label: 'بطاقة الحظ', hint: 'مضاعف عشوائي من 1 إلى 3' },
  { value: 'exit', label: 'سؤال نهاية الحصة', hint: 'يقيس تحقق هدف الدرس' },
];
export const gameLabel = (g: GameMode) => GAME_MODES.find((x) => x.value === g)?.label ?? g;

export const TEAM_COLORS = ['#6440e3', '#f59f00', '#1d4ed8', '#b91c1c', '#7c3aed', '#0e7490'];

export const OPTION_LETTERS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح', 'ط', 'ي'];

export const DEFAULT_SETTINGS = { mastery: 80, reinforce: 50, default_time: 30, hide_names: false, anonymous: false };
