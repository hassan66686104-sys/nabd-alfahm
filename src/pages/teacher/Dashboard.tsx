import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileUp, MessageCircleQuestion, LibraryBig, PlayCircle, Search, Zap, CalendarClock, Radio, Trophy } from 'lucide-react';
import { Badge, Button, Card, EmptyState, ErrorBox, Input, PageHeader, Spinner } from '@/components/ui';
import { listQuestions, listSessions } from '@/lib/api';
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
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<Question[] | null>(null);

  const load = async () => {
    setError(null);
    try {
      setSessions(await listSessions(20));
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
    { to: '/t/sessions/new', label: 'حصة جديدة', icon: PlayCircle },
    { to: '/t/quick', label: 'اختبر فهمهم', icon: Zap },
    { to: '/t/bank', label: 'بنك الأسئلة', icon: LibraryBig },
    { to: '/t/import', label: 'استيراد', icon: FileUp },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={`أهلًا ${profile?.full_name || 'بك'}`} />

      <div className="grid gap-4 md:grid-cols-2">
        <Link to="/t/instant" data-testid="instant-banner"
          className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-fuchsia-500 p-6 text-white shadow-lift transition hover:-translate-y-1">
          <MessageCircleQuestion className="mb-6 h-10 w-10 text-gold-300 transition group-hover:scale-110" />
          <div className="text-2xl font-black">الأسئلة الفورية</div>
          <div className="text-white/85">سؤال الآن، نتيجة فورًا</div>
          <span aria-hidden className="absolute -bottom-6 -left-6 text-[7rem] opacity-15">💬</span>
        </Link>
        <Link to="/t/challenge/new" data-testid="challenge-banner"
          className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-gold-300 to-coral-400 p-6 text-brand-900 shadow-lift transition hover:-translate-y-1">
          <Trophy className="mb-6 h-10 w-10 transition group-hover:scale-110" />
          <div className="text-2xl font-black">تحدي الكأس</div>
          <div className="text-brand-900/80">مسابقة يلعبها الطلاب بأنفسهم</div>
          <span aria-hidden className="absolute -bottom-6 -left-6 text-[7rem] opacity-20">🏆</span>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.to} to={t.to}
            className="flex items-center gap-3 rounded-2xl border border-brand-100 bg-white p-4 font-extrabold text-brand-900 shadow-card transition hover:-translate-y-0.5 hover:border-brand-300">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><t.icon className="h-6 w-6" /></span>
            {t.label}
          </Link>
        ))}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-brand-400" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث في أسئلتك وحصصك…" className="h-12 pr-10 text-lg" aria-label="بحث سريع" />
        {(found || foundSessions.length > 0) && (
          <Card className="absolute inset-x-0 top-14 z-20 max-h-96 space-y-1 overflow-y-auto p-2">
            {foundSessions.map((s) => (
              <Link key={s.id} to={s.status === 'ended' ? `/t/reports/${s.id}` : s.mode === 'self' ? `/t/challenge/${s.id}` : `/t/live/${s.id}`} className="flex items-center justify-between rounded-xl p-2 hover:bg-brand-50">
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

      {error && <ErrorBox error={error} onRetry={load} />}


      <section>
        <h2 className="mb-3 text-xl font-extrabold">آخر الحصص</h2>
        {!sessions ? <Spinner /> : sessions.length === 0 ? (
          <EmptyState icon={<PlayCircle className="h-10 w-10" />} title="لم تبدأ أي حصة بعد" action={<Button onClick={() => nav('/t/quick')} icon={<Zap className="h-5 w-5" />} variant="gold">جرّب «اختبر فهمهم»</Button>}>
          </EmptyState>
        ) : (
          <div className="grid gap-2">
            {sessions.map((s) => (
              <Card key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-bold">
                    {s.status === 'live' && <Radio className="h-4 w-4 animate-pulseDot text-green-600" />}
                    {s.mode === 'self' && <Trophy className="h-4 w-4 shrink-0 text-gold-500" />}
                    <span className="truncate">{s.title}</span>
                  </div>
                  <div className="text-sm text-brand-600">{formatDate(s.started_at ?? s.created_at)}{s.lesson && ` · ${s.lesson}`} · الرمز <span dir="ltr" className="font-mono">{s.code}</span></div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Badge>
                  {s.status === 'ended'
                    ? <Button size="sm" variant="outline" onClick={() => nav(`/t/reports/${s.id}`)}>التقرير</Button>
                    : <Button size="sm" onClick={() => nav(s.mode === 'self' ? `/t/challenge/${s.id}` : `/t/live/${s.id}`)}>{s.mode === 'self' ? 'متابعة التحدي' : 'متابعة الحصة'}</Button>}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
