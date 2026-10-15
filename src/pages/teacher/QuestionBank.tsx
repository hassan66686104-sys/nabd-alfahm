import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Copy, Filter, Heart, LibraryBig, Pencil, PlayCircle, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Card, EmptyState, ErrorBox, Input, PageHeader, Select, Spinner, cx } from '@/components/ui';
import { useFeedback } from '@/components/feedback';
import { addStarterPack, deleteQuestion, duplicateQuestion, listQuestions, setFavorite, subjects as subjectsApi, type QuestionFilters } from '@/lib/api';
import { toAppError } from '@/lib/errors';
import { BLOOM, DIFFICULTY, ISLAMIC_DOMAINS, QUESTION_TYPES, bloomLabel, difficultyLabel, typeLabel } from '@/lib/constants';
import type { Question, Subject } from '@/lib/types';

export default function QuestionBank() {
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const { toast, confirm } = useFeedback();
  const [items, setItems] = useState<Question[] | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [adding, setAdding] = useState(false);

  const filters: QuestionFilters = useMemo(() => ({
    search: params.get('q') ?? '', subject_id: params.get('subject') ?? '', grade: params.get('grade') ?? '', lesson: params.get('lesson') ?? '',
    type: params.get('type') ?? '', difficulty: params.get('difficulty') ?? '', bloom: params.get('bloom') ?? '', domain: params.get('domain') ?? '',
    favorites: params.get('fav') === '1',
  }), [params]);

  const setFilter = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v); else p.delete(k);
    setParams(p, { replace: true });
  };

  const load = useCallback(async () => {
    setError(null);
    try { setItems(await listQuestions(filters)); } catch (e) { setError(toAppError(e).message); }
  }, [filters]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => { subjectsApi.list().then(setSubjects).catch(() => {}); }, []);

  const grades = useMemo(() => [...new Set((items ?? []).map((q) => q.grade).filter(Boolean))], [items]);
  const subjectName = (id: string | null) => subjects.find((s) => s.id === id)?.name;

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const act = async (fn: () => Promise<unknown>, okMsg: string) => {
    try { await fn(); toast(okMsg); await load(); } catch (e) { toast(toAppError(e).message, 'error'); }
  };

  // الأسئلة الجاهزة تُضاف مرة واحدة، والضغط مرة أخرى لا يكررها
  const addPack = async () => {
    setAdding(true);
    try {
      const r = await addStarterPack();
      if (!r.ok) toast('تعذرت إضافة الأسئلة الجاهزة', 'error');
      else { toast(r.added ? `أضيف ${r.added} سؤالًا جاهزًا: ألغاز، ومعلومات عامة، وثقافة إسلامية` : 'الأسئلة الجاهزة موجودة في بنكك من قبل'); await load(); }
    } catch (e) { toast(toAppError(e).message, 'error'); }
    finally { setAdding(false); }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={filters.favorites ? 'الأسئلة المفضلة' : 'بنك الأسئلة'}
        subtitle={items ? `${items.length} سؤال` : undefined}
        actions={<>
          <Button variant="gold" loading={adding} onClick={addPack} data-testid="starter-pack">🧩 ألغاز وأسئلة عامة جاهزة</Button>
          <Button variant="outline" onClick={() => nav('/t/import')}>استيراد</Button>
          <Button icon={<Plus className="h-5 w-5" />} onClick={() => nav('/t/bank/new')}>سؤال جديد</Button>
        </>}
      />

      <Card className="space-y-3 p-3">
        <div className="flex gap-2">
          <Input value={filters.search} onChange={(e) => setFilter('q', e.target.value)} placeholder="ابحث بالكلمات المفتاحية…" aria-label="بحث" />
          <Button variant={showFilters ? 'primary' : 'outline'} onClick={() => setShowFilters((v) => !v)} icon={<Filter className="h-5 w-5" />}><span className="hidden sm:inline">تصفية</span></Button>
          <Button variant={filters.favorites ? 'gold' : 'outline'} onClick={() => setFilter('fav', filters.favorites ? '' : '1')} aria-pressed={filters.favorites} icon={<Heart className="h-5 w-5" />}><span className="hidden sm:inline">المفضلة</span></Button>
        </div>
        {showFilters && (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Select value={filters.subject_id} onChange={(e) => setFilter('subject', e.target.value)} aria-label="المادة"><option value="">كل المواد</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
            <Select value={filters.grade} onChange={(e) => setFilter('grade', e.target.value)} aria-label="الصف"><option value="">كل الصفوف</option>{grades.map((g) => <option key={g}>{g}</option>)}</Select>
            <Input value={filters.lesson} onChange={(e) => setFilter('lesson', e.target.value)} placeholder="الدرس" aria-label="الدرس" />
            <Select value={filters.type} onChange={(e) => setFilter('type', e.target.value)} aria-label="النوع"><option value="">كل الأنواع</option>{QUESTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</Select>
            <Select value={filters.difficulty} onChange={(e) => setFilter('difficulty', e.target.value)} aria-label="الصعوبة"><option value="">كل المستويات</option>{DIFFICULTY.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</Select>
            <Select value={filters.bloom} onChange={(e) => setFilter('bloom', e.target.value)} aria-label="المهارة المعرفية"><option value="">كل المهارات المعرفية</option>{BLOOM.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}</Select>
            <Select value={filters.domain} onChange={(e) => setFilter('domain', e.target.value)} aria-label="المجال"><option value="">كل المجالات</option>{ISLAMIC_DOMAINS.map((d) => <option key={d}>{d}</option>)}</Select>
            <Button variant="ghost" onClick={() => setParams(new URLSearchParams(), { replace: true })}>مسح التصفية</Button>
          </div>
        )}
      </Card>

      {selected.size > 0 && (
        <div className="sticky top-16 z-20 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-brand-800 p-3 text-white shadow-lg">
          <span className="font-bold">تم تحديد {selected.size} سؤال</span>
          <div className="flex gap-2">
            <Button variant="ghost" className="text-white hover:bg-brand-700" onClick={() => setSelected(new Set())}>إلغاء</Button>
            <Button variant="gold" icon={<PlayCircle className="h-5 w-5" />} onClick={() => nav(`/t/sessions/new?q=${[...selected].join(',')}`)}>إنشاء حصة من المحدد</Button>
          </div>
        </div>
      )}

      {error && <ErrorBox error={error} onRetry={load} />}
      {!items ? <Spinner /> : items.length === 0 ? (
        <EmptyState icon={<LibraryBig className="h-10 w-10" />} title="لا توجد أسئلة مطابقة" action={<Button onClick={() => nav('/t/bank/new')}>أضف سؤالك الأول</Button>}>
          أضف أسئلة بنفسك أو استوردها من ملف CSV أو JSON.
        </EmptyState>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {items.map((q) => (
            <Card key={q.id} className={cx('flex flex-col gap-3 p-4', selected.has(q.id) && 'ring-2 ring-gold-400')}>
              <div className="flex items-start gap-3">
                <input type="checkbox" checked={selected.has(q.id)} onChange={() => toggle(q.id)} className="mt-1.5 h-5 w-5 accent-brand-700" aria-label="تحديد السؤال" />
                <Link to={`/t/bank/${q.id}`} className="flex-1">
                  <div className="line-clamp-3 font-bold leading-relaxed">{q.text}</div>
                </Link>
                <button onClick={() => act(() => setFavorite(q.id, !q.is_favorite), q.is_favorite ? 'أزيل من المفضلة' : 'أضيف إلى المفضلة')}
                  className={cx('rounded-lg p-1.5', q.is_favorite ? 'text-red-600' : 'text-brand-300 hover:text-red-500')} aria-label="المفضلة" aria-pressed={q.is_favorite}>
                  <Heart className="h-5 w-5" fill={q.is_favorite ? 'currentColor' : 'none'} />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Badge>{typeLabel(q.type)}</Badge>
                <Badge tone="gold">{bloomLabel(q.bloom)}</Badge>
                <Badge tone={q.difficulty === 'hard' ? 'red' : q.difficulty === 'easy' ? 'green' : 'yellow'}>{difficultyLabel(q.difficulty)}</Badge>
                {subjectName(q.subject_id) && <Badge tone="gray">{subjectName(q.subject_id)}</Badge>}
                {q.grade && <Badge tone="gray">{q.grade}</Badge>}
                {q.lesson && <Badge tone="gray">{q.lesson}</Badge>}
                {q.domain && <Badge tone="blue">{q.domain}</Badge>}
              </div>
              <div className="flex flex-wrap gap-2 border-t border-brand-50 pt-2">
                <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => nav(`/t/bank/${q.id}`)}>تعديل</Button>
                <Button size="sm" variant="ghost" icon={<Copy className="h-4 w-4" />} onClick={() => act(() => duplicateQuestion(q.id), 'تم نسخ السؤال')}>نسخ</Button>
                <Button size="sm" variant="ghost" icon={<PlayCircle className="h-4 w-4" />} onClick={() => nav(`/t/sessions/new?q=${q.id}`)}>حصة بهذا السؤال</Button>
                <Button size="sm" variant="ghost" className="text-red-700" icon={<Trash2 className="h-4 w-4" />} onClick={async () => {
                  if (await confirm({ title: 'حذف السؤال؟', body: 'سيُحذف السؤال من البنك نهائيًا. نتائج الحصص السابقة تبقى محفوظة.', confirmText: 'حذف', danger: true }))
                    await act(() => deleteQuestion(q.id), 'تم حذف السؤال');
                }}>حذف</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
