import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, LibraryBig, PlayCircle, Plus, Trash2, Users } from 'lucide-react';
import { Badge, Button, Card, ErrorBox, Field, Input, Modal, PageHeader, Select, Toggle } from '@/components/ui';
import QuestionPicker from '@/components/QuestionPicker';
import QuestionForm from '@/components/QuestionForm';
import { useFeedback } from '@/components/feedback';
import { classes as classesApi, createSession, getQuestion, listQuestions, subjects as subjectsApi } from '@/lib/api';
import { toAppError } from '@/lib/errors';
import { sessionSchema, firstError } from '@/lib/schemas';
import { GAME_MODES, TEAM_COLORS, typeLabel } from '@/lib/constants';
import { useSettings } from '@/hooks/useAuth';
import type { ClassGroup, GameMode, Question, Subject } from '@/lib/types';

interface Item { q: Question; time: string; game: GameMode; retry: boolean }

export default function NewSession() {
  const settings = useSettings();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { toast } = useFeedback();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classList, setClassList] = useState<ClassGroup[]>([]);
  const [form, setForm] = useState({
    title: '', class_id: '', subject_id: '', grade: '', unit: '', lesson: '',
    anonymous: settings.anonymous, hide_names: settings.hide_names, hide_results: true, leaderboard_enabled: false,
    teams_enabled: false, auto_approve_open: false,
  });
  const [teams, setTeams] = useState<string[]>(['الفريق الأول', 'الفريق الثاني']);
  const [items, setItems] = useState<Item[]>([]);
  const [picker, setPicker] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newQ, setNewQ] = useState(false);
  const [newClass, setNewClass] = useState('');
  const [error, setError] = useState<string | null>(null);

  const toItem = (q: Question): Item => ({ q, time: q.time_limit_seconds ? String(q.time_limit_seconds) : settings.default_time ? String(settings.default_time) : '', game: q.type === 'exit_ticket' ? 'exit' : 'none', retry: false });

  useEffect(() => {
    subjectsApi.list().then(setSubjects).catch(() => {});
    classesApi.list().then(setClassList).catch(() => {});
    const ids = params.get('q')?.split(',').filter(Boolean) ?? [];
    if (ids.length) {
      listQuestions({ limit: 300 }).then((all) => {
        const map = new Map(all.map((q) => [q.id, q]));
        setItems(ids.map((id) => map.get(id)).filter((q): q is Question => !!q).map(toItem));
        const first = map.get(ids[0]);
        if (first) setForm((f) => ({ ...f, lesson: f.lesson || first.lesson, grade: f.grade || first.grade, unit: f.unit || first.unit, subject_id: f.subject_id || first.subject_id || '', title: f.title || (first.lesson ? `حصة: ${first.lesson}` : '') }));
      }).catch((e) => setError(toAppError(e).message));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const move = (i: number, d: number) => setItems((l) => { const n = [...l]; const j = i + d; if (j < 0 || j >= n.length) return l; [n[i], n[j]] = [n[j], n[i]]; return n; });

  const create = async () => {
    setError(null);
    const parsed = sessionSchema.safeParse({ ...form, class_id: form.class_id || null, subject_id: form.subject_id || null, teams: teams.map((t) => t.trim()).filter(Boolean) });
    if (!parsed.success) return setError(firstError(parsed.error));
    for (const it of items) {
      if (it.time && (Number(it.time) < 3 || Number(it.time) > 3600)) return setError('زمن السؤال يجب أن يكون بين 3 ثوانٍ وساعة');
    }
    setCreating(true);
    try {
      let classId = parsed.data.class_id;
      if (newClass.trim()) classId = (await classesApi.create(newClass.trim(), form.grade)).id;
      const { teams: teamNames, ...sessionInput } = parsed.data;
      const s = await createSession(
        { ...sessionInput, class_id: classId },
        items.map((it) => ({ question_id: it.q.id, time_limit_seconds: it.game === 'five_seconds' ? 5 : it.time ? Number(it.time) : null, game_mode: it.game, allow_retry: it.retry })),
        teamNames.map((name, i) => ({ name, color: TEAM_COLORS[i % TEAM_COLORS.length] })),
      );
      toast('تم إنشاء الحصة');
      nav(`/t/live/${s.id}`);
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="w-full space-y-4">
      <PageHeader title="حصة جديدة" subtitle="خطوات قليلة: اسم الحصة، الأسئلة، ثم ابدأ" />
      <Card className="space-y-3">
        <h2 className="text-lg font-bold">1. بيانات الحصة</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="اسم الحصة" className="sm:col-span-2 lg:col-span-1"><Input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="مثال: الصدق — الصف الخامس أ" autoFocus /></Field>
          <Field label="الصف / المجموعة" hint="لمقارنة نتائج الصف بين الحصص">
            <Select value={newClass ? '__new' : form.class_id} onChange={(e) => { if (e.target.value === '__new') setNewClass(' '); else { setNewClass(''); set('class_id', e.target.value); } }}>
              <option value="">— بدون —</option>
              {classList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              <option value="__new">+ صف جديد…</option>
            </Select>
            {newClass && <Input className="mt-2" value={newClass.trimStart()} onChange={(e) => setNewClass(e.target.value || ' ')} placeholder="اسم الصف، مثال: 5/أ" autoFocus />}
          </Field>
          <Field label="المادة">
            <Select value={form.subject_id} onChange={(e) => set('subject_id', e.target.value)}>
              <option value="">— بدون —</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="الصف الدراسي"><Input value={form.grade} onChange={(e) => set('grade', e.target.value)} /></Field>
          <Field label="الوحدة"><Input value={form.unit} onChange={(e) => set('unit', e.target.value)} /></Field>
          <Field label="الدرس"><Input value={form.lesson} onChange={(e) => set('lesson', e.target.value)} /></Field>
        </div>
      </Card>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">2. الأسئلة <Badge>{items.length}</Badge></h2>
          <div className="flex gap-2">
            <Button variant="outline" icon={<LibraryBig className="h-5 w-5" />} onClick={() => setPicker(true)}>من البنك</Button>
            <Button variant="soft" icon={<Plus className="h-5 w-5" />} onClick={() => setNewQ(true)}>سؤال جديد</Button>
          </div>
        </div>
        {items.length === 0 && <p className="rounded-xl bg-ivory-100 p-4 text-brand-700">يمكنك إنشاء الحصة الآن وإضافة الأسئلة أثناءها، أو اختيار أسئلة من البنك مسبقًا.</p>}
        <div className="space-y-2">
          {items.map((it, i) => (
            <div key={it.q.id} className="grid gap-2 rounded-xl border border-brand-100 p-3 md:grid-cols-[auto_1fr_auto] md:items-center">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700 font-bold text-white">{i + 1}</span>
              <div className="min-w-0">
                <div className="line-clamp-2 font-semibold">{it.q.text}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                  <Badge>{typeLabel(it.q.type)}</Badge>
                  <label className="flex items-center gap-1">الزمن
                    <Input type="number" min={3} max={3600} className="h-8 w-20 px-2 py-1 text-sm" value={it.game === 'five_seconds' ? '5' : it.time} disabled={it.game === 'five_seconds'}
                      onChange={(e) => setItems((l) => l.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)))} placeholder="∞" aria-label="الزمن بالثواني" /> ث
                  </label>
                  <Select className="h-8 w-auto px-2 py-0 text-sm" value={it.game} onChange={(e) => setItems((l) => l.map((x, j) => (j === i ? { ...x, game: e.target.value as GameMode } : x)))} aria-label="وضع اللعبة">
                    {GAME_MODES.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                  </Select>
                  <label className="flex items-center gap-1"><input type="checkbox" className="h-4 w-4 accent-brand-700" checked={it.retry} onChange={(e) => setItems((l) => l.map((x, j) => (j === i ? { ...x, retry: e.target.checked } : x)))} />السماح بتغيير الإجابة</label>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => move(i, -1)} className="rounded-lg p-2 hover:bg-brand-50" aria-label="أعلى"><ArrowUp className="h-4 w-4" /></button>
                <button onClick={() => move(i, 1)} className="rounded-lg p-2 hover:bg-brand-50" aria-label="أسفل"><ArrowDown className="h-4 w-4" /></button>
                <button onClick={() => setItems((l) => l.filter((_, j) => j !== i))} className="rounded-lg p-2 text-red-600 hover:bg-red-50" aria-label="إزالة"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="space-y-1">
        <h2 className="text-lg font-bold">3. الخصوصية والعرض</h2>
        <Toggle checked={form.anonymous} onChange={(v) => set('anonymous', v)} label="إجابات مجهولة الهوية" hint="لا يُطلب من الطلاب كتابة أسمائهم؛ يحصل كل طالب على اسم مستعار" />
        <Toggle checked={form.hide_names} onChange={(v) => set('hide_names', v)} label="إخفاء الأسماء على شاشة العرض" hint="تظهر الأسماء المستعارة فقط على الشاشة العامة" />
        <Toggle checked={form.hide_results} onChange={(v) => set('hide_results', v)} label="إخفاء النتائج على شاشة العرض حتى إغلاق السؤال" />
        <Toggle checked={form.auto_approve_open} onChange={(v) => set('auto_approve_open', v)} label="عرض الإجابات المفتوحة تلقائيًا" hint="الأفضل تركه مغلقًا لمراجعة الإجابات قبل عرضها" />
        <Toggle checked={form.leaderboard_enabled} onChange={(v) => set('leaderboard_enabled', v)} label="النقاط والترتيب التنافسي (اختياري)" />
        <Toggle checked={form.teams_enabled} onChange={(v) => set('teams_enabled', v)} label="تحدي الفرق" hint="يختار الطالب فريقه عند الانضمام أو يُوزّع تلقائيًا" />
        {form.teams_enabled && (
          <div className="space-y-2 rounded-xl bg-ivory-100 p-3">
            {teams.map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                <Users className="h-5 w-5" style={{ color: TEAM_COLORS[i % TEAM_COLORS.length] }} />
                <Input value={t} onChange={(e) => setTeams((l) => l.map((x, j) => (j === i ? e.target.value : x)))} maxLength={40} />
                {teams.length > 2 && <button onClick={() => setTeams((l) => l.filter((_, j) => j !== i))} className="p-2 text-red-600" aria-label="حذف الفريق"><Trash2 className="h-4 w-4" /></button>}
              </div>
            ))}
            {teams.length < 6 && <Button size="sm" variant="soft" onClick={() => setTeams((l) => [...l, `الفريق ${l.length + 1}`])}>فريق آخر</Button>}
          </div>
        )}
      </Card>

      {error && <ErrorBox error={error} />}
      <div className="sticky bottom-20 z-10 flex justify-end rounded-2xl bg-white/90 p-2 shadow-card backdrop-blur lg:bottom-4">
        <Button size="lg" icon={<PlayCircle className="h-6 w-6" />} loading={creating} onClick={create}>إنشاء الحصة والحصول على الرمز</Button>
      </div>

      <QuestionPicker open={picker} onClose={() => setPicker(false)} exclude={items.map((i) => i.q.id)} onPick={(qs) => setItems((l) => [...l, ...qs.map(toItem)])} />
      <Modal open={newQ} onClose={() => setNewQ(false)} title="سؤال جديد" wide>
        <QuestionForm compact onCancel={() => setNewQ(false)} onSaved={async (id) => { setNewQ(false); try { const q = await getQuestion(id); setItems((l) => [...l, toItem(q)]); } catch (e) { setError(toAppError(e).message); } }} />
      </Modal>
    </div>
  );
}
