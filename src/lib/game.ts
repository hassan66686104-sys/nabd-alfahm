// «تحدي الكأس»: نصوص رقم الحظ والقدرات وسجل الأحداث (تُحسب النقاط على الخادم فقط)
import type { GameEvent, GamePower, GameSettings } from './types';

export interface LuckInfo { title: string; text: string; emoji: string }

// ما يعنيه كل رقم من 1 إلى 6 (يطابق دالة game_roll في قاعدة البيانات)
export const LUCK: Record<string, LuckInfo> = {
  treasure: { emoji: '💰', title: 'كنز صغير', text: 'ربحت 5 نقاط فورًا.' },
  big_treasure: { emoji: '💎', title: 'كنز كبير', text: 'ربحت 15 نقطة فورًا.' },
  double: { emoji: '✖️2', title: 'مضاعف النقاط', text: 'إجابتك الصحيحة التالية تُحسب مضاعفة.' },
  take: { emoji: '🤝', title: 'خذ نقاطًا من زميل', text: 'اختر زميلًا وخذ منه حتى 10 نقاط، إلا إن كان لديه درع.' },
  shield: { emoji: '🛡️', title: 'درع الحماية', text: 'لا يستطيع أحد أن يأخذ منك نقاطًا أو يجمّدك لمدة 90 ثانية.' },
  freeze: { emoji: '❄️', title: 'تجميد زميل', text: 'اختر زميلًا ليتوقف عن الإجابة 15 ثانية.' },
  raid: { emoji: '🧲', title: 'انتزاع من مجموعة', text: 'اختر مجموعة منافسة وخذ حتى 3 نقاط من كل عضو فيها.' },
  bomb: { emoji: '💣', title: 'قصف مجموعة', text: 'اختر مجموعة منافسة ليخسر كل عضو فيها حتى 5 نقاط.' },
};

// جدول رقم الحظ كما يراه الطالب والمعلم
export function luckTable(teams: boolean): { n: number; info: LuckInfo }[] {
  return [
    { n: 1, info: LUCK.treasure },
    { n: 2, info: LUCK.double },
    { n: 3, info: LUCK.take },
    { n: 4, info: LUCK.shield },
    { n: 5, info: teams ? LUCK.raid : LUCK.freeze },
    { n: 6, info: teams ? LUCK.bomb : LUCK.big_treasure },
  ];
}

export const powerNeedsTeam = (p: GamePower) => p === 'raid' || p === 'bomb';

export const POWER_ACTION: Record<GamePower, string> = {
  take: 'خذ النقاط',
  freeze: 'جمّد الزميل',
  raid: 'انتزع النقاط',
  bomb: 'اقصف المجموعة',
};

const who = (s: string | null) => s ?? 'طالب';

export function eventText(e: Pick<GameEvent, 'kind' | 'amount' | 'actor' | 'target' | 'team'>): string {
  const a = who(e.actor);
  const t = who(e.target);
  switch (e.kind) {
    case 'streak': return `🔥 ${a} أجاب ${e.amount} إجابات صحيحة متتالية وكسب رمية حظ`;
    case 'roll_treasure': return `💰 ${a} وجد كنزًا: +5`;
    case 'roll_big_treasure': return `💎 ${a} وجد كنزًا كبيرًا: +15`;
    case 'roll_double': return `✖️2 ${a} حصل على مضاعف النقاط`;
    case 'roll_take': return `🤝 ${a} حصل على قدرة «خذ نقاطًا من زميل»`;
    case 'roll_shield': return `🛡️ ${a} رفع درع الحماية`;
    case 'roll_freeze': return `❄️ ${a} حصل على قدرة التجميد`;
    case 'roll_raid': return `🧲 ${a} حصل على قدرة الانتزاع من مجموعة`;
    case 'roll_bomb': return `💣 ${a} حصل على قدرة القصف`;
    case 'take': return `🤝 ${a} أخذ ${e.amount} نقاط من ${t}`;
    case 'freeze': return `❄️ ${a} جمّد ${t} لمدة ${e.amount} ثانية`;
    case 'blocked_take': return `🛡️ درع ${t} صدّ محاولة ${a} لأخذ نقاطه`;
    case 'blocked_freeze': return `🛡️ درع ${t} صدّ تجميد ${a}`;
    case 'raid': return `🧲 ${a} انتزع ${e.amount} نقاط من مجموعة ${who(e.team)}`;
    case 'bomb': return `💣 ${a} قصف مجموعة ${who(e.team)}: خسرت ${e.amount} نقاط`;
    case 'trophy': return `🏆 ${a} وصل إلى ${e.amount} نقطة وفاز بالكأس!`;
    default: return `${a}`;
  }
}

export function goalText(g: GameSettings): string {
  if (g.end === 'all') return 'أجب عن أسئلة الدرس كلها، وصاحب أعلى نقاط يفوز بالكأس';
  if (g.end === 'target') return `أول من يصل إلى ${g.target ?? 100} نقطة يفوز بالكأس`;
  return `الأعلى نقاطًا بعد ${g.minutes ?? 10} دقائق يفوز بالكأس`;
}

export function formatClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

// أخطاء مؤقتة لا تعني خروج الطالب من التحدي
export const GAME_SOFT_ERRORS = ['FROZEN', 'ALREADY_ANSWERED', 'QUESTION_NOT_FOUND', 'INVALID_ANSWER', 'NO_SPINS', 'NO_POWER', 'USE_POWER_FIRST', 'INVALID_TARGET', 'GAME_OVER', 'GAME_NOT_STARTED'];

// آخر رمز تحديات استخدمه الطالب على هذا الجهاز، للعودة إلى قائمة الدروس
const PRACTICE_CODE_KEY = 'nabd.practice-code';
export function lastPracticeCode(): string | null {
  try { return localStorage.getItem(PRACTICE_CODE_KEY); } catch { return null; }
}
export function rememberPracticeCode(code: string) {
  try { localStorage.setItem(PRACTICE_CODE_KEY, code); } catch { /* التخزين غير متاح */ }
}
