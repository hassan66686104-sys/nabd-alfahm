import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Download, FileUp, XCircle } from 'lucide-react';
import { Badge, Button, Card, ErrorBox, PageHeader, ProgressBar, Textarea } from '@/components/ui';
import { useFeedback } from '@/components/feedback';
import { parseImport, SAMPLE_CSV, TEMPLATE_HEADERS, type ImportRow } from '@/lib/importer';
import { saveQuestion, subjects as subjectsApi } from '@/lib/api';
import { toAppError } from '@/lib/errors';
import { downloadBlob } from '@/lib/export';
import { typeLabel } from '@/lib/constants';

export default function ImportQuestions() {
  const nav = useNavigate();
  const { toast } = useFeedback();
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [paste, setPaste] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number; failed: { line: number; error: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return setError('حجم الملف أكبر من 2 ميجابايت.');
    setError(null);
    setRows(parseImport(await file.text(), file.name));
  };

  const valid = rows?.filter((r) => r.ok) ?? [];

  const run = async () => {
    const failed: { line: number; error: string }[] = [];
    setProgress({ done: 0, total: valid.length, failed });
    try {
      const existing = await subjectsApi.list();
      const subjectIds = new Map(existing.map((s) => [s.name, s.id]));
      for (let i = 0; i < valid.length; i++) {
        const r = valid[i];
        try {
          let subjectId: string | null = null;
          if (r.subjectName) {
            subjectId = subjectIds.get(r.subjectName) ?? null;
            if (!subjectId) { const s = await subjectsApi.create(r.subjectName); subjectIds.set(s.name, s.id); subjectId = s.id; }
          }
          await saveQuestion({ ...r.question!, subject_id: subjectId });
        } catch (e) {
          failed.push({ line: r.line, error: toAppError(e).message });
        }
        setProgress({ done: i + 1, total: valid.length, failed: [...failed] });
      }
      const ok = valid.length - failed.length;
      if (ok > 0) toast(`تم استيراد ${ok} سؤال`);
      if (failed.length) toast(`تعذر استيراد ${failed.length} سؤال`, 'error');
    } catch (e) {
      setError(toAppError(e).message);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader title="استيراد الأسئلة" subtitle="من ملف CSV (يفتح في Excel) أو JSON. يُتحقق من كل سؤال قبل حفظه." />
      <Card className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-brand-700 px-4 py-2.5 font-semibold text-white hover:bg-brand-800">
            <FileUp className="h-5 w-5" /> اختر ملفًا
            <input type="file" accept=".csv,.json,.txt,text/csv,application/json" className="hidden" onChange={(e) => readFile(e.target.files?.[0])} />
          </label>
          <Button variant="outline" icon={<Download className="h-5 w-5" />} onClick={() => downloadBlob('﻿' + SAMPLE_CSV, 'nabd-template.csv', 'text/csv;charset=utf-8')}>تنزيل قالب CSV نموذجي</Button>
        </div>
        <details className="text-sm text-brand-700">
          <summary className="cursor-pointer font-semibold">تعليمات الأعمدة</summary>
          <div className="mt-2 space-y-1">
            <p dir="ltr" className="rounded bg-ivory-100 p-2 font-mono text-xs">{TEMPLATE_HEADERS.join(', ')}</p>
            <p><b>type</b>: نوع السؤال بالإنجليزية (mcq, true_false, multi_select, short_answer, open_ended, fill_blank, ordering, matching…) أو باسمه العربي.</p>
            <p><b>options</b>: الخيارات مفصولة بـ | ، و<b>correct</b>: رقم الخيار الصحيح أو حرفه (1 أو أ)، وللمتعدد: 1|3.</p>
            <p><b>match</b>: الطرف المقابل لأسئلة التوصيل بنفس ترتيب options. <b>accepted</b>: الإجابات المقبولة للإجابة القصيرة مفصولة بـ |.</p>
            <p><b>blanks</b>: إجابات الفراغات مفصولة بـ ; وبدائل كل فراغ بـ | . الصعوبة: easy/medium/hard، المستوى المعرفي: remember…create أو بالعربية.</p>
            <p>النصوص الشرعية: ضعها في stimulus_text مع stimulus_kind (ayah أو hadith) والمصدر في stimulus_source، وراجعها بنفسك.</p>
          </div>
        </details>
        <Textarea rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="أو الصق محتوى CSV أو JSON هنا" dir="auto" />
        {paste.trim() && <Button variant="soft" onClick={() => setRows(parseImport(paste, paste.trim().startsWith('[') ? 'x.json' : 'x.csv'))}>تحليل النص الملصق</Button>}
      </Card>

      {error && <ErrorBox error={error} />}

      {rows && (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2"><Badge tone="green">صالح: {valid.length}</Badge><Badge tone="red">به أخطاء: {rows.length - valid.length}</Badge></div>
            {!progress && <Button disabled={valid.length === 0} onClick={run}>استيراد {valid.length} سؤال</Button>}
          </div>
          {progress && (
            <div className="space-y-2">
              <ProgressBar value={(progress.done / Math.max(1, progress.total)) * 100} label="تقدم الاستيراد" />
              <div className="text-sm">{progress.done} / {progress.total}</div>
              {progress.done === progress.total && <Button onClick={() => nav('/t/bank')}>الذهاب إلى بنك الأسئلة</Button>}
              {progress.failed.map((f) => <div key={f.line} className="text-sm text-red-700">السطر {f.line}: {f.error}</div>)}
            </div>
          )}
          <div className="max-h-[420px] overflow-auto">
            <table className="table-base">
              <thead><tr><th>السطر</th><th>الحالة</th><th>النوع</th><th>السؤال / الخطأ</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.line}>
                    <td>{r.line}</td>
                    <td>{r.ok ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <XCircle className="h-5 w-5 text-red-600" />}</td>
                    <td>{r.question ? typeLabel(r.question.type) : '—'}</td>
                    <td className={r.ok ? '' : 'text-red-700'}>{r.ok ? r.question!.text : r.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
