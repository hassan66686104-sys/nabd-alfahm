// أدوات النص العربي: توحيد للمقارنة (لا يغير النص المحفوظ)، وسحابة الكلمات

const TASHKEEL = /[ً-ْٰـ]/g;

export function normalizeAr(input: string | null | undefined): string {
  return (input ?? '')
    .replace(TASHKEEL, '')
    .toLowerCase()
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\p{P}\p{S}،؛؟«»]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// كلمات شائعة لا تحمل معنى في سحابة الكلمات (بعد التوحيد)
const STOPWORDS = new Set(
  [
    'في', 'من', 'علي', 'الي', 'عن', 'مع', 'هذا', 'هذه', 'ذلك', 'تلك', 'التي', 'الذي', 'الذين', 'ان', 'او', 'ثم', 'لا', 'ما',
    'هو', 'هي', 'هم', 'انا', 'نحن', 'انت', 'كان', 'كانت', 'يكون', 'قد', 'لقد', 'كل', 'بعض', 'عند', 'حتي', 'اذا', 'لم', 'لن',
    'و', 'ف', 'ب', 'ل', 'ك', 'يا', 'اي', 'بين', 'غير', 'بعد', 'قبل', 'فيه', 'فيها', 'به', 'بها', 'له', 'لها', 'منه', 'منها',
    'هناك', 'هنا', 'لان', 'لكن', 'ايضا', 'جدا', 'او', 'ام', 'كما', 'مثل', 'تعلمت', 'اهم', 'الدرس', 'هي', 'ان', 'انه', 'انها',
    'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'is', 'it',
  ].map(normalizeAr),
);

export interface WordCount { word: string; display: string; count: number }

export function wordFrequencies(texts: string[], limit = 40): WordCount[] {
  const counts = new Map<string, { display: string; count: number }>();
  for (const t of texts) {
    const seen = new Set<string>();
    for (const raw of (t ?? '').split(/\s+/)) {
      const cleanDisplay = raw.replace(/[\p{P}\p{S}]/gu, '').replace(TASHKEEL, '');
      let key = normalizeAr(cleanDisplay);
      let shown = cleanDisplay;
      // حذف واو العطف الملتصقة بأل التعريف: «والصدق» = «الصدق»
      if (key.startsWith('وال') && key.length > 4) { key = key.slice(1); shown = shown.slice(1); }
      if (key.length < 2 || STOPWORDS.has(key) || seen.has(key)) continue;
      seen.add(key);
      const cur = counts.get(key);
      if (cur) cur.count += 1;
      else counts.set(key, { display: shown, count: 1 });
    }
  }
  return [...counts.entries()]
    .map(([word, v]) => ({ word, display: v.display, count: v.count }))
    .sort((a, b) => b.count - a.count || a.display.localeCompare(b.display, 'ar'))
    .slice(0, limit);
}

// تجميع الإجابات النصية المتطابقة بعد التوحيد
export function groupAnswers(texts: string[]): { text: string; count: number }[] {
  const m = new Map<string, { text: string; count: number }>();
  for (const t of texts) {
    const k = normalizeAr(t);
    if (!k) continue;
    const cur = m.get(k);
    if (cur) cur.count += 1;
    else m.set(k, { text: t.trim(), count: 1 });
  }
  return [...m.values()].sort((a, b) => b.count - a.count);
}

export function countBlanks(text: string): number {
  return (text.match(/_{3,}/g) ?? []).length;
}

export function splitBlanks(text: string): string[] {
  return text.split(/_{3,}/);
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} ث`;
  return `${Math.floor(s / 60)} د ${Math.round(s % 60)} ث`;
}

export function formatDate(iso: string | null | undefined, withTime = true): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return new Intl.DateTimeFormat('ar', {
    year: 'numeric', month: 'long', day: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(d);
}

export function pct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${Math.round(n)}%`;
}
