// «تحدي الكأس» من جهة الطالب: أسئلة متتالية دون انتظار المعلم، نقاط، رقم الحظ، وقدرات
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Dices, Flag, Loader2, Shield, Snowflake, Star, Timer, Trophy, XCircle, Zap } from 'lucide-react';
import { Logo, Credit } from '@/components/Logo';
import { Badge, Button, Card, ErrorBox, Modal, ProgressBar } from '@/components/ui';
import { OfflineBanner } from '@/components/feedback';
import SoundToggle from '@/components/SoundToggle';
import { AnswerInput, answerComplete, emptyAnswer } from '@/components/AnswerInput';
import { Hint, QuestionImage, QuestionText, Stimulus, useTick } from '@/components/QuestionView';
import { EventFeed, Leaderboard, Podium, TeamScores } from '@/components/challenge';
import { participantStore, type StoredParticipant } from '@/hooks/useStudent';
import { game, practice } from '@/lib/api';
import { lastPracticeCode } from '@/lib/game';
import { isNetworkError, messageFor, toAppError } from '@/lib/errors';
import { GAME_SOFT_ERRORS, LUCK, POWER_ACTION, formatClock, goalText, luckTable, powerNeedsTeam } from '@/lib/game';
import { sfx } from '@/lib/sound';
import { uuid } from '@/lib/uuid';
import type { Answer, GameRollResult, GameState, GameSubmitResult, StudentQuestion } from '@/lib/types';

type Shown = StudentQuestion & { total: number };
interface Feedback extends GameSubmitResult { sq_id: string }

export default function GamePlay({ p }: { p: StoredParticipant }) {
  const nav = useNavigate();
  const [gs, setGs] = useState<GameState | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [transient, setTransient] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [shown, setShown] = useState<Shown | null>(null);
  const [draft, setDraft] = useState<Answer>({});
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [roll, setRoll] = useState<GameRollResult | null>(null);
  const [rolling, setRolling] = useState(false);
  const [picking, setPicking] = useState(false);
  const [acting, setActing] = useState(false);
  const [beginning, setBeginning] = useState(false);
  const now = useTick(500, offset);
  const busy = useRef(false);
  const reqIds = useRef(new Map<string, string>());
  const lastEvent = useRef<number | null>(null);
  const prevStatus = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const t0 = Date.now();
    try {
      const r = await game.state(p.participant_id, p.token);
      if (!r.ok) {
        setFatal(messageFor(r.error));
        if (r.error === 'INVALID_PARTICIPANT' || r.error === 'REMOVED') participantStore.clear();
        return;
      }
      setGs(r);
      setTransient(null);
      setOffset(new Date(r.server_time).getTime() + (Date.now() - t0) / 2 - Date.now());
    } catch (e) {
      setTransient(isNetworkError(e) ? 'جارٍ إعادة الاتصال…' : toAppError(e).message);
    } finally {
      busy.current = false;
    }
  }, [p]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => { if (navigator.onLine) void refresh(); }, 2500);
    const vis = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('online', vis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', vis); window.removeEventListener('online', vis); };
  }, [refresh]);

  // السؤال المعروض لا يتغير أثناء عرض نتيجة الإجابة
  useEffect(() => {
    if (!gs || feedback || shown) return;
    if (gs.question) {
      const q = { ...gs.question, status: 'open' } as Shown;
      setShown(q);
      setDraft(emptyAnswer(q));
    }
  }, [gs, feedback, shown]);

  // أصوات وتنبيهات لما يحدث للطالب من زملائه، وبداية التحدي ونهايته
  useEffect(() => {
    if (!gs) return;
    const st = gs.session.status;
    if (prevStatus.current && prevStatus.current !== st) {
      if (st === 'live') sfx.start();
      if (st === 'ended') { if (gs.session.winner?.id === gs.me.id) sfx.win(); else sfx.streak(); }
    }
    prevStatus.current = st;
    const newest = gs.events[0]?.id ?? 0;
    if (lastEvent.current !== null) {
      const fresh = gs.events.filter((e) => e.id > lastEvent.current!).reverse();
      const myTeam = gs.teams.find((t) => t.mine)?.name;
      for (const e of fresh) {
        if (e.actor === gs.me.name) continue;
        if (e.target === gs.me.name && e.kind === 'take') { sfx.lose(); setNotice(`${e.actor} أخذ منك ${e.amount} نقاط!`); }
        else if (e.target === gs.me.name && e.kind === 'freeze') { sfx.freeze(); setNotice(`${e.actor} جمّدك 15 ثانية!`); }
        else if (e.target === gs.me.name && e.kind.startsWith('blocked_')) { sfx.shield(); setNotice(`درعك صدّ محاولة ${e.actor}!`); }
        else if (myTeam && e.team === myTeam && (e.kind === 'bomb' || e.kind === 'raid')) { sfx.bomb(); setNotice(e.kind === 'bomb' ? `${e.actor} قصف مجموعتك!` : `${e.actor} انتزع نقاطًا من مجموعتك!`); }
      }
    }
    lastEvent.current = newest;
  }, [gs]);

  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(null), 4000); return () => clearTimeout(t); }, [notice]);

  const next = useCallback(() => { setFeedback(null); setShown(null); void refresh(); }, [refresh]);
  // ينتقل الطالب إلى السؤال التالي تلقائيًا
  useEffect(() => {
    if (!feedback || roll || picking) return;
    const t = setTimeout(next, feedback.correct ? 1300 : 3200);
    return () => clearTimeout(t);
  }, [feedback, roll, picking, next]);

  if (fatal) {
    return (
      <Shell>
        <Card className="space-y-4 text-center">
          <XCircle className="mx-auto h-12 w-12 text-red-600" />
          <p className="text-lg">{fatal}</p>
          <Button onClick={() => { participantStore.clear(); nav('/join'); }}>الانضمام من جديد</Button>
        </Card>
      </Shell>
    );
  }
  if (!gs) return <Shell><div className="flex items-center justify-center gap-2 py-20 text-white"><Loader2 className="h-6 w-6 animate-spin" />{transient ?? 'جارٍ الاتصال بالتحدي…'}</div></Shell>;

  const g = gs.session.game;
  const me = gs.me;
  const target = g.end === 'target' ? g.target ?? 100 : null;
  const timeLeft = gs.session.ends_at ? new Date(gs.session.ends_at).getTime() - now : null;
  const frozenLeft = me.frozen_until ? new Date(me.frozen_until).getTime() - now : 0;
  const shieldLeft = me.shield_until ? new Date(me.shield_until).getTime() - now : 0;
  const powersOn = g.powers !== false;

  const submit = async () => {
    if (!shown) return;
    let rid = reqIds.current.get(shown.sq_id);
    if (!rid) { rid = uuid(); reqIds.current.set(shown.sq_id, rid); }
    setSending(true); setTransient(null);
    try {
      const r = await game.submit(p.participant_id, p.token, shown.sq_id, draft, rid);
      if (r.ok) {
        setFeedback({ ...r, sq_id: shown.sq_id });
        if (r.won) sfx.win();
        else if (r.correct) { sfx.correct(); if (r.spin_earned) setTimeout(sfx.streak, 350); else if (r.gain > 10) setTimeout(sfx.coin, 300); }
        else if (r.correct === false) sfx.wrong();
        else sfx.sent();
        void refresh();
      } else if (r.error === 'ALREADY_ANSWERED' || r.error === 'QUESTION_NOT_FOUND') {
        next();
      } else {
        setTransient(messageFor(r.error));
        if (!GAME_SOFT_ERRORS.includes(r.error)) setFatal(messageFor(r.error));
        void refresh();
      }
    } catch (e) {
      setTransient(isNetworkError(e) ? 'تعذر إرسال الإجابة. تحقق من الاتصال ثم اضغط «إرسال» مرة أخرى.' : toAppError(e).message);
    } finally {
      setSending(false);
    }
  };

  const begin = async () => {
    setBeginning(true);
    try {
      const r = await practice.begin(p.participant_id, p.token);
      if (!r.ok) setTransient(messageFor(r.error));
      await refresh();
    } catch (e) { setTransient(toAppError(e).message); }
    finally { setBeginning(false); }
  };

  const doRoll = async () => {
    setRolling(true); sfx.roll();
    try {
      const r = await game.roll(p.participant_id, p.token);
      await new Promise((res) => setTimeout(res, 600));
      if (r.ok) {
        setRoll(r);
        const k = r.kind;
        if (r.won) sfx.win(); else if (k === 'treasure' || k === 'big_treasure' || k === 'double') sfx.coin(); else if (k === 'shield') sfx.shield(); else sfx.streak();
      } else setTransient(messageFor(r.error));
      void refresh();
    } catch (e) { setTransient(toAppError(e).message); }
    finally { setRolling(false); }
  };

  const usePower = async (targetId: string | null, team: string | null) => {
    const power = me.power;
    setActing(true);
    try {
      const r = await game.usePower(p.participant_id, p.token, targetId, team);
      if (r.ok) {
        setPicking(false);
        if (r.won) sfx.win();
        else if (r.result === 'blocked') { sfx.shield(); setNotice('صدّ الدرع محاولتك هذه المرة!'); }
        else if (power === 'freeze') { sfx.freeze(); setNotice('تم التجميد 15 ثانية ❄️'); }
        else if (power === 'bomb') { sfx.bomb(); setNotice(`أصاب القصف المجموعة: −${r.amount} نقاط`); }
        else { sfx.take(); setNotice(`حصلت على ${r.amount} نقاط`); }
      } else setTransient(messageFor(r.error));
      void refresh();
    } catch (e) { setTransient(toAppError(e).message); }
    finally { setActing(false); }
  };

  const header = (
    <div className="flex items-center justify-between gap-2 text-white">
      <div className="flex min-w-0 items-center gap-2">
        <Logo className="h-9 w-9 shrink-0" />
        <div className="min-w-0 leading-tight">
          <div className="truncate font-bold">{gs.session.title}</div>
          <div className="text-sm text-brand-100">{me.name}{me.rank ? ` · المركز ${me.rank}` : ''}</div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Badge tone="gold"><Star className="h-3.5 w-3.5" /><span data-testid="my-points">{me.points}</span> نقطة</Badge>
        <SoundToggle className="text-white" />
      </div>
    </div>
  );

  if (gs.session.status === 'ended') {
    const won = gs.session.winner?.id === me.id;
    return (
      <Shell>
        {header}
        <Card className="space-y-4 bg-gradient-to-b from-gold-50 to-white py-8">
          <Podium rows={gs.board} winner={gs.session.winner} prize={g.prize} />
          <p className="text-center text-lg font-bold">{won ? 'مبارك! أنت بطل التحدي 🎉' : `انتهى التحدي. مركزك ${me.rank ?? '—'} بـ ${me.points} نقطة.`}</p>
          <p className="text-center text-brand-600">أجبت {me.correct} إجابة صحيحة من {me.answered}.</p>
          <div className="flex flex-wrap justify-center gap-2">
            {g.practice && <Button variant="gold" onClick={() => { participantStore.clear(); nav(lastPracticeCode() ? `/practice/${lastPracticeCode()}` : '/practice'); }}>تحدٍّ جديد</Button>}
            <Button variant="outline" onClick={() => { participantStore.clear(); nav('/'); }}>الخروج</Button>
          </div>
        </Card>
      </Shell>
    );
  }

  if (gs.session.status === 'lobby') {
    return (
      <Shell>
        {header}
        <Card className="space-y-4 py-8 text-center">
          <Trophy className="mx-auto h-16 w-16 text-gold-400" />
          <h1 className="text-2xl font-extrabold">استعد لتحدي الكأس!</h1>
          <p className="text-brand-700">{goalText(g)}{g.prize && <> · الجائزة: <b>{g.prize}</b></>}</p>
          {g.practice ? (
            g.host === me.id ? (
              <div className="space-y-3 rounded-xl bg-gold-50 p-4">
                <p className="font-bold">ادعُ زملاءك: يظهر تحديك لهم في صفحة «تحدي الكأس»، أو أعطهم هذا الرمز</p>
                <div dir="ltr" className="font-mono text-4xl font-extrabold tracking-[.2em]" data-testid="room-code">{gs.session.code}</div>
                <p className="text-sm text-brand-600">عندما يدخلون اضغط «ابدأ». يمكنك البدء وحدك أيضًا.</p>
                <Button size="xl" variant="gold" className="w-full" loading={beginning} onClick={begin}>ابدأ التحدي الآن ({gs.board.length} {gs.board.length === 1 ? 'لاعب' : 'لاعبين'})</Button>
              </div>
            ) : <p className="text-brand-600">بانتظار {gs.board.find((r) => r.id === g.host)?.name ?? 'صاحب التحدي'} ليبدأ التحدي. استعد!</p>
          ) : <p className="text-brand-600">سيبدأ التحدي عندما يضغط المعلم «ابدأ».</p>}
          <p className="text-brand-600">أجب بسرعة وبدقة: كل إجابة صحيحة = 10 نقاط.</p>
          {powersOn && (
            <div className="rounded-xl bg-ivory-100 p-3 text-start text-sm">
              <div className="mb-1 font-bold">كل 3 إجابات صحيحة متتالية = رمية حظ 🎲</div>
              {luckTable(gs.teams.length > 1).map(({ n, info }) => <div key={n}><b>{n}:</b> {info.emoji} {info.title}</div>)}
            </div>
          )}
        </Card>
        <Card className="space-y-2"><h2 className="font-bold">المنضمون</h2><Leaderboard rows={gs.board} limit={30} /></Card>
      </Shell>
    );
  }

  const q = shown;
  const canAnswer = !!q && !feedback && frozenLeft <= 0 && !sending;

  return (
    <Shell>
      {header}

      <div className="grid grid-cols-3 gap-2 text-center text-white">
        <Stat label="نقاطي" value={me.points} />
        <Stat label="مركزي" value={me.rank ?? '—'} />
        {timeLeft != null ? <Stat label="الوقت" value={formatClock(timeLeft)} icon={<Timer className="h-4 w-4" />} /> : <Stat label="الهدف" value={target ?? ''} icon={<Trophy className="h-4 w-4" />} />}
      </div>
      {target && <ProgressBar value={Math.min(100, (me.points / target) * 100)} tone="gold" label={`التقدم نحو الكأس ${me.points} من ${target}`} />}

      <div className="flex flex-wrap gap-2">
        {shieldLeft > 0 && <Badge tone="blue"><Shield className="h-3.5 w-3.5" />درع {Math.ceil(shieldLeft / 1000)} ث</Badge>}
        {me.double_next && <Badge tone="gold"><Zap className="h-3.5 w-3.5" />إجابتك الصحيحة التالية ×2</Badge>}
        {me.streak >= 1 && powersOn && <Badge tone="green">🔥 {me.streak} متتالية{me.streak % 3 ? ` · ${3 - (me.streak % 3)} للرمية` : ''}</Badge>}
      </div>

      {notice && <div role="status" className="animate-pop rounded-xl bg-gold-400 p-3 text-center font-bold text-brand-900">{notice}</div>}

      {powersOn && (me.spins > 0 || me.power) && (
        <Card className="flex flex-wrap items-center justify-between gap-2 border-2 border-gold-400 bg-gold-50">
          {me.power ? (
            <>
              <span className="font-bold">{LUCK[me.power].emoji} لديك قدرة: {LUCK[me.power].title}</span>
              <Button variant="gold" onClick={() => setPicking(true)}>{POWER_ACTION[me.power]}</Button>
            </>
          ) : (
            <>
              <span className="font-bold">🎲 لديك {me.spins} {me.spins === 1 ? 'رمية' : 'رميات'} حظ</span>
              <Button variant="gold" loading={rolling} icon={<Dices className="h-5 w-5" />} onClick={doRoll}>ارمِ رقم الحظ</Button>
            </>
          )}
        </Card>
      )}

      {frozenLeft > 0 && (
        <div role="status" className="flex items-center justify-center gap-2 rounded-xl bg-sky-100 p-4 text-lg font-bold text-sky-900">
          <Snowflake className="h-6 w-6" />أنت مجمَّد! تستطيع الإجابة بعد {Math.ceil(frozenLeft / 1000)} ثانية
        </div>
      )}

      {q ? (
        <Card className="space-y-4" data-testid="game-question">
          <div className="flex items-center justify-between"><Badge>السؤال {q.number} من {q.total}</Badge>{me.double_next && <Badge tone="gold">×2</Badge>}</div>
          <Stimulus kind={q.stimulus_kind} text={q.stimulus_text} source={q.stimulus_source} />
          <QuestionImage url={q.image_url} />
          <QuestionText text={q.text} blanksAs={q.answer_format === 'blanks' ? 'line' : undefined} />
          {!feedback && <Hint hint={q.hint} />}
          <AnswerInput q={q} value={draft} onChange={setDraft} disabled={!canAnswer} />
          {feedback ? (
            <div className="space-y-2">
              {feedback.correct === true ? (
                <div role="status" className="flex animate-pop items-center gap-2 rounded-xl bg-green-50 p-3 text-lg font-bold text-green-800"><CheckCircle2 className="h-7 w-7" />صحيحة! +{feedback.gain} نقاط{feedback.spin_earned && ' · كسبت رمية حظ 🎲'}</div>
              ) : feedback.correct === false ? (
                <div role="status" className="space-y-1 rounded-xl bg-red-50 p-3 text-red-800">
                  <div className="flex items-center gap-2 text-lg font-bold"><XCircle className="h-7 w-7" />إجابة غير صحيحة{feedback.gain > 0 && ` (+${feedback.gain} لجزء صحيح)`}</div>
                  {feedback.correct_text && <div>الإجابة الصحيحة: <b>{feedback.correct_text}</b></div>}
                </div>
              ) : <div role="status" className="rounded-xl bg-brand-50 p-3 font-bold text-brand-800">سُجّلت إجابتك.</div>}
              {feedback.explanation && feedback.correct === false && <div className="rounded-xl bg-gold-50 p-3 text-brand-800"><b>التفسير:</b> {feedback.explanation}</div>}
              <Button size="lg" variant="outline" className="w-full" onClick={next}>السؤال التالي</Button>
            </div>
          ) : (
            <Button size="xl" className="w-full" disabled={!canAnswer || !answerComplete(q, draft)} loading={sending} onClick={submit}>إرسال الإجابة</Button>
          )}
        </Card>
      ) : me.finished ? (
        <Card className="space-y-2 py-8 text-center">
          <Flag className="mx-auto h-12 w-12 text-brand-500" />
          <h2 className="text-xl font-extrabold">أنهيت كل الأسئلة!</h2>
          <p className="text-brand-600">انتظر حتى ينتهي التحدي{powersOn ? '، ويمكنك استخدام رمية الحظ إن كانت لديك' : ''}.</p>
        </Card>
      ) : <Card className="py-8 text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-500" /></Card>}

      {transient && <ErrorBox error={transient} />}

      <Card className="space-y-2">
        <h2 className="font-bold">الترتيب</h2>
        <TeamScores teams={gs.teams} />
        <Leaderboard rows={gs.board} target={target} limit={5} />
      </Card>
      <Card className="space-y-2 bg-ivory-100"><h2 className="font-bold">ماذا يحدث؟</h2><EventFeed events={gs.events} /></Card>

      <Modal open={!!roll} onClose={() => setRoll(null)} title="رقم الحظ"
        footer={<Button onClick={() => { const pw = roll?.power; setRoll(null); if (pw) setPicking(true); }}>{roll?.power ? 'اختر الهدف' : 'رائع!'}</Button>}>
        {roll && (
          <div className="space-y-3 text-center" data-testid="roll-result">
            <div className="mx-auto flex h-20 w-20 animate-pop items-center justify-center rounded-2xl bg-brand-700 text-5xl font-extrabold text-white">{roll.number}</div>
            <div className="text-2xl font-extrabold">{LUCK[roll.kind]?.emoji} {LUCK[roll.kind]?.title}</div>
            <p className="text-brand-700">{LUCK[roll.kind]?.text}</p>
          </div>
        )}
      </Modal>

      <Modal open={picking && !!me.power} onClose={() => setPicking(false)} title={me.power ? `${LUCK[me.power].emoji} ${LUCK[me.power].title}` : ''}>
        {me.power && (powerNeedsTeam(me.power) ? (
          <div className="grid gap-2">
            <p className="text-brand-600">اختر مجموعة منافسة:</p>
            {gs.teams.filter((t) => !t.mine).map((t) => (
              <Button key={t.id} variant="outline" disabled={acting} onClick={() => usePower(null, t.id)} style={{ borderColor: t.color }}>{t.name} ({t.points} نقطة)</Button>
            ))}
          </div>
        ) : (
          <div className="grid max-h-[60vh] gap-2 overflow-y-auto">
            <p className="text-brand-600">اختر زميلًا{me.power === 'take' ? ' لتأخذ منه حتى 10 نقاط' : ' لتجميده 15 ثانية'}. صاحب الدرع 🛡️ يصدّ المحاولة.</p>
            {gs.board.filter((r) => !r.me).map((r) => (
              <Button key={r.id} variant="outline" disabled={acting} className="justify-between" onClick={() => usePower(r.id, null)}>
                <span>{r.name}{r.shield && ' 🛡️'}{r.frozen && ' ❄️'}</span><span className="font-extrabold">{r.points}</span>
              </Button>
            ))}
            {gs.board.filter((r) => !r.me).length === 0 && <p>لا يوجد زملاء بعد.</p>}
          </div>
        ))}
      </Modal>
    </Shell>
  );
}

function Stat({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white/10 p-2">
      <div className="flex items-center justify-center gap-1 text-xs text-brand-100">{icon}{label}</div>
      <div className="text-2xl font-extrabold tabular-nums">{value}</div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-gradient-to-b from-brand-800 to-brand-900">
      <OfflineBanner extra="أعد المحاولة عند عودة الاتصال." />
      <div className="mx-auto flex max-w-xl flex-col gap-3 px-3 py-4 sm:px-4">{children}<Credit light className="pt-4" /></div>
    </div>
  );
}
