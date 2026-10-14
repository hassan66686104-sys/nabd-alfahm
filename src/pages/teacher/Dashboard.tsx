import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BarChart3, FileUp, Heart, LibraryBig, PlayCircle, Search, Settings, Users, Zap, CalendarClock, HelpCircle, Radio } from 'lucide-react';
import { Badge, Button, Card, EmptyState, ErrorBox, Input, PageHeader, Spinner, StatCard } from '@/components/ui';
import { dashboardCounts, listQuestions, listSessions } from '@/lib/api';
import { toAppError } from '@/lib/errors';
import { useAuth } from '@/hooks/useAuth';
import type { Question, Session } from '@/lib/types';
import { formatDate } from '@/lib/text';
import { typeLabel } from '@/lib/constants';

const STATUS: Record<Session['status'], { label: string; tone: 'green' | 'gold' | 'gray' }> = {
  lobby: { label: 'بانتظار البدء', tone: 'gold' },
  live: { label: 'مباشرة الآن', tone: 'green' },
  ended: { label: 'منتهية', tone: 'gray' },
};

export default function Dashboard() {
  const { profile } = useAuth();
  const nav = useNavigate();
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [counts, setCounts] = useState<{ sessions: number; questions: number; participants: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<Question[] | null>(null);

  const load = async () => {
    setError(null);
    try {
      const [s, c] = await Promise.all([listSessions(20), dashboardCounts()]);
      setSessions(s); setCounts(c);
    } catch (e) { setError(toAppError(e).message); }
  };
  useEffect(() => { void load(); }, []);

  // بحث سريع في الأسئلة والحصص
  useEffect(() => {
    const term = search.trim();
    if (term.length < 2) { setFound(null); return; }
    const t = setTimeout(() => { listQuestions({ search: term, limit: 8 }).then(setFound).catch(() => setFound([])); }, 300);
    return () => clearTimeout(t);
  }, [search]);
  const foundSessions = useMemo(() => {
    const term = search.trim();
    if (term.length < 2 || !sessions) return [];
    return sessions.filter((s) => s.title.includes(term) || s.lesson.includes(term)).slice(0, 5);
  }, [search, sessions]);

  const tiles = [
    { to: '/t/sessions/new', label: 'ابدأ حصة جديدة', icon: PlayCircle, primary: true },
    { to: '/t/quick', label: 'اختبر فهمهم الآن', icon: Zap, gold: true },
    { to: '/t/bank', label: 'بنك الأسئلة', icon: LibraryBig },
    { to: '/t/bank?fav=1', label: 'الأسئلة المفضلة', icon: Heart },
    { to: '/t/reports', label: 'تقاريري', icon: BarChart3 },
    { to: '/t/import', label: 'استيراد الأسئلة', icon: FileUp },
    { to: '/t/settings', label: 'الإعدادات', icon: Settings },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={`أهلًا ${profile?.full_name || 'بك'}`} subtitle="ما الذي تريد معرفته عن فهم طلابك اليوم؟" />

      <div className="relative">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-brand-400" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث عن سؤال أو درس أو حصة محفوظة…" className="h-12 pr-10 text-lg" aria-label="بحث سريع" />
        {(found || foundSessions.length > 0) && (
          <Card className="absolute inset-x-0 top-14 z-20 max-h-96 space-y-1 overflow-y-auto p-2">
            {foundSessions.map((s) => (
              <Link key={s.id} to={s.status === 'ended' ? `/t/reports/${s.id}` : `/t/live/${s.id}`} className="flex items-center justify-between rounded-xl p-2 hover:bg-brand-50">
                <span><CalendarClock className="ms-1 inline h-4 w-4" /> {s.title}</span><Badge tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Badge>
              </Link>
            ))}
            {found?.map((q) => (
              <Link key={q.id} to={`/t/bank/${q.id}`} className="block rounded-xl p-2 hover:bg-brand-50">
                <div className="line-clamp-1 font-semibold">{q.text}</div>
                <div className="text-xs text-brand-600">{typeLabel(q.type)}{q.lesson && ` · ${q.lesson}`}</div>
              </Link>
            ))}
            {found && found.length === 0 && foundSessions.length === 0 && <div className="p-3 text-brand-600">لا توجد نتائج.</div>}
          </Card>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.to} to={t.to}
            className={`flex min-h-[110px] flex-col justify-between rounded-2xl p-4 shadow-card transition hover:-translate-y-0.5 ${t.primary ? 'bg-brand-700 text-white' : t.gold ? 'bg-gold-400 text-brand-900' : 'border border-brand-100 bg-white text-brand-800'}`}>
            <t.icon className="h-8 w-8" />
            <span className="text-lg font-extrabold">{t.label}</span>
          </Link>
        ))}
      </div>

      {error && <ErrorBox error={error} onRetry={load} />}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="الحصص" value={counts?.sessions ?? '—'} icon={<CalendarClock className="h-6 w-6" />} />
        <StatCard label="الأسئلة في البنك" value={counts?.questions ?? '—'} icon={<HelpCircle className="h-6 w-6" />} tone="gold" />
        <StatCard label="مشاركات الطلاب" value={counts?.participants ?? '—'} icon={<Users className="h-6 w-6" />} tone="green" />
      </div>

      <section>
        <h2 className="mb-3 text-xl font-extrabold">الحصص السابقة</h2>
        {!sessions ? <Spinner /> : sessions.length === 0 ? (
          <EmptyState icon={<PlayCircle className="h-10 w-10" />} title="لم تبدأ أي حصة بعد" action={<Button onClick={() => nav('/t/quick')} icon={<Zap className="h-5 w-5" />} variant="gold">جرّب «اختبر فهمهم الآن»</Button>}>
            ابدأ بسؤال سريع، أو أنشئ بنك أسئلتك أولًا.
          </EmptyState>
        ) : (
          <div className="grid gap-2">
            {sessions.map((s) => (
              <Card key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-bold">
                    {s.status === 'live' && <Radio className="h-4 w-4 animate-pulseDot text-green-600" />}
                    <span className="truncate">{s.title}</span>
                  </div>
                  <div className="text-sm text-brand-600">{formatDate(s.started_at ?? s.created_at)}{s.lesson && ` · ${s.lesson}`} · الرمز <span dir="ltr" className="font-mono">{s.code}</span></div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Badge>
                  {s.status === 'ended'
                    ? <Button size="sm" variant="outline" onClick={() => nav(`/t/reports/${s.id}`)}>التقرير</Button>
                    : <Button size="sm" onClick={() => nav(`/t/live/${s.id}`)}>متابعة الحصة</Button>}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
