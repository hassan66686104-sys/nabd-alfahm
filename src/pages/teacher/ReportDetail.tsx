import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowRight, FileSpreadsheet, FileText, Printer, RefreshCw, Users, CheckCircle2, HelpCircle, Activity } from 'lucide-react';
import { Badge, Button, Card, ErrorBox, LEVEL_STYLES, LevelBadge, PageHeader, Spinner, StatCard, Textarea } from '@/components/ui';
import { useFeedback } from '@/components/feedback';
import { getSession, listParticipants, listResponses, listSessionQuestions, listTeams, reports } from '@/lib/api';
import { toAppError } from '@/lib/errors';
import { levelFor, summarizeSession, type SessionSummary } from '@/lib/stats';
import { downloadBlob, reportSheets, safeFileName, toCsv, toXlsx } from '@/lib/export';
import { formatDate, formatDuration, pct } from '@/lib/text';
import { useSettings } from '@/hooks/useAuth';
import { gameLabel } from '@/lib/constants';
import type { GameMode } from '@/lib/types';

export default function ReportDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const settings = useSettings();
  const { toast } = useFeedback();
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [names, setNames] = useState(true);

  // يُعاد حساب التقرير من البيانات المحفوظة دائمًا، ثم تُحدّث نسخته المخزنة
  const build = async () => {
    if (!id) return;
    setError(null);
    try {
      const [s, q, p, r, t, saved] = await Promise.all([getSession(id), listSessionQuestions(id), listParticipants(id), listResponses(id), listTeams(id), reports.get(id)]);
      const sum = summarizeSession(s, q, p, r, t, { mastery: settings.mastery, reinforce: settings.reinforce });
      setSummary(sum);
      setNotes(saved?.teacher_notes ?? '');
      if (s.status === 'ended') await reports.save(id, sum).catch(() => {});
    } catch (e) { setError(toAppError(e).message); }
  };
  useEffect(() => { void build(); }, [id, settings.mastery, settings.reinforce]); // eslint-disable-line react-hooks/exhaustive-deps

  const chart = useMemo(() => summary?.questions.map((q) => ({ name: `س${q.number}`, pct: q.correctPct == null ? 0 : Math.round(q.correctPct), level: q.level, text: q.text })) ?? [], [summary]);

  if (error) return <ErrorBox error={error} onRetry={build} />;
  if (!summary) return <Spinner label="جارٍ إعداد التقرير…" />;
  const fileBase = safeFileName(`تقرير ${summary.session.title}`);

  return (
    <div className="space-y-5">
      <div className="no-print"><Button variant="ghost" icon={<ArrowRight className="h-5 w-5" />} onClick={() => nav('/t/reports')}>كل التقارير</Button></div>
      <PageHeader
        title={summary.session.title}
        subtitle={<>{formatDate(summary.session.started_at ?? summary.session.created_at)}{summary.session.lesson && ` · ${summary.session.lesson}`}</>}
        actions={<div className="no-print flex flex-wrap gap-2">
          <Button variant="outline" icon={<FileText className="h-5 w-5" />} onClick={() => downloadBlob(toCsv(reportSheets(summary, { includeNames: names }).flatMap((s, i) => [...(i ? [[], [s.name]] : [[s.name]]), ...s.rows])), `${fileBase}.csv`, 'text/csv;charset=utf-8')}>CSV</Button>
          <Button variant="outline" icon={<FileSpreadsheet className="h-5 w-5" />} onClick={() => downloadBlob(toXlsx(reportSheets(summary, { includeNames: names })), `${fileBase}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}>Excel</Button>
          <Button variant="outline" icon={<Printer className="h-5 w-5" />} onClick={() => window.print()}>طباعة</Button>
          <Button variant="ghost" icon={<RefreshCw className="h-5 w-5" />} onClick={build}>تحديث</Button>
        </div>}
      />
      <label className="no-print flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand-700" checked={names} onChange={(e) => setNames(e.target.checked)} />إظهار أسماء الطلاب الحقيقية (في الصفحة والتصدير)</label>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="المشاركون" value={summary.participants} icon={<Users className="h-5 w-5" />} />
        <StatCard label="الأسئلة المطروحة" value={summary.questionsAsked} icon={<HelpCircle className="h-5 w-5" />} tone="gold" />
        <StatCard label="نسبة الإجابات الصحيحة" value={pct(summary.overallCorrectPct)} icon={<CheckCircle2 className="h-5 w-5" />} tone={summary.level === 'green' ? 'green' : summary.level === 'red' ? 'red' : 'yellow'} />
        <StatCard label="نسبة المشاركة" value={pct(summary.overallParticipation)} icon={<Activity className="h-5 w-5" />} />
      </div>

      <Card className="print-break space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-extrabold">نسبة الصحة لكل سؤال</h2><LevelBadge level={summary.level} pct={summary.overallCorrectPct} /></div>
        {chart.length > 0 ? (
          <div className="h-64" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#d5ebdf" />
                <XAxis dataKey="name" reversed tick={{ fontFamily: 'Cairo', fontWeight: 700 }} />
                <YAxis domain={[0, 100]} unit="%" tick={{ fontFamily: 'Cairo' }} orientation="right" />
                <Tooltip formatter={(v: number) => [`${v}%`, 'الصحة']} labelFormatter={(_, p) => (p?.[0]?.payload?.text as string) ?? ''} contentStyle={{ direction: 'rtl', fontFamily: 'Cairo', borderRadius: 12 }} />
                <Bar dataKey="pct" radius={[8, 8, 0, 0]} isAnimationActive={false}>
                  {chart.map((c, i) => <Cell key={i} fill={LEVEL_STYLES[c.level].fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : <p className="text-brand-600">لم تُطرح أسئلة.</p>}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="print-break space-y-2">
          <h2 className="text-xl font-extrabold">التوصيات لمتابعة التعلم</h2>
          <ul className="list-inside list-disc space-y-1.5">{summary.recommendations.map((r) => <li key={r}>{r}</li>)}</ul>
        </Card>
        <Card className="print-break space-y-3">
          <h2 className="text-xl font-extrabold">الأسئلة الأكثر صعوبة</h2>
          {summary.hardest.length === 0 ? <p className="text-brand-600">لا توجد أسئلة مصححة.</p> : summary.hardest.map((h) => (
            <div key={h.sq_id} className="flex items-start justify-between gap-2 border-b border-brand-50 pb-2"><span>س{h.number}: {h.text}</span><LevelBadge level={levelFor(h.correctPct, summary.thresholds)} pct={h.correctPct} /></div>
          ))}
          <h3 className="pt-2 font-extrabold">مفاهيم تحتاج إلى إعادة تدريس</h3>
          {summary.reteach.length === 0 ? <p className="text-green-700">لا توجد مفاهيم تحت حد التعزيز ({summary.thresholds.reinforce}%).</p>
            : summary.reteach.map((r, i) => <div key={i} className="text-sm">• {r.skill || r.lesson || r.text} <span className="text-red-700">({Math.round(r.correctPct)}%)</span></div>)}
          {summary.exitTicket && (
            <div className="rounded-xl bg-gold-50 p-3"><b>سؤال الخروج:</b> {summary.exitTicket.text} — الصحة {pct(summary.exitTicket.correctPct)} ({summary.exitTicket.answered} إجابة)</div>
          )}
        </Card>
      </div>

      <Card className="print-break space-y-2">
        <h2 className="text-xl font-extrabold">تفاصيل الأسئلة</h2>
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>#</th><th>السؤال</th><th>النوع</th><th>المستوى المعرفي</th><th>المشاركة</th><th>الصحة</th><th>متوسط الزمن</th><th>الخطأ الشائع</th></tr></thead>
            <tbody>{summary.questions.map((q) => (
              <tr key={q.sq_id}>
                <td>{q.number}</td>
                <td className="min-w-[220px]">{q.text}{q.game_mode !== 'none' && <Badge tone="gold" className="ms-1">{gameLabel(q.game_mode as GameMode)}</Badge>}</td>
                <td>{q.type}</td><td>{q.bloom}</td>
                <td>{q.answered}/{q.eligible}</td>
                <td><LevelBadge level={q.level} pct={q.correctPct} /></td>
                <td>{formatDuration(q.avgMs)}</td>
                <td>{q.commonWrong ?? '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Card>

      <Card className="print-break space-y-2">
        <h2 className="text-xl font-extrabold">نتائج الطلاب الفردية <span className="text-sm font-normal text-brand-600">(للمعلم فقط)</span></h2>
        {summary.needSupport.length > 0 && <p className="rounded-xl bg-red-50 p-3 text-red-800">يحتاجون إلى دعم إضافي: {summary.needSupport.map((s) => (names ? s.name : summary.students.find((x) => x.id === s.id)?.alias)).join('، ')}</p>}
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>الطالب</th><th>الفريق</th><th>أجاب</th><th>صحيحة</th><th>خاطئة</th><th>للمراجعة</th><th>الدرجة</th><th>المؤشر</th></tr></thead>
            <tbody>{summary.students.map((s) => (
              <tr key={s.id}><td className="font-semibold">{names ? s.name : s.alias}</td><td>{s.team ?? '—'}</td><td>{s.answered}</td><td>{s.correct}</td><td>{s.incorrect}</td><td>{s.pending}</td><td>{s.score}</td><td><LevelBadge level={s.level} pct={s.correctPct} /></td></tr>
            ))}</tbody>
          </table>
        </div>
        <p className="text-xs text-brand-600">المؤشرات مساعدة للمعلم وليست حكمًا نهائيًا على مستوى أي طالب.</p>
      </Card>

      <Card className="no-print space-y-2">
        <h2 className="text-lg font-extrabold">ملاحظاتي على الحصة</h2>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={4000} placeholder="ما الذي سأعيده في الحصة القادمة؟" />
        <Button loading={saving} onClick={async () => {
          setSaving(true);
          try { await reports.save(summary.session.id, summary, notes); toast('حُفظت الملاحظات'); } catch (e) { toast(toAppError(e).message, 'error'); } finally { setSaving(false); }
        }}>حفظ الملاحظات</Button>
      </Card>
    </div>
  );
}
