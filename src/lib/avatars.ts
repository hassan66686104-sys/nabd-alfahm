// شخصيات الطلاب في التحدي: رياضيون، شخصيات كرتونية، وسيارات
// أسماء عامة من إنشائنا (لا أسماء لاعبين حقيقيين ولا علامات تجارية) حتى يصلح التطبيق للمتجر
export interface AvatarInfo { id: string; emoji: string; name: string; group: 'sport' | 'cartoon' | 'car'; bg: string }

export const AVATAR_GROUPS: { id: AvatarInfo['group']; title: string }[] = [
  { id: 'sport', title: 'نجوم الرياضة' },
  { id: 'cartoon', title: 'شخصيات كرتونية' },
  { id: 'car', title: 'سيارات ومركبات' },
];

export const AVATARS: AvatarInfo[] = [
  { id: 'striker', emoji: '⚽', name: 'الهدّاف', group: 'sport', bg: '#dcfce7' },
  { id: 'keeper', emoji: '🧤', name: 'الحارس الأمين', group: 'sport', bg: '#fef3c7' },
  { id: 'runner', emoji: '🏃', name: 'العدّاء السريع', group: 'sport', bg: '#e0f2fe' },
  { id: 'swimmer', emoji: '🏊', name: 'بطل السباحة', group: 'sport', bg: '#cffafe' },
  { id: 'basket', emoji: '🏀', name: 'نجم السلة', group: 'sport', bg: '#ffedd5' },
  { id: 'tennis', emoji: '🎾', name: 'بطل التنس', group: 'sport', bg: '#ecfccb' },
  { id: 'karate', emoji: '🥋', name: 'بطل الكاراتيه', group: 'sport', bg: '#f3f4f6' },
  { id: 'rider', emoji: '🏇', name: 'الفارس', group: 'sport', bg: '#fae8ff' },
  { id: 'lion', emoji: '🦁', name: 'الأسد الشجاع', group: 'cartoon', bg: '#fef3c7' },
  { id: 'robot', emoji: '🤖', name: 'الروبوت الذكي', group: 'cartoon', bg: '#e0e7ff' },
  { id: 'hero', emoji: '🦸', name: 'البطل الخارق', group: 'cartoon', bg: '#fee2e2' },
  { id: 'ninja', emoji: '🥷', name: 'النينجا', group: 'cartoon', bg: '#e5e7eb' },
  { id: 'astronaut', emoji: '🧑‍🚀', name: 'رائد الفضاء', group: 'cartoon', bg: '#dbeafe' },
  { id: 'owl', emoji: '🦉', name: 'البومة الحكيمة', group: 'cartoon', bg: '#fef9c3' },
  { id: 'panda', emoji: '🐼', name: 'الباندا', group: 'cartoon', bg: '#f1f5f9' },
  { id: 'fox', emoji: '🦊', name: 'الثعلب الذكي', group: 'cartoon', bg: '#ffedd5' },
  { id: 'dragon', emoji: '🐉', name: 'التنين', group: 'cartoon', bg: '#dcfce7' },
  { id: 'unicorn', emoji: '🦄', name: 'الحصان الطائر', group: 'cartoon', bg: '#fce7f3' },
  { id: 'cat', emoji: '🐱', name: 'القطة المرحة', group: 'cartoon', bg: '#fef3c7' },
  { id: 'falcon', emoji: '🦅', name: 'الصقر', group: 'cartoon', bg: '#e7e5e4' },
  { id: 'race', emoji: '🏎️', name: 'سيارة سباق', group: 'car', bg: '#fee2e2' },
  { id: 'jeep', emoji: '🚙', name: 'سيارة دفع رباعي', group: 'car', bg: '#dbeafe' },
  { id: 'sport', emoji: '🚗', name: 'سيارة رياضية', group: 'car', bg: '#fecaca' },
  { id: 'police', emoji: '🚓', name: 'سيارة الشرطة', group: 'car', bg: '#e0e7ff' },
  { id: 'fire', emoji: '🚒', name: 'سيارة الإطفاء', group: 'car', bg: '#ffe4e6' },
  { id: 'truck', emoji: '🚚', name: 'الشاحنة', group: 'car', bg: '#f1f5f9' },
  { id: 'bike', emoji: '🏍️', name: 'الدراجة النارية', group: 'car', bg: '#fef3c7' },
  { id: 'rocket', emoji: '🚀', name: 'الصاروخ', group: 'car', bg: '#ede9fe' },
];

const BY_ID = new Map(AVATARS.map((a) => [a.id, a]));
export const avatarInfo = (id: string | null | undefined): AvatarInfo | null => (id ? BY_ID.get(id) ?? null : null);

const KEY = 'nabd.avatar';
export function savedAvatar(): string | null {
  try { const v = localStorage.getItem(KEY); return v && BY_ID.has(v) ? v : null; } catch { return null; }
}
export function saveAvatar(id: string) {
  try { localStorage.setItem(KEY, id); } catch { /* التخزين غير متاح */ }
}
