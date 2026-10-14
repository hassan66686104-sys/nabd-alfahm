// تصدير التقارير إلى CSV (متوافق مع Excel العربي) وإلى ملف Excel حقيقي ‎.xlsx‎ بدون مكتبات ثقيلة
import { strToU8, zipSync } from 'fflate';
import type { SessionSummary } from './stats';
import { LEVEL_LABELS } from './stats';
import { formatDate } from './text';

export type Cell = string | number | null | undefined;
export interface Sheet { name: string; rows: Cell[][] }

function csvCell(v: Cell): string {
  if (v == null) return '';
  const s = String(v);
  // منع حقن الصيغ عند فتح الملف في Excel
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: Cell[][]): string {
  // BOM لضمان ظهور العربية بشكل صحيح في Excel
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

function xmlEscape(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!)
    // إزالة محارف التحكم غير المسموحة في XML
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function colName(i: number): string {
  let s = '';
  i += 1;
  while (i > 0) {
    const m = (i - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

function sheetXml(rows: Cell[][]): string {
  const body = rows.map((r, ri) => {
    const cells = r.map((v, ci) => {
      const ref = `${colName(ci)}${ri + 1}`;
      if (v == null || v === '') return '';
      if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${ri === 0 ? ' s="1"' : ''}><v>${v}</v></c>`;
      return `<c r="${ref}" t="inlineStr"${ri === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${xmlEscape(String(v))}</t></is></c>`;
    }).join('');
    return `<row r="${ri + 1}">${cells}</row>`;
  }).join('');
  const widths = (rows[0] ?? []).map((_, i) => {
    const max = Math.min(60, Math.max(8, ...rows.map((r) => String(r[i] ?? '').length + 2)));
    return `<col min="${i + 1}" max="${i + 1}" width="${max}" customWidth="1"/>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" rightToLeft="1"/></sheetViews>${widths ? `<cols>${widths}</cols>` : ''}<sheetData>${body}</sheetData></worksheet>`;
}

export function toXlsx(sheets: Sheet[]): Uint8Array {
  const safeName = (n: string, i: number) => xmlEscape(n.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || `Sheet${i + 1}`);
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView rightToLeft="1"/></bookViews><sheets>${sheets.map((s, i) => `<sheet name="${safeName(s.name, i)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'xl/styles.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0"/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>`),
  };
  sheets.forEach((s, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s.rows)); });
  return zipSync(files, { level: 6 });
}

const r1 = (n: number | null | undefined) => (n == null ? null : Math.round(n * 10) / 10);

export function reportSheets(s: SessionSummary, opts: { includeNames: boolean }): Sheet[] {
  return [
    {
      name: 'الملخص',
      rows: [
        ['البند', 'القيمة'],
        ['اسم الحصة', s.session.title],
        ['التاريخ', formatDate(s.session.started_at ?? s.session.created_at)],
        ['الدرس', s.session.lesson],
        ['عدد المشاركين', s.participants],
        ['عدد الأسئلة المطروحة', s.questionsAsked],
        ['نسبة الإجابات الصحيحة %', r1(s.overallCorrectPct)],
        ['نسبة المشاركة %', r1(s.overallParticipation)],
        ['المستوى العام', LEVEL_LABELS[s.level]],
        [],
        ['التوصيات'],
        ...s.recommendations.map((r) => [r]),
      ],
    },
    {
      name: 'الأسئلة',
      rows: [
        ['#', 'السؤال', 'النوع', 'المستوى المعرفي', 'المهارة', 'أجاب', 'المستهدفون', 'المشاركة %', 'الصحة %', 'المؤشر', 'متوسط الزمن (ث)', 'الخطأ الشائع'],
        ...s.questions.map((q) => [q.number, q.text, q.type, q.bloom, q.skill, q.answered, q.eligible, r1(q.participation), r1(q.correctPct), LEVEL_LABELS[q.level], q.avgMs == null ? null : r1(q.avgMs / 1000), q.commonWrong]),
      ],
    },
    {
      name: 'الطلاب',
      rows: [
        ['الطالب', 'الفريق', 'أجاب', 'صحيحة', 'خاطئة', 'للمراجعة', 'الدرجة', 'الصحة %', 'المؤشر'],
        ...s.students.map((st) => [opts.includeNames ? st.name : st.alias, st.team, st.answered, st.correct, st.incorrect, st.pending, st.score, r1(st.correctPct), LEVEL_LABELS[st.level]]),
      ],
    },
  ];
}

export function downloadBlob(data: BlobPart, filename: string, type: string) {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function safeFileName(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'report';
}
