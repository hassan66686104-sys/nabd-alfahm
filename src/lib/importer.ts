// استيراد الأسئلة من CSV أو JSON مع التحقق من كل صف
import { z } from 'zod';
import { BLOOM, DIFFICULTY, QUESTION_TYPES } from './constants';
import { questionSchema, firstError, type QuestionInput } from './schemas';
import type { AnswerFormat, QuestionType } from './types';

export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',' || c === '\t' || c === '؛') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

export const TEMPLATE_HEADERS = [
  'type', 'text', 'options', 'correct', 'match', 'accepted', 'blanks', 'answer_format', 'subject', 'grade', 'unit', 'lesson',
  'domain', 'difficulty', 'bloom', 'skill', 'points', 'time', 'hint', 'explanation', 'stimulus_kind', 'stimulus_text', 'stimulus_source',
];

const HEADER_ALIASES: Record<string, string> = {
  'النوع': 'type', 'نوع السؤال': 'type', 'السؤال': 'text', 'نص السؤال': 'text', 'الخيارات': 'options', 'الإجابة الصحيحة': 'correct',
  'الصحيح': 'correct', 'المقابل': 'match', 'الإجابات المقبولة': 'accepted', 'الفراغات': 'blanks', 'المادة': 'subject', 'الصف': 'grade',
  'الوحدة': 'unit', 'الدرس': 'lesson', 'المجال': 'domain', 'الصعوبة': 'difficulty', 'المستوى المعرفي': 'bloom', 'المهارة': 'skill',
  'الدرجة': 'points', 'الزمن': 'time', 'التلميح': 'hint', 'التفسير': 'explanation', 'نوع النص': 'stimulus_kind', 'النص المرجعي': 'stimulus_text',
  'المصدر': 'stimulus_source', 'صيغة الإجابة': 'answer_format',
};

const LETTERS = ['أ', 'ب', 'ج', 'د', 'ه', 'و', 'ز', 'ح'];
const split = (s: string | undefined, sep = '|') => (s ?? '').split(sep).map((x) => x.trim()).filter(Boolean);

function resolveType(v: string): QuestionType | null {
  const s = v.trim();
  const t = QUESTION_TYPES.find((x) => x.value === s || x.label === s);
  if (t) return t.value;
  if (/صح|خطأ/.test(s)) return 'true_false';
  if (/متعدد/.test(s)) return 'mcq';
  return null;
}

function correctIndexes(spec: string, options: string[]): number[] {
  return split(spec.replace(/[,،]/g, '|')).map((c) => {
    const n = Number(c.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)));
    if (Number.isInteger(n) && n >= 1 && n <= options.length) return n - 1;
    const li = LETTERS.indexOf(c.replace('هـ', 'ه'));
    if (li >= 0) return li;
    return options.findIndex((o) => o === c);
  }).filter((i) => i >= 0);
}

export interface ImportRow { line: number; ok: boolean; error?: string; question?: QuestionInput; subjectName?: string }

export function rowToQuestion(rec: Record<string, string>): { question?: QuestionInput; subjectName?: string; error?: string } {
  const type = resolveType(rec.type ?? '');
  if (!type) return { error: `نوع السؤال غير معروف: «${rec.type ?? ''}»` };
  const meta = QUESTION_TYPES.find((t) => t.value === type)!;
  const fmt = (rec.answer_format?.trim() || meta.formats[0]) as AnswerFormat;
  let optionTexts = split(rec.options);
  if (type === 'true_false' && optionTexts.length === 0) optionTexts = ['صح', 'خطأ'];
  const corr = new Set(correctIndexes(rec.correct ?? '', optionTexts));
  const matches = split(rec.match);
  const options = fmt === 'single' || fmt === 'multi' || fmt === 'order' || fmt === 'match'
    ? optionTexts.map((text, i) => ({ text, is_correct: fmt === 'single' || fmt === 'multi' ? corr.has(i) : false, match_text: fmt === 'match' ? matches[i] ?? '' : null }))
    : [];
  const diff = DIFFICULTY.find((d) => d.value === rec.difficulty?.trim() || d.label === rec.difficulty?.trim())?.value ?? 'medium';
  const bloom = BLOOM.find((b) => b.value === rec.bloom?.trim() || b.label === rec.bloom?.trim())?.value ?? 'understand';
  const time = rec.time?.trim() ? Number(rec.time) : null;
  const candidate = {
    type,
    answer_format: fmt,
    text: rec.text ?? '',
    stimulus_kind: (['ayah', 'hadith', 'text'].includes(rec.stimulus_kind?.trim()) ? rec.stimulus_kind.trim() : (rec.stimulus_text?.trim() ? 'text' : 'none')) as 'none',
    stimulus_text: rec.stimulus_text?.trim() || null,
    stimulus_source: rec.stimulus_source?.trim() || null,
    image_url: null,
    subject_id: null,
    grade: rec.grade?.trim() ?? '',
    unit: rec.unit?.trim() ?? '',
    lesson: rec.lesson?.trim() ?? '',
    domain: rec.domain?.trim() ?? '',
    difficulty: diff,
    bloom,
    skill: rec.skill?.trim() ?? '',
    points: rec.points?.trim() ? Number(rec.points) : 1,
    time_limit_seconds: time,
    hint: rec.hint?.trim() || null,
    explanation: rec.explanation?.trim() || null,
    answer_key: fmt === 'short' ? { accepted: split(rec.accepted) } : fmt === 'blanks' ? { blanks: split(rec.blanks, ';').map((b) => split(b)) } : {},
    template_key: null,
    tags: ['مستورد'],
    is_favorite: false,
    options,
  };
  const parsed = questionSchema.safeParse(candidate);
  if (!parsed.success) return { error: firstError(parsed.error) };
  return { question: parsed.data, subjectName: rec.subject?.trim() || undefined };
}

export function parseImport(content: string, filename: string): ImportRow[] {
  if (/\.json$/i.test(filename) || content.trim().startsWith('[')) {
    let data: unknown;
    try { data = JSON.parse(content); } catch { return [{ line: 0, ok: false, error: 'ملف JSON غير صالح' }]; }
    const arr = z.array(z.record(z.unknown())).safeParse(data);
    if (!arr.success) return [{ line: 0, ok: false, error: 'يجب أن يحتوي ملف JSON على مصفوفة من الأسئلة' }];
    return arr.data.map((obj, i) => {
      const rec: Record<string, string> = {};
      for (const [k, v] of Object.entries(obj)) rec[HEADER_ALIASES[k] ?? k] = Array.isArray(v) ? v.join('|') : v == null ? '' : String(v);
      const r = rowToQuestion(rec);
      return { line: i + 1, ok: !r.error, ...r };
    });
  }
  const rows = parseCsv(content);
  if (rows.length < 2) return [{ line: 0, ok: false, error: 'الملف فارغ أو لا يحتوي إلا على العناوين' }];
  const headers = rows[0].map((h) => HEADER_ALIASES[h.trim()] ?? h.trim().toLowerCase());
  if (!headers.includes('type') || !headers.includes('text')) return [{ line: 1, ok: false, error: 'يجب أن يحتوي الملف على عمودي type و text على الأقل' }];
  return rows.slice(1).map((r, i) => {
    const rec: Record<string, string> = {};
    headers.forEach((h, j) => { rec[h] = r[j] ?? ''; });
    const res = rowToQuestion(rec);
    return { line: i + 2, ok: !res.error, ...res };
  });
}

export const SAMPLE_CSV = [
  TEMPLATE_HEADERS.join(','),
  'mcq,كم عدد أيام الأسبوع؟,5|6|7|8,3,,,,,الرياضيات,الثالث,الوحدة الأولى,الزمن,,easy,remember,معرفة وحدات الزمن,1,30,,الأسبوع سبعة أيام,,,',
  'true_false,الشمس نجم,صح|خطأ,1,,,,,العلوم,الخامس,الفضاء,النجوم,,easy,remember,,1,20,,,,,',
  'short_answer,ما عاصمة المملكة العربية السعودية؟,,,,الرياض,,,الدراسات الاجتماعية,الرابع,وطني,المدن,,easy,remember,,1,,,,,,',
  'fill_blank,يتكون الماء من الهيدروجين و ___,,,,,الأكسجين|اكسجين,,العلوم,السادس,المادة,المركبات,,medium,understand,,1,,,,,,',
  '"ordering","رتّب مراحل نمو النبات","بذرة|بادرة|نبتة صغيرة|نبتة مزهرة",,,,,,العلوم,الرابع,النبات,دورة الحياة,,medium,understand,,2,60,,,,,',
  '"matching","صِل كل كوكب بوصفه","عطارد|المريخ|المشتري",,"الأقرب إلى الشمس|الكوكب الأحمر|أكبر الكواكب",,,,العلوم,السادس,الفضاء,المجموعة الشمسية,,medium,remember,,3,,,,,,',
  'open_ended,ما أهم فكرة تعلمتها اليوم؟,,,,,,,,,,,,,understand,,0,,,,,,',
].join('\n');
