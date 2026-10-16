// تحويل أخطاء الخادم والشبكة إلى رسائل عربية مفهومة

const MESSAGES: Record<string, string> = {
  INVALID_CODE: 'رمز الحصة غير صحيح. تأكد من الرمز المعروض على الشاشة.',
  SESSION_ENDED: 'انتهت هذه الحصة ولم يعد ممكنًا الانضمام أو الإجابة.',
  SESSION_FULL: 'اكتمل عدد المشاركين في هذه الحصة.',
  RATE_LIMITED: 'محاولات دخول كثيرة غير صحيحة. انتظر بضع دقائق ثم حاول مجددًا.',
  NAME_REQUIRED: 'اكتب اسمك (حرفان على الأقل).',
  INVALID_TEAM: 'الفريق المختار غير موجود في هذه الحصة.',
  INVALID_PARTICIPANT: 'انتهت صلاحية دخولك لهذه الحصة. انضم من جديد بالرمز.',
  REMOVED: 'أزالك المعلم من هذه الحصة.',
  QUESTION_NOT_FOUND: 'السؤال غير موجود.',
  QUESTION_CLOSED: 'أُغلق هذا السؤال، ولم تعد الإجابة ممكنة.',
  TIME_UP: 'انتهى زمن السؤال قبل وصول إجابتك.',
  NOT_YOUR_TEAM: 'هذا السؤال موجّه لفريق آخر.',
  INVALID_ANSWER: 'الإجابة غير مكتملة أو غير صالحة.',
  ALREADY_ANSWERED: 'سبق أن أرسلت إجابتك لهذا السؤال.',
  NOT_FOUND: 'العنصر غير موجود أو لا تملك صلاحية الوصول إليه.',
  FORBIDDEN: 'لا تملك صلاحية تنفيذ هذا الإجراء.',
  QUESTION_INCOMPLETE: 'بيانات السؤال غير مكتملة.',
  ALREADY_CLOSED: 'هذا السؤال مغلق. استخدم «إعادة المحاولة» لفتحه من جديد.',
  NOT_CLOSED: 'يجب إغلاق السؤال أولًا.',
  INVALID_SCORE: 'الدرجة يجب أن تكون بين 0 و1.',
  NOT_A_GAME: 'هذه الحصة ليست تحديًا.',
  GAME_OVER: 'انتهى التحدي.',
  NOT_ALONE: 'انضم زميل إلى غرفتك، فابدأ التحدي معه.',
  GAME_ALREADY_STARTED: 'بدأ التحدي بالفعل.',
  GAME_NOT_STARTED: 'لم يبدأ التحدي بعد. انتظر المعلم.',
  FROZEN: 'أنت مجمَّد الآن. انتظر ثواني قليلة ثم أجب.',
  NO_SPINS: 'لا توجد لديك رمية حظ الآن. أجب 3 إجابات صحيحة متتالية لتحصل على رمية.',
  USE_POWER_FIRST: 'استخدم القدرة التي لديك أولًا.',
  NO_POWER: 'لا توجد لديك قدرة لاستخدامها.',
  INVALID_TARGET: 'اختر زميلًا أو مجموعة أخرى.',
  LESSON_NOT_FOUND: 'لا يحتوي هذا الدرس أسئلة كافية للتحدي.',
  NOT_AUTHENTICATED: 'سجّل الدخول أولًا.',
  CONFIRM_REQUIRED: 'اكتب كلمة «حذف» لتأكيد حذف الحساب.',
  OUT: 'انتهت قلوبك وخرجت من هذا التحدي.',
  NO_HELP: 'انتهت هذه الوسيلة. يمكنك شراء المزيد من المتجر 🛒',
  HELP_NOT_FOR_QUESTION: 'هذه الوسيلة لأسئلة الاختيار من متعدد فقط.',
  ALREADY_USED: 'استخدمت هذه الوسيلة في هذا السؤال.',
  NOT_ENOUGH_POINTS: 'نقاطك لا تكفي للشراء. أجب أكثر لتجمع النقاط!',
  MAX_HEARTS: 'وصلت إلى أكبر عدد من القلوب.',
  HELPS_OFF: 'وسائل المساعدة غير مفعّلة في هذا التحدي.',
  INVALID_ITEM: 'هذا العنصر غير موجود في المتجر.',
  INVALID_TIME: 'اختر عددًا من الدقائق بين 1 و120.',
  INVALID_AVATAR: 'اختر شخصية من القائمة.',
  NETWORK: 'تعذر الاتصال بالخادم. تحقق من اتصال الإنترنت ثم حاول مجددًا.',
  NOT_CONFIGURED: 'لم يُربط التطبيق بقاعدة البيانات بعد. راجع ملف README لإعداد Supabase.',
};

export class AppError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message ?? MESSAGES[code] ?? 'حدث خطأ غير متوقع. حاول مرة أخرى.');
    this.code = code;
  }
}

export function messageFor(code: string): string {
  return MESSAGES[code] ?? 'حدث خطأ غير متوقع. حاول مرة أخرى.';
}

interface PgLikeError { message?: string; code?: string; hint?: string | null; details?: string | null; status?: number; name?: string }

export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const err = e as PgLikeError;
  const msg = String(err?.message ?? '');
  return /Failed to fetch|NetworkError|Load failed|network|fetch failed|ECONNREFUSED|timeout/i.test(msg) && !err?.code;
}

export function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  if (isNetworkError(e)) return new AppError('NETWORK');
  const err = e as PgLikeError;
  const msg = String(err?.message ?? '');
  const nabd = msg.match(/NABD:([A-Z_]+)/);
  if (nabd) {
    const code = nabd[1];
    const base = messageFor(code);
    return new AppError(code, err.hint ? `${base} ${err.hint}` : base);
  }
  if (err?.code === '42501' || /row-level security|permission denied/i.test(msg)) return new AppError('FORBIDDEN');
  if (err?.code === '23505') return new AppError('DUPLICATE', 'هذا العنصر موجود مسبقًا.');
  if (err?.code === '23514') return new AppError('CHECK', 'بعض البيانات خارج الحدود المسموحة. راجع الحقول وحاول مجددًا.');
  if (err?.code === 'PGRST301' || err?.status === 401) return new AppError('AUTH', 'انتهت جلسة الدخول. سجّل الدخول من جديد.');
  // رسائل المصادقة الشائعة من Supabase Auth
  if (/Invalid login credentials/i.test(msg)) return new AppError('AUTH', 'البريد الإلكتروني أو كلمة المرور غير صحيحة.');
  if (/Email not confirmed/i.test(msg)) return new AppError('AUTH', 'لم يتم تأكيد البريد الإلكتروني بعد. افتح رسالة التأكيد في بريدك.');
  if (/User already registered/i.test(msg)) return new AppError('AUTH', 'هذا البريد مسجل مسبقًا. جرّب تسجيل الدخول.');
  if (/Password should be at least/i.test(msg)) return new AppError('AUTH', 'كلمة المرور قصيرة جدًا (8 أحرف على الأقل).');
  if (/rate limit/i.test(msg)) return new AppError('AUTH', 'محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا.');
  return new AppError('UNKNOWN', 'حدث خطأ غير متوقع. حاول مرة أخرى.' + (import.meta.env.DEV && msg ? ` (${msg})` : ''));
}
