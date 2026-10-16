// التحدي الذاتي: الطالب يدخل الموقع، يختار الدرس، ويبدأ فورًا وحده أو مع زملائه دون رمز ولا تدخل المعلم
import { useEffect, useRef, useState, type FormEvent } from 'react';
import HomeButton from '@/components/HomeButton';
import { useNavigate, useParams } from 'react-router-dom';
import { Bot, Loader2, RefreshCw, Trophy, User, Users } from 'lucide-react';
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
import { CATEGORY_EMOJI } from '@/lib/constants';

const NAME_KEY = 'nabd.practice-name';
const readName = () => { try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; } };

export default function Practice() {
  const params = useParams();
  const nav = useNavigate();
  const [code, setCode] = useState(params.code ?? lastPracticeCode() ?? '');
  const [data, setData] = useState<PracticePreview | null>(null);
  const [lesson, setLesson] = useState('');
  // «أكثر من درس»: يحدد الطالب الدروس ثم يبدأ منافسة واحدة تخلط أسئلتها
  const [multi, setMulti] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState(readName);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // وحدي، أو ضد الكمبيوتر، أو مع زملائي
  const [mode, setMode] = useState<'solo' | 'computer' | 'friends'>('solo');
  // الأقسام: دروس المنهج أو الأسئلة العامة
  const [tab, setTab] = useState<'curriculum' | 'general'>('curriculum');
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

  // الاسم إجباري في كل التحديات
  const nameRef = useRef<HTMLInputElement>(null);
  const nameOk = name.trim().length >= 2;
  const needName = () => {
    if (nameOk) return false;
    setError('اكتب اسمك أولًا (حرفان على الأقل)');
    nameRef.current?.focus();
    return true;
  };
  const playerName = () => name.trim();

  // الضغط على الدرس يبدأ التحدي مباشرة، وفي «أكثر من درس» يحدده فقط
  const tapLesson = (l: string) => {
    if (!multi) return void start([l]);
    setPicked((cur) => cur.includes(l) ? cur.filter((x) => x !== l) : [...cur, l]);
  };
  const start = async (pick: string[]) => {
    if (needName()) return;
    const key = pick.length === 1 ? pick[0] : 'many';
    setLesson(key);
    setBusy(key); setError(null);
    try {
      const r = await practice.startMany(code, pick, playerName(), mode !== 'solo');
      if (!r.ok) return setError(messageFor(r.error));
      if (mode === 'computer') {
        const c = await practice.vsComputer(r.participant_id, r.token);
        if (!c.ok) return setError(messageFor(c.error));
      }
      await enter(r);
    } catch (e) { setError(toAppError(e).message); }
    finally { setBusy(null); }
  };

  const joinRoom = async (roomCode: string) => {
    if (needName()) return;
    setBusy(roomCode); setError(null);
    try {
      const r = await student.join(roomCode, playerName(), null);
      if (!r.ok) { setError(messageFor(r.error)); void load(code); } else await enter(r);
    } catch (e) { setError(toAppError(e).message); }
    finally { setBusy(null); }
  };

  const curriculum = data?.lessons.filter((l) => !l.general) ?? [];
  const general = data?.lessons.filter((l) => l.general) ?? [];
  const shownTab = curriculum.length === 0 ? 'general' : general.length === 0 ? 'curriculum' : tab;
  const shown = shownTab === 'general' ? general : curriculum;

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
        <div className="flex items-center justify-between gap-2">
          <HomeButton />
          <div className="animate-bounceIn rounded-2xl bg-white px-3 py-2 shadow-xl"><Brand /></div>
          <span className="w-10 sm:w-24" aria-hidden />
        </div>
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
              <Field label="اسمك" hint="مطلوب ليظهر في الترتيب وعند المعلم"><Input ref={nameRef} value={name} onChange={(e) => { setName(e.target.value); setError(null); }} maxLength={40} autoComplete="name" className="text-lg" placeholder="اكتب اسمك" required aria-invalid={!!error && !nameOk} /></Field>
              <AvatarPicker value={avatar} onChange={setAvatar} />
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="طريقة اللعب">
                {([['solo', 'وحدي', User], ['computer', 'ضد الكمبيوتر', Bot], ['friends', 'مع زملائي', Users]] as const).map(([v, label, Icon]) => (
                  <button key={label} type="button" role="radio" aria-checked={mode === v} onClick={() => setMode(v)}
                    className={cx('flex flex-col items-center justify-center gap-1 rounded-xl border-2 p-2.5 text-sm font-bold transition sm:flex-row sm:gap-2 sm:text-base', mode === v ? 'border-transparent bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white shadow-lg' : 'border-purple-200 text-purple-800 hover:bg-purple-50')}>
                    <Icon className="h-5 w-5" />{label}
                  </button>
                ))}
              </div>
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="font-bold text-purple-800">{multi ? '👇 حدد الدروس ثم اضغط «ابدأ»' : '👇 اضغط على الدرس ليبدأ التحدي'}</div>
                  {data.lessons.length > 1 && (
                    <button type="button" role="switch" aria-checked={multi} onClick={() => { setMulti((m) => !m); setPicked([]); }} data-testid="multi-lessons"
                      className={cx('rounded-full border-2 px-3 py-1 text-sm font-bold transition', multi ? 'border-transparent bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow' : 'border-purple-200 text-purple-800 hover:bg-purple-50')}>
                      🧩 أكثر من درس
                    </button>
                  )}
                </div>
                {curriculum.length > 0 && general.length > 0 && (
                  <div className="mb-3 grid grid-cols-2 gap-1 rounded-2xl bg-brand-50 p-1" role="tablist" aria-label="الأقسام">
                    {([['curriculum', '📚 المنهج', curriculum.length], ['general', '🌍 أسئلة عامة', general.length]] as const).map(([v, label]) => (
                      <button key={v} type="button" role="tab" aria-selected={shownTab === v} onClick={() => setTab(v)} data-testid={`tab-${v}`}
                        className={cx('rounded-xl py-2 font-extrabold transition', shownTab === v ? 'bg-white text-brand-800 shadow' : 'text-brand-600 hover:bg-white/60')}>{label}</button>
                    ))}
                  </div>
                )}
                {data.lessons.length === 0 ? <p className="rounded-xl bg-ivory-100 p-3 text-brand-700">لا توجد دروس جاهزة بعد. اطلب من معلمك إضافة أسئلة للدروس.</p> : (
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" aria-label="الدروس">
                    {shown.map((l, i) => (
                      <button key={l.lesson} type="button" disabled={!!busy} onClick={() => tapLesson(l.lesson)} data-testid="lesson"
                        aria-pressed={multi ? picked.includes(l.lesson) : undefined}
                        style={{ animationDelay: `${i * 60}ms` }}
                        className={cx('group flex animate-bounceIn items-center [animation-fill-mode:both] justify-between gap-2 rounded-2xl bg-gradient-to-br p-3 text-start font-extrabold text-white shadow-lg ring-2 ring-white/40 transition hover:-translate-y-1 hover:scale-[1.03] hover:shadow-2xl disabled:opacity-60', VIVID[i % VIVID.length], lesson === l.lesson && busy && 'ring-4 ring-yellow-300', multi && picked.includes(l.lesson) && 'ring-4 ring-yellow-300', multi && !picked.includes(l.lesson) && 'opacity-80')}>
                        <span className="flex items-center gap-2 drop-shadow"><span className="text-2xl transition group-hover:animate-wiggle">{multi ? (picked.includes(l.lesson) ? '✅' : '⬜') : (l.general && CATEGORY_EMOJI[l.lesson]) || LESSON_EMOJI[i % LESSON_EMOJI.length]}</span>{l.lesson}</span>
                        {busy === l.lesson ? <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-label="جارٍ البدء" /> : <span className="shrink-0 rounded-full bg-white/25 px-2 py-0.5 text-xs font-bold">{l.count} سؤال</span>}
                      </button>
                    ))}
                  </div>
                )}
                {multi && (
                  <Button size="lg" variant="gold" className="mt-3 w-full" disabled={picked.length < 2 || !!busy} loading={busy === 'many'}
                    onClick={() => start(picked)} data-testid="start-many">
                    {picked.length < 2 ? 'حدد درسين على الأقل' : picked.length === 2 ? 'ابدأ المنافسة بدرسين' : `ابدأ المنافسة بـ ${picked.length} دروس`}
                  </Button>
                )}
              </div>
              {error && <ErrorBox error={error} />}
            </Card>

            <Card className="animate-bounceIn space-y-2 p-5 shadow-2xl">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-extrabold">⚔️ زملاء ينتظرون منافسًا</h2>
                <button type="button" onClick={() => load(code, true)} className="flex items-center gap-1 text-sm font-semibold text-brand-700 underline"><RefreshCw className="h-4 w-4" />تحديث</button>
              </div>
              {data.rooms.length === 0 ? <p className="text-brand-600">لا يوجد أحد الآن. نافس الكمبيوتر، أو اختر «مع زملائي» ليظهر تحديك لزملائك.</p> : data.rooms.map((r) => (
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
