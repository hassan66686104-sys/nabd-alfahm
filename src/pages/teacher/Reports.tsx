import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from 'recharts';
import { BarChart3, Radio } from 'lucide-react';
import { Badge, Card, EmptyState, ErrorBox, LevelBadge, PageHeader, Select, Spinner } from '@/components/ui';
import { classes as classesApi, listSessions, reports as reportsApi } from '@/lib/api';
import { toAppError } from '@/lib/errors';
import { formatDate, pct } from '@/lib/text';
import { useSettings } from '@/hooks/useAuth';
import { levelFor, type SessionSummary } from '@/lib/stats';
import type { ClassGroup, Session } from '@/lib/types';

export default function Reports() {
  const settings = useSettings();
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [summaries, setSummaries] = useState<Map<string, SessionSummary>>(new Map());
  const [classList, setClassList] = useState<ClassGroup[]>([]);
  const [classFilter, setClassFilter] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const [s, r, c] = await Promise.all([listSessions(200), reportsApi.list(), classesApi.list()]);
      setSessions(s); setClassList(c);
      setSummaries(new Map(r.map((x) => [x.session_id, x.summary])));
    } catch (e) { setError(toAppError(e).message); }
  };
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => (sessions ?? []).filter((s) => !classFilter || s.class_id === classFilter), [sessions, classFilter]);
  const trend = useMemo(() => filtered
    .filter((s) => s.status === 'ended' && summaries.get(s.id)?.overallCorrectPct != null)
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
    .map((s) => ({ name: new Intl.DateTimeFormat('ar', { month: 'short', day: 'numeric' }).format(new Date(s.started_at ?? s.created_at)), title: s.title, pct: Math.round(summaries.get(s.id)!.overallCorrectPct!), part: Math.round(summaries.get(s.id)!.overallParticipation) })), [filtered, summaries]);

  return (
    <div className="space-y-4">
      <PageHeader title="تقاريري" actions={
        <Select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="w-56" aria-label="تصفية حسب الصف">
          <option value="">كل الصفوف</option>{classList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      } />
      {error && <ErrorBox error={error} onRetry={load} />}
      {trend.length >= 2 && (
        <Card className="space-y-2">
          <h2 className="text-lg font-extrabold">مقارنة نتائج {classFilter ? 'الصف' : 'الحصص'} عبر الزمن</h2>
          <div className="h-64" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d5ebdf" />
                <XAxis dataKey="name" reversed tick={{ fontFamily: 'Cairo' }} />
                <YAxis domain={[0, 100]} unit="%" orientation="right" tick={{ fontFamily: 'Cairo' }} />
                <Tooltip labelFormatter={(_, p) => (p?.[0]?.payload?.title as string) ?? ''} formatter={(v: number, n: string) => [`${v}%`, n === 'pct' ? 'الصحة' : 'المشاركة']} contentStyle={{ direction: 'rtl', fontFamily: 'Cairo', borderRadius: 12 }} />
                <ReferenceLine y={settings.mastery} stroke="#15803d" strokeDasharray="4 4" />
                <ReferenceLine y={settings.reinforce} stroke="#d97706" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="pct" stroke="#6440e3" strokeWidth={3} dot={{ r: 5 }} isAnimationActive={false} />
                <Line type="monotone" dataKey="part" stroke="#c9a227" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-sm text-brand-600">الخط الأخضر الداكن: نسبة الصحة، والذهبي: المشاركة.</p>
        </Card>
      )}
      {!sessions ? <Spinner /> : filtered.length === 0 ? (
        <EmptyState icon={<BarChart3 className="h-10 w-10" />} title="لا توجد حصص بعد">بعد انتهاء أول حصة سيظهر تقريرها هنا.</EmptyState>
      ) : (
        <div className="grid gap-2">
          {filtered.map((s) => {
            const sum = summaries.get(s.id);
            return (
              <Link key={s.id} to={s.status === 'ended' ? `/t/reports/${s.id}` : s.mode === 'self' ? `/t/challenge/${s.id}` : `/t/live/${s.id}`}>
                <Card className="flex flex-wrap items-center justify-between gap-3 p-3 transition hover:border-brand-300 sm:p-4">
                  <div>
                    <div className="flex items-center gap-2 font-bold">{s.status !== 'ended' && <Radio className="h-4 w-4 text-green-600" />}{s.title}</div>
                    <div className="text-sm text-brand-600">{formatDate(s.started_at ?? s.created_at)}{classList.find((c) => c.id === s.class_id) && ` · ${classList.find((c) => c.id === s.class_id)!.name}`}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {sum ? <>
                      <Badge tone="gray">{sum.participants} مشارك</Badge>
                      <Badge tone="gray">{sum.questionsAsked} سؤال</Badge>
                      <LevelBadge level={levelFor(sum.overallCorrectPct, settings)} pct={sum.overallCorrectPct} />
                    </> : s.status === 'ended' ? <Badge tone="gray">افتح لإنشاء التقرير</Badge> : <Badge tone="green">جارية — {pct(null)}</Badge>}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
