// التحدي الذاتي: الطالب يدخل الموقع، يختار الدرس، ويبدأ فورًا وحده أو مع زملائه دون رمز ولا تدخل المعلم
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, RefreshCw, Trophy, User, Users } from 'lucide-react';
import { Brand, Credit } from '@/components/Logo';
import { Button, Card, ErrorBox, Field, Input, Spinner, cx } from '@/components/ui';
import { OfflineBanner } from '@/components/feedback';
import { FunBackdrop, LESSON_EMOJI, VIVID } from '@/components/fun';
import { AvatarPicker } from '@/components/Avatar';
import { saveAvatar, savedAvatar } from '@/lib/avatars';
import { game, practice, student, type PracticePreview, type PublicPractice } from '@/lib/api';
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
  const [withFriends, setWithFriends] = useState(false);
  const [avatar, setAvatar] = useState<string>(savedAvatar() ?? 'lion');
  // المعلمون الذين جعلوا تحدياتهم متاحة بدون رمز
  const [teachers, setTeachers] = useState<PublicPractice[] | null>(null);
  const [askCode, setAskCode] = useState(false);

  const load = async (raw: string, silent = false) => {
    const c = raw.trim();
    if (c.length < 4) return setError('اكتب رمز التحديات الذي أعطاك إياه المعلم');
    setBusy('lookup'); setError(null);
    try {
      const r = await practice.lookup(c);
      if (!r.ok) { setData(null); setError(messageFor(r.error)); }
      else { setData(r); setCode(c.toUpperCase()); if (!params.code && !silent) nav(`/practice/${c.toUpperCase()}`, { replace: true }); }
    } catch (e) { setError(toAppError(e).message); }
    finally { setBusy(null); }
  };
  useEffect(() => {
    if (params.code) { void load(params.code); return; }
    // بدون رمز: تظهر دروس المعلم مباشرة، وإن تعدد المعلمون يختار الطالب معلمه أولًا
    setBusy('lookup');
    practice.publicList()
      .then((list) => { setTeachers(list); if (list.length === 1) void load(list[0].code, true); else setBusy(null); })
      .catch(() => { setTeachers([]); setBusy(null); });
  }, [params.code]); // eslint-disable-line react-hooks/exhaustive-deps
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

  const enter = async (r: { participant_id: string; token: string; session_id: string; code: string; alias: string; display_name: string }) => {
    try { localStorage.setItem(NAME_KEY, name.trim()); } catch { /* التخزين غير متاح */ }
    rememberPracticeCode(code);
    saveAvatar(avatar);
    participantStore.clear();
    participantStore.set({ ...r, avatar });
    await game.setAvatar(r.participant_id, r.token, avatar).catch(() => {});
    nav('/play');
  };

  // الاسم اختياري: من لا يكتب اسمه يلعب باسم «بطل»
  const playerName = () => (name.trim().length >= 2 ? name.trim() : 'بطل');

  // الضغط على الدرس يبدأ التحدي مباشرة
  const start = async (pick: string) => {
    setLesson(pick);
    setBusy(pick); setError(null);
    try {
      const r = await practice.start(code, pick, playerName(), withFriends);
      if (!r.ok) setError(messageFor(r.error)); else await enter(r);
    } catch (e) { setError(toAppError(e).message); }
    finally { setBusy(null); }
  };

  const joinRoom = async (roomCode: string) => {
    setBusy(roomCode); setError(null);
    try {
      const r = await student.join(roomCode, playerName(), null);
      if (!r.ok) { setError(messageFor(r.error)); void load(code); } else await enter(r);
    } catch (e) { setError(toAppError(e).message); }
    finally { setBusy(null); }
  };

  const codeForm = (
    <form className="space-y-4" onSubmit={(e: FormEvent) => { e.preventDefault(); void load(code); }}>
      <Field label="رمز التحديات" hint="يعطيك إياه معلمك مرة واحدة">
        <Input value={code} onChange={(e) => setCode(e.target.value)} dir="ltr" autoCapitalize="characters" autoComplete="off"
          className="text-center text-3xl font-extrabold uppercase tracking-[.35em]" maxLength={10} placeholder="ABC123" autoFocus />
      </Field>
      {error && <ErrorBox error={error} />}
      <Button type="submit" size="lg" className="w-full" loading={busy === 'lookup'}>متابعة</Button>
    </form>
  );
  const title = (
    <h1 className="flex items-center gap-2 text-3xl font-black">
      <Trophy className="h-9 w-9 text-yellow-400 motion-safe:animate-bounce motion-safe:[animation-duration:1.8s]" style={{ filter: 'drop-shadow(0 0 10px rgba(250,204,21,.9))' }} />
      <span className="bg-gradient-to-l from-fuchsia-600 via-orange-500 to-purple-700 bg-clip-text text-transparent">تحدي الكأس</span>
    </h1>
  );

  return (
    <FunBackdrop>
      <OfflineBanner />
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-8 lg:max-w-none lg:px-8">
        <div className="mx-auto animate-bounceIn rounded-2xl bg-white px-3 py-2 shadow-xl"><Brand /></div>
        {!data ? (
          <Card className="mx-auto w-full max-w-xl animate-bounceIn space-y-4 p-6 shadow-2xl">
            {title}
            {teachers === null || (busy === 'lookup' && !askCode) ? <Spinner /> : teachers.length > 1 && !askCode ? (
              <>
                <p className="text-brand-700">اختر معلمك لترى دروسه.</p>
                <div className="grid gap-2" data-testid="public-teachers">
                  {teachers.map((t) => (
                    <Button key={t.code} size="lg" variant="soft" className="w-full justify-start" onClick={() => load(t.code, true)}>{t.teacher}</Button>
                  ))}
                </div>
                {error && <ErrorBox error={error} />}
                <button type="button" onClick={() => setAskCode(true)} className="text-sm font-semibold text-brand-700 underline">لديك رمز من معلمك؟</button>
              </>
            ) : (
              <>
                <p className="text-brand-700">اختر درسًا والعب وحدك أو مع زملائك متى شئت.</p>
                {codeForm}
              </>
            )}
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
            <Card className="animate-bounceIn space-y-4 p-5 shadow-2xl">
              <div>
                <div className="text-sm text-brand-600">تحديات {data.teacher}</div>
                {title}
              </div>
              <Field label="اسمك (اختياري)"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="name" className="text-lg" placeholder="بطل" /></Field>
              <AvatarPicker value={avatar} onChange={setAvatar} />
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="طريقة اللعب">
                {([[false, 'وحدي', User], [true, 'مع زملائي', Users]] as const).map(([v, label, Icon]) => (
                  <button key={label} type="button" role="radio" aria-checked={withFriends === v} onClick={() => setWithFriends(v)}
                    className={cx('flex items-center justify-center gap-2 rounded-xl border-2 p-2.5 font-bold transition', withFriends === v ? 'border-transparent bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-lg' : 'border-purple-200 text-purple-800 hover:bg-purple-50')}>
                    <Icon className="h-5 w-5" />{label}
                  </button>
                ))}
              </div>
              <div>
                <div className="mb-2 font-bold text-purple-800">👇 اضغط على الدرس ليبدأ التحدي</div>
                {data.lessons.length === 0 ? <p className="rounded-xl bg-ivory-100 p-3 text-brand-700">لا توجد دروس جاهزة بعد. اطلب من معلمك إضافة أسئلة للدروس.</p> : (
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" aria-label="الدروس">
                    {data.lessons.map((l, i) => (
                      <button key={l.lesson} type="button" disabled={!!busy} onClick={() => start(l.lesson)} data-testid="lesson"
                        style={{ animationDelay: `${i * 60}ms` }}
                        className={cx('group flex animate-bounceIn items-center [animation-fill-mode:both] justify-between gap-2 rounded-2xl bg-gradient-to-br p-3 text-start font-extrabold text-white shadow-lg ring-2 ring-white/40 transition hover:-translate-y-1 hover:scale-[1.03] hover:shadow-2xl disabled:opacity-60', VIVID[i % VIVID.length], lesson === l.lesson && busy && 'ring-4 ring-yellow-300')}>
                        <span className="flex items-center gap-2 drop-shadow"><span className="text-2xl transition group-hover:animate-wiggle">{LESSON_EMOJI[i % LESSON_EMOJI.length]}</span>{l.lesson}</span>
                        {busy === l.lesson ? <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-label="جارٍ البدء" /> : <span className="shrink-0 rounded-full bg-white/25 px-2 py-0.5 text-xs font-bold">{l.count} سؤال</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {error && <ErrorBox error={error} />}
              {withFriends && <p className="text-sm text-brand-600">«مع زملائي» ينشئ غرفة برمز؛ تظهر لزملائك المتصلين هنا، أو تعطيهم الرمز، وتبدأ أنت عندما يدخلون.</p>}
            </Card>

            <Card className="animate-bounceIn space-y-2 p-5 shadow-2xl">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-extrabold">⚔️ زملاء ينتظرون منافسًا</h2>
                <button type="button" onClick={() => load(code, true)} className="flex items-center gap-1 text-sm font-semibold text-brand-700 underline"><RefreshCw className="h-4 w-4" />تحديث</button>
              </div>
              {data.rooms.length === 0 ? <p className="text-brand-600">لا يوجد أحد الآن. اختر «مع زملائي» ثم الدرس، وسيظهر تحديك لزملائك.</p> : data.rooms.map((r) => (
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
    </FunBackdrop>
  );
}
