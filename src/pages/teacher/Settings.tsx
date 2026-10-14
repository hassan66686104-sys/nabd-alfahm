import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Card, ErrorBox, Field, Input, PageHeader, Toggle } from '@/components/ui';
import { useFeedback } from '@/components/feedback';
import { useAuth } from '@/hooks/useAuth';
import { classes as classesApi, subjects as subjectsApi, updateProfile } from '@/lib/api';
import { toAppError } from '@/lib/errors';
import { settingsSchema, firstError } from '@/lib/schemas';
import { DEFAULT_SETTINGS, DEFAULT_SUBJECTS } from '@/lib/constants';
import type { ClassGroup, Subject } from '@/lib/types';

export default function Settings() {
  const { profile, refreshProfile } = useAuth();
  const { toast, confirm } = useFeedback();
  const s = profile?.settings ?? DEFAULT_SETTINGS;
  const [name, setName] = useState(profile?.full_name ?? '');
  const [school, setSchool] = useState(profile?.school ?? '');
  const [mastery, setMastery] = useState(String(s.mastery));
  const [reinforce, setReinforce] = useState(String(s.reinforce));
  const [defTime, setDefTime] = useState(s.default_time ? String(s.default_time) : '');
  const [hideNames, setHideNames] = useState(s.hide_names);
  const [anon, setAnon] = useState(s.anonymous);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classList, setClassList] = useState<ClassGroup[]>([]);
  const [newSubject, setNewSubject] = useState('');
  const [newClass, setNewClass] = useState('');

  useEffect(() => {
    if (!profile) return;
    setName(profile.full_name); setSchool(profile.school);
    setMastery(String(profile.settings.mastery)); setReinforce(String(profile.settings.reinforce));
    setDefTime(profile.settings.default_time ? String(profile.settings.default_time) : '');
    setHideNames(profile.settings.hide_names); setAnon(profile.settings.anonymous);
  }, [profile]);
  const loadLists = () => { subjectsApi.list().then(setSubjects).catch(() => {}); classesApi.list().then(setClassList).catch(() => {}); };
  useEffect(loadLists, []);

  const save = async () => {
    setError(null);
    const parsed = settingsSchema.safeParse({ mastery, reinforce, default_time: defTime ? defTime : null, hide_names: hideNames, anonymous: anon });
    if (!parsed.success) return setError(firstError(parsed.error));
    if (!profile) return;
    setSaving(true);
    try {
      await updateProfile(profile.id, { full_name: name.trim(), school: school.trim(), settings: parsed.data });
      await refreshProfile();
      toast('حُفظت الإعدادات');
    } catch (e) { setError(toAppError(e).message); } finally { setSaving(false); }
  };

  const run = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast(ok); loadLists(); } catch (e) { toast(toAppError(e).message, 'error'); } };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="الإعدادات" />
      <Card className="space-y-3">
        <h2 className="text-lg font-extrabold">الملف الشخصي</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="الاسم"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="المدرسة"><Input value={school} onChange={(e) => setSchool(e.target.value)} /></Field>
        </div>
      </Card>
      <Card className="space-y-3">
        <h2 className="text-lg font-extrabold">حدود مؤشرات الفهم</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="الإتقان (أخضر) من" hint="نسبة الإجابات الصحيحة %"><Input type="number" min={1} max={100} value={mastery} onChange={(e) => setMastery(e.target.value)} /></Field>
          <Field label="التعزيز (أصفر) من" hint="وما دونه يحتاج إلى معالجة (أحمر)"><Input type="number" min={0} max={99} value={reinforce} onChange={(e) => setReinforce(e.target.value)} /></Field>
        </div>
        <div className="flex h-4 overflow-hidden rounded-full text-[10px]">
          <div className="bg-red-600" style={{ width: `${Number(reinforce) || 0}%` }} />
          <div className="bg-amber-500" style={{ width: `${Math.max(0, (Number(mastery) || 0) - (Number(reinforce) || 0))}%` }} />
          <div className="flex-1 bg-green-600" />
        </div>
        <h2 className="pt-2 text-lg font-extrabold">الإعدادات الافتراضية للحصص</h2>
        <Field label="زمن السؤال الافتراضي (ثانية)" hint="اتركه فارغًا لأسئلة بلا مؤقت"><Input type="number" min={5} max={3600} value={defTime} onChange={(e) => setDefTime(e.target.value)} /></Field>
        <Toggle checked={anon} onChange={setAnon} label="الحصص مجهولة الهوية افتراضيًا" />
        <Toggle checked={hideNames} onChange={setHideNames} label="إخفاء الأسماء على شاشة العرض افتراضيًا" />
        {error && <ErrorBox error={error} />}
        <Button loading={saving} onClick={save}>حفظ الإعدادات</Button>
      </Card>
      <Card className="space-y-3">
        <h2 className="text-lg font-extrabold">المواد</h2>
        <div className="flex flex-wrap gap-2">
          {subjects.map((x) => (
            <span key={x.id} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1">{x.name}
              <button aria-label={`حذف ${x.name}`} onClick={async () => { if (await confirm({ title: `حذف مادة «${x.name}»؟`, body: 'لن تُحذف الأسئلة، بل تُزال عنها المادة فقط.', danger: true, confirmText: 'حذف' })) void run(() => subjectsApi.remove(x.id), 'حُذفت المادة'); }}><Trash2 className="h-3.5 w-3.5 text-red-600" /></button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <Input value={newSubject} onChange={(e) => setNewSubject(e.target.value)} placeholder="مادة جديدة" />
          <Button icon={<Plus className="h-4 w-4" />} disabled={!newSubject.trim()} onClick={() => run(async () => { await subjectsApi.create(newSubject); setNewSubject(''); }, 'أضيفت المادة')}>إضافة</Button>
        </div>
        {subjects.length === 0 && <Button variant="soft" onClick={() => run(async () => { for (const n of DEFAULT_SUBJECTS) await subjectsApi.create(n).catch(() => {}); }, 'أضيفت المواد الأساسية')}>إضافة المواد الأساسية (التربية الإسلامية، العربية، …)</Button>}
      </Card>
      <Card className="space-y-3">
        <h2 className="text-lg font-extrabold">الصفوف والمجموعات</h2>
        <div className="flex flex-wrap gap-2">
          {classList.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1 rounded-full bg-gold-50 px-3 py-1">{c.name}
              <button aria-label={`حذف ${c.name}`} onClick={async () => { if (await confirm({ title: `حذف «${c.name}»؟`, body: 'تبقى الحصص وتقاريرها، لكن تُزال عنها هذه المجموعة.', danger: true, confirmText: 'حذف' })) void run(() => classesApi.remove(c.id), 'حُذف الصف'); }}><Trash2 className="h-3.5 w-3.5 text-red-600" /></button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <Input value={newClass} onChange={(e) => setNewClass(e.target.value)} placeholder="مثال: الخامس / أ" />
          <Button icon={<Plus className="h-4 w-4" />} disabled={!newClass.trim()} onClick={() => run(async () => { await classesApi.create(newClass, ''); setNewClass(''); }, 'أضيف الصف')}>إضافة</Button>
        </div>
      </Card>
    </div>
  );
}
