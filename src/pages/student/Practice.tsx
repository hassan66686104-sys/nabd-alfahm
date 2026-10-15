// التحدي الذاتي: الطالب يدخل رابط معلمه، يختار الدرس، ويبدأ وحده أو مع زملائه دون تدخل المعلم
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BookOpen, RefreshCw, Trophy, User, Users } from 'lucide-react';
import { Brand, Credit } from '@/components/Logo';
import { Badge, Button, Card, ErrorBox, Field, Input, Spinner, cx } from '@/components/ui';
import { OfflineBanner } from '@/components/feedback';
import { practice, student, type PracticePreview } from '@/lib/api';
import { messageFor, toAppError } from '@/lib/errors';
import { participantStore } from '@/hooks/useStudent';
import { lastPracticeCode, rememberPracticeCode } from '@/lib/game';

const NAME_KEY = 'nabd.practice-name';
const readName = () => { try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; } };

export default function Practice() {
  const params = useParams();
  const nav = useNavigate();
  const [code, setCode] = useState(params.code ?? lastPracticeCode() ?? '');
  const [data, setData] = useState<PracticePreview | null>(null);
  const [lesson, setLesson] = useState('');
  const [name, setName] = useState(readName);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async (raw: string) => {
    const c = raw.trim();
    if (c.length < 4) return setError('اكتب رمز التحديات الذي أعطاك إياه المعلم');
    setBusy('lookup'); setError(null);
    try {
      const r = await practice.lookup(c);
      if (!r.ok) { setData(null); setError(messageFor(r.error)); }
      else { setData(r); setCode(c.toUpperCase()); if (!params.code) nav(`/practice/${c.toUpperCase()}`, { replace: true }); }
    } catch (e) { setError(toAppError(e).message); }
    finally { setBusy(null); }
  };
  useEffect(() => { if (params.code) void load(params.code); }, [params.code]); // eslint-disable-line react-hooks/exhaustive-deps
  // تحديث قائمة الزملاء المنتظرين تلقائيًا
  const loaded = !!data;
  useEffect(() => {
    if (!loaded) return;
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible' || !navigator.onLine) return;
      practice.lookup(code).then((r) => { if (r.ok) setData(r); }).catch(() => {});
    }, 5000);
    return () => clearInterval(id);
  }, [loaded, code]);

  const enter = (r: { participant_id: string; token: string; session_id: string; code: string; alias: string; display_name: string }) => {
    try { localStorage.setItem(NAME_KEY, name.trim()); } catch { /* التخزين غير متاح */ }
    rememberPracticeCode(code);
    participantStore.clear();
    participantStore.set(r);
    nav('/play');
  };

  const checkName = () => {
    if (name.trim().length < 2) { setError(messageFor('NAME_REQUIRED')); return false; }
    return true;
  };

  const start = async (withFriends: boolean) => {
    if (!lesson) return setError('اختر الدرس أولًا');
    if (!checkName()) return;
    setBusy(withFriends ? 'friends' : 'solo'); setError(null);
    try {
      const r = await practice.start(code, lesson, name.trim(), withFriends);
      if (!r.ok) setError(messageFor(r.error)); else enter(r);
    } catch (e) { setError(toAppError(e).message); }
    finally { setBusy(null); }
  };

  const joinRoom = async (roomCode: string) => {
    if (!checkName()) return;
    setBusy(roomCode); setError(null);
    try {
      const r = await student.join(roomCode, name.trim(), null);
      if (!r.ok) { setError(messageFor(r.error)); void load(code); } else enter(r);
    } catch (e) { setError(toAppError(e).message); }
    finally { setBusy(null); }
  };

  return (
    <div className="min-h-dvh bg-gradient-to-b from-brand-700 to-brand-900">
      <OfflineBanner />
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-8 lg:max-w-none lg:px-8">
        <div className="mx-auto rounded-2xl bg-white px-3 py-2"><Brand /></div>
        {!data ? (
          <Card className="mx-auto w-full max-w-xl space-y-4 p-6">
            <form className="space-y-4" onSubmit={(e: FormEvent) => { e.preventDefault(); void load(code); }}>
              <h1 className="flex items-center gap-2 text-2xl font-extrabold"><Trophy className="h-7 w-7 text-gold-400" />تحدي الكأس</h1>
              <p className="text-brand-700">اختر درسًا والعب وحدك أو مع زملائك متى شئت.</p>
              <Field label="رمز التحديات" hint="يعطيك إياه معلمك مرة واحدة">
                <Input value={code} onChange={(e) => setCode(e.target.value)} dir="ltr" autoCapitalize="characters" autoComplete="off"
                  className="text-center text-3xl font-extrabold uppercase tracking-[.35em]" maxLength={10} placeholder="ABC123" autoFocus />
              </Field>
              {error && <ErrorBox error={error} />}
              <Button type="submit" size="lg" className="w-full" loading={busy === 'lookup'}>متابعة</Button>
            </form>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
            <Card className="space-y-4 p-5">
              <div>
                <div className="text-sm text-brand-600">تحديات {data.teacher}</div>
                <h1 className="flex items-center gap-2 text-2xl font-extrabold"><Trophy className="h-7 w-7 text-gold-400" />تحدي الكأس</h1>
              </div>
              <Field label="اسمك"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="name" className="text-lg" /></Field>
              <div>
                <div className="mb-2 font-semibold text-brand-800">اختر الدرس</div>
                {data.lessons.length === 0 ? <p className="rounded-xl bg-ivory-100 p-3 text-brand-700">لا توجد دروس جاهزة بعد. اطلب من معلمك إضافة أسئلة للدروس.</p> : (
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label="الدروس">
                    {data.lessons.map((l) => (
                      <button key={l.lesson} type="button" role="radio" aria-checked={lesson === l.lesson} onClick={() => setLesson(l.lesson)}
                        className={cx('flex items-center justify-between rounded-xl border-2 p-3 text-start font-bold', lesson === l.lesson ? 'border-gold-400 bg-gold-50' : 'border-brand-100 hover:border-brand-300')}>
                        <span className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-brand-600" />{l.lesson}</span>
                        <Badge tone="gray">{l.count} سؤال</Badge>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {error && <ErrorBox error={error} />}
              <div className="grid gap-2 sm:grid-cols-2">
                <Button size="lg" icon={<User className="h-5 w-5" />} disabled={!lesson} loading={busy === 'solo'} onClick={() => start(false)}>العب وحدك</Button>
                <Button size="lg" variant="gold" icon={<Users className="h-5 w-5" />} disabled={!lesson} loading={busy === 'friends'} onClick={() => start(true)}>تحدَّ زملاءك</Button>
              </div>
              <p className="text-sm text-brand-600">«تحدَّ زملاءك» ينشئ غرفة برمز؛ يظهر لزملائك المتصلين هنا، أو تعطيهم الرمز، وتبدأ أنت عندما يدخلون.</p>
            </Card>

            <Card className="space-y-2 p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-extrabold">زملاء ينتظرون منافسًا</h2>
                <button type="button" onClick={() => load(code)} className="flex items-center gap-1 text-sm font-semibold text-brand-700 underline"><RefreshCw className="h-4 w-4" />تحديث</button>
              </div>
              {busy === 'lookup' && <Spinner />}
              {data.rooms.length === 0 ? <p className="text-brand-600">لا يوجد أحد الآن. أنشئ تحديًا وسيظهر لزملائك.</p> : data.rooms.map((r) => (
                <div key={r.code} className="flex items-center justify-between gap-2 rounded-xl border border-brand-100 p-3">
                  <div>
                    <div className="font-bold">{r.host ?? 'زميل'} · {r.lesson}</div>
                    <div className="text-sm text-brand-600">{r.players} في الغرفة · الرمز <span dir="ltr" className="font-mono">{r.code}</span></div>
                  </div>
                  <Button size="sm" variant="gold" loading={busy === r.code} onClick={() => joinRoom(r.code)}>انضم</Button>
                </div>
              ))}
            </Card>
          </div>
        )}
        <Credit light />
      </div>
    </div>
  );
}
