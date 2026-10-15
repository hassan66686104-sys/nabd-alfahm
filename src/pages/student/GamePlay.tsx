// «تحدي الكأس» من جهة الطالب: أسئلة متتالية دون انتظار المعلم، نقاط، رقم الحظ، وقدرات
import { useCallback, useEffect, useRef, useState } from 'react';
import HomeButton from '@/components/HomeButton';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Dices, Flag, Loader2, Shield, Snowflake, Star, Timer, Trophy, XCircle, Zap } from 'lucide-react';
import { Logo, Credit } from '@/components/Logo';
import { Badge, Button, Card, ErrorBox, Modal, ProgressBar, cx } from '@/components/ui';
import { OfflineBanner } from '@/components/feedback';
import SoundToggle from '@/components/SoundToggle';
import { Confetti, FunBackdrop, ScorePop, VividStat, useBump } from '@/components/fun';
import { Avatar } from '@/components/Avatar';
import { AnswerInput, answerComplete, emptyAnswer } from '@/components/AnswerInput';
import { Hint, QuestionImage, QuestionText, Stimulus, useTick } from '@/components/QuestionView';
import { EventFeed, Leaderboard, Podium, TeamScores } from '@/components/challenge';
import { participantStore, type StoredParticipant } from '@/hooks/useStudent';
import { game, practice } from '@/lib/api';
import { lastPracticeCode } from '@/lib/game';
import { isNetworkError, messageFor, toAppError } from '@/lib/errors';
import { GAME_SOFT_ERRORS, HELPS, SHOP, LUCK, POWER_ACTION, formatClock, goalText, luckTable, powerNeedsTeam } from '@/lib/game';
import { sfx } from '@/lib/sound';
import { uuid } from '@/lib/uuid';
import type { Answer, GameHelp, GameRollResult, GameState, GameSubmitResult, ShopItem, StudentQuestion } from '@/lib/types';

type Shown = StudentQuestion & { total: number; option_count?: number; fifty_used?: boolean; audience?: { id: string; pct: number }[] | null };
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
  // روح اللعبة: احتفال، نقاط تقفز، واهتزاز عند الخطأ
  const [burst, setBurst] = useState(0);
  const [pop, setPop] = useState({ amount: 0, k: 0 });
  const [shake, setShake] = useState(0);
  const pointsBump = useBump(gs?.me.points);
  const celebrated = useRef(false);
  // وسائل المساعدة والمتجر
  const [helping, setHelping] = useState<GameHelp | null>(null);
  const [shopOpen, setShopOpen] = useState(false);
  const [buying, setBuying] = useState<ShopItem | null>(null);
  const wasOut = useRef(false);
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
    if (st === 'ended' && !celebrated.current) { celebrated.current = true; setBurst((b) => b + 1); }
    prevStatus.current = st;
    if (gs.me.out && !wasOut.current) { wasOut.current = true; sfx.out(); }
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
        if (r.correct) { setBurst((b) => b + 1); setPop({ amount: r.gain, k: Date.now() }); }
        else if (r.correct === false) { setShake(Date.now()); if (r.lost) setPop({ amount: -r.lost, k: Date.now() }); if (r.hearts != null && !r.out) setTimeout(sfx.heart, 450); }
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
        setBurst((b) => b + 1);
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

  const applyHelp = async (kind: GameHelp) => {
    if (!shown) return;
    setHelping(kind); setTransient(null);
    try {
      const r = await game.help(p.participant_id, p.token, shown.sq_id, kind);
      if (!r.ok) { setTransient(messageFor(r.error)); return; }
      sfx.help();
      if (kind === 'fifty' && r.hide) {
        const hide = new Set(r.hide);
        setShown((q) => (q ? { ...q, options: q.options.filter((o) => !hide.has(o.id)), fifty_used: true } : q));
        setDraft((d) => (d.option_id && hide.has(d.option_id) ? {} : d));
      } else if (kind === 'audience' && r.votes) {
        setShown((q) => (q ? { ...q, audience: r.votes } : q));
      } else if (kind === 'swap') {
        setNotice('🔄 بدّلت السؤال');
        setShown(null); setFeedback(null);
      }
      void refresh();
    } catch (e) { setTransient(toAppError(e).message); }
    finally { setHelping(null); }
  };

  const buy = async (item: ShopItem) => {
    setBuying(item); setTransient(null);
    try {
      const r = await game.buy(p.participant_id, p.token, item);
      if (!r.ok) { setTransient(messageFor(r.error)); sfx.wrong(); return; }
      sfx.buy();
      const it = SHOP.find((x) => x.item === item);
      setNotice(`🛒 اشتريت ${it?.title ?? ''} ${it?.emoji ?? ''}`);
      setPop({ amount: -r.price, k: Date.now() });
      await refresh();
    } catch (e) { setTransient(toAppError(e).message); }
    finally { setBuying(null); }
  };

  const helpsOn = g.helps !== false;
  const heartsOn = me.max_hearts > 0;
  const hearts = heartsOn ? (
    <div className="flex items-center gap-0.5 rounded-full bg-white/90 px-2 py-1 shadow" aria-label={`القلوب ${me.hearts}`} data-testid="hearts">
      {Array.from({ length: Math.max(me.max_hearts, me.hearts) }, (_, i) => (
        <span key={i} className={cx('text-lg leading-none transition', i < me.hearts ? 'motion-safe:animate-[bump_.45s_ease-out]' : 'opacity-40 grayscale')}>{i < me.hearts ? '❤️' : '🤍'}</span>
      ))}
    </div>
  ) : null;

  const header = (
    <div className="flex items-center justify-between gap-2 text-white">
      <div className="flex min-w-0 items-center gap-2">
        {me.avatar ? <Avatar id={me.avatar} size="md" /> : <Logo className="h-9 w-9 shrink-0" />}
        <div className="min-w-0 leading-tight">
          <div className="truncate font-bold">{gs.session.title}</div>
          <div className="text-sm text-brand-100">{me.name}{me.rank ? ` · المركز ${me.rank}` : ''}</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1">
        {hearts}
        <span className={cx('inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-yellow-300 to-orange-400 px-3 py-1 text-sm font-extrabold text-purple-950 shadow-lg', pointsBump)}><Star className="h-4 w-4 fill-current motion-safe:animate-spin [animation-duration:4s]" /><span data-testid="my-points">{me.points}</span> نقطة</span>
        <SoundToggle className="text-white" />
        <HomeButton />
      </div>
    </div>
  );

  if (gs.session.status === 'ended') {
    const won = gs.session.winner?.id === me.id;
    return (
      <Shell>
        {header}
        <Confetti burst={burst} />
        <Card className="animate-bounceIn space-y-4 bg-gradient-to-b from-yellow-50 via-white to-pink-50 py-8">
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
        <Confetti burst={burst} />
        <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
        <Card className="space-y-4 py-8 text-center">
          <Trophy className="mx-auto h-20 w-20 text-yellow-400 motion-safe:animate-bounce motion-safe:[animation-duration:1.6s]" style={{ filter: 'drop-shadow(0 0 14px rgba(250,204,21,.9))' }} />
          <h1 className="bg-gradient-to-l from-fuchsia-600 via-orange-500 to-purple-700 bg-clip-text text-3xl font-black text-transparent">استعد لتحدي الكأس!</h1>
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
          {(heartsOn || helpsOn) && (
            <div className="grid gap-2 text-start text-sm sm:grid-cols-2">
              {heartsOn && <div className="rounded-xl bg-rose-50 p-3"><b>❤️ لديك {me.max_hearts} قلوب</b><br />كل إجابة خاطئة تُفقدك قلبًا و5 نقاط، وإذا انتهت القلوب تخرج من اللعبة.</div>}
              {helpsOn && <div className="rounded-xl bg-indigo-50 p-3"><b>🆘 وسائل المساعدة</b><br />✂️ حذف إجابتين · 👥 رأي الجمهور · 🔄 تبديل السؤال. واشترِ المزيد من 🛒 المتجر بنقاطك.</div>}
            </div>
          )}
          {powersOn && (
            <div className="rounded-xl bg-ivory-100 p-3 text-start text-sm">
              <div className="mb-1 font-bold">كل 3 إجابات صحيحة متتالية = رمية حظ 🎲</div>
              {luckTable(gs.teams.length > 1).map(({ n, info }) => <div key={n}><b>{n}:</b> {info.emoji} {info.title}</div>)}
            </div>
          )}
        </Card>
        <Card className="space-y-2"><h2 className="font-bold">المنضمون</h2><Leaderboard rows={gs.board} limit={30} /></Card>
        </div>
      </Shell>
    );
  }

  // انتهت القلوب: يخرج الطالب ويتابع الترتيب حتى ينتهي التحدي
  if (me.out) {
    return (
      <Shell>
        {header}
        <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
          <Card className="animate-bounceIn space-y-3 py-8 text-center" data-testid="game-out">
            <div className="text-7xl motion-safe:animate-pulse">💔</div>
            <h1 className="text-3xl font-black text-rose-700">انتهت قلوبك!</h1>
            <p className="text-lg">خرجت من التحدي بـ <b>{me.points}</b> نقطة{me.rank ? ` في المركز ${me.rank}` : ''}.</p>
            <p className="text-brand-600">أجبت {me.correct} إجابة صحيحة. راجع الدرس وحاول مرة أخرى، ستكون أقوى! 💪</p>
            <div className="flex flex-wrap justify-center gap-2">
              {g.practice && <Button variant="gold" onClick={() => { participantStore.clear(); nav(lastPracticeCode() ? `/practice/${lastPracticeCode()}` : '/practice'); }}>تحدٍّ جديد</Button>}
              <Button variant="outline" onClick={() => { participantStore.clear(); nav('/'); }}>الخروج</Button>
            </div>
          </Card>
          <Card className="space-y-2"><h2 className="font-bold">الترتيب</h2><Leaderboard rows={gs.board} target={target} limit={8} /></Card>
        </div>
      </Shell>
    );
  }

  const q = shown;
  const canAnswer = !!q && !feedback && frozenLeft <= 0 && !sending;
  const choiceQ = !!q && q.answer_format === 'single' && (q.option_count ?? q.options.length) >= 3;
  const helpOk: Record<GameHelp, boolean> = {
    fifty: choiceQ && !q?.fifty_used,
    audience: choiceQ && !q?.audience,
    swap: true,
  };

  return (
    <Shell>
      {header}
      <Confetti burst={burst} />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
      <div className="flex flex-col gap-3">

      <div className="grid grid-cols-3 gap-2 text-center text-white">
        <VividStat i={0} label="نقاطي ⭐" value={me.points} />
        <VividStat i={1} label="مركزي 🏅" value={me.rank ?? '—'} />
        {timeLeft != null ? <VividStat i={2} label="الوقت" value={formatClock(timeLeft)} icon={<Timer className="h-4 w-4" />} /> : <VividStat i={2} label="الهدف" value={target ?? ''} icon={<Trophy className="h-4 w-4" />} />}
      </div>
      {target && <ProgressBar value={Math.min(100, (me.points / target) * 100)} tone="gold" label={`التقدم نحو الكأس ${me.points} من ${target}`} />}

      <div className="flex flex-wrap gap-2">
        {shieldLeft > 0 && <span className="inline-flex animate-bounceIn items-center gap-1 rounded-full bg-gradient-to-r from-sky-400 to-blue-600 px-3 py-1 text-sm font-bold text-white shadow"><Shield className="h-4 w-4 motion-safe:animate-pulse" />درع {Math.ceil(shieldLeft / 1000)} ث</span>}
        {me.double_next && <span className="inline-flex animate-bounceIn items-center gap-1 rounded-full bg-gradient-to-r from-yellow-300 to-orange-500 px-3 py-1 text-sm font-bold text-purple-950 shadow"><Zap className="h-4 w-4 motion-safe:animate-wiggle" />إجابتك الصحيحة التالية ×2</span>}
        {me.streak >= 1 && powersOn && <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-orange-500 to-red-600 px-3 py-1 text-sm font-bold text-white shadow"><span className="inline-block motion-safe:animate-wiggle">🔥</span> {me.streak} متتالية{me.streak % 3 ? ` · ${3 - (me.streak % 3)} للرمية` : ''}</span>}
      </div>

      {notice && <div role="status" className="animate-bounceIn rounded-2xl bg-gradient-to-r from-yellow-300 via-orange-400 to-pink-500 p-3 text-center text-lg font-extrabold text-purple-950 shadow-xl ring-2 ring-white/60">{notice}</div>}

      {powersOn && (me.spins > 0 || me.power) && (
        <Card className="flex animate-bounceIn flex-wrap items-center justify-between gap-2 border-0 bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-500 text-white shadow-xl ring-4 ring-yellow-300/70">
          {me.power ? (
            <>
              <span className="text-lg font-extrabold"><span className="inline-block motion-safe:animate-wiggle">{LUCK[me.power].emoji}</span> لديك قدرة: {LUCK[me.power].title}</span>
              <Button variant="gold" onClick={() => setPicking(true)}>{POWER_ACTION[me.power]}</Button>
            </>
          ) : (
            <>
              <span className="text-lg font-extrabold"><span className="inline-block motion-safe:animate-wiggle">🎲</span> لديك {me.spins} {me.spins === 1 ? 'رمية' : 'رميات'} حظ</span>
              <Button variant="gold" disabled={rolling} icon={<Dices className={cx('h-6 w-6', rolling ? 'animate-diceSpin' : 'motion-safe:animate-wiggle')} />} onClick={doRoll}>{rolling ? 'النرد يدور…' : 'ارمِ رقم الحظ'}</Button>
            </>
          )}
        </Card>
      )}

      {frozenLeft > 0 && (
        <div role="status" className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-200 to-cyan-100 p-4 text-lg font-bold text-sky-900 shadow-lg ring-2 ring-white">
          <Snowflake className="h-7 w-7 motion-safe:animate-spin [animation-duration:3s]" />أنت مجمَّد! تستطيع الإجابة بعد {Math.ceil(frozenLeft / 1000)} ثانية
        </div>
      )}

      {helpsOn && q && !feedback && (
        <div className="grid grid-cols-4 gap-2" data-testid="helps">
          {(Object.keys(HELPS) as GameHelp[]).map((k) => {
            const n = me.helps?.[k] ?? 0;
            return (
              <button key={k} type="button" onClick={() => applyHelp(k)} disabled={!!helping || n < 1 || !helpOk[k] || !canAnswer}
                title={HELPS[k].text} aria-label={`${HELPS[k].title} (${n})`}
                className="relative flex flex-col items-center gap-0.5 rounded-2xl bg-white/90 p-2 text-xs font-bold text-purple-900 shadow-lg ring-1 ring-purple-200 transition hover:-translate-y-0.5 hover:bg-white disabled:translate-y-0 disabled:opacity-45">
                <span className={cx('text-2xl', helping === k && 'animate-diceSpin')}>{HELPS[k].emoji}</span>
                <span className="leading-tight">{HELPS[k].title}</span>
                <span className={cx('absolute -top-1.5 left-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] text-white', n > 0 ? 'bg-fuchsia-600' : 'bg-slate-400')}>{n}</span>
              </button>
            );
          })}
          <button type="button" onClick={() => setShopOpen(true)} aria-label="المتجر"
            className="flex flex-col items-center gap-0.5 rounded-2xl bg-gradient-to-b from-amber-200 to-amber-300 p-2 text-xs font-bold text-amber-950 shadow-lg ring-1 ring-amber-300 transition hover:-translate-y-0.5">
            <span className="text-2xl motion-safe:animate-wiggle">🛒</span><span>المتجر</span>
          </button>
        </div>
      )}

      {q ? (
        <Card key={`${q.sq_id}-${shake}`} className={cx('relative space-y-4 border-t-8 border-t-fuchsia-500 shadow-2xl', shake && feedback?.correct === false ? 'animate-shake' : 'animate-bounceIn')} data-testid="game-question">
          <ScorePop amount={pop.amount} k={pop.k} />
          <div className="flex items-center justify-between"><span className="rounded-full bg-gradient-to-r from-purple-600 to-fuchsia-500 px-3 py-1 text-sm font-bold text-white">السؤال {q.number} من {q.total}</span>{me.double_next && <Badge tone="gold">×2</Badge>}</div>
          <Stimulus kind={q.stimulus_kind} text={q.stimulus_text} source={q.stimulus_source} />
          <QuestionImage url={q.image_url} />
          <QuestionText text={q.text} blanksAs={q.answer_format === 'blanks' ? 'line' : undefined} />
          {!feedback && <Hint hint={q.hint} />}
          {q.audience && !feedback && (
            <div className="space-y-1.5 rounded-2xl bg-indigo-50 p-3" data-testid="audience">
              <div className="text-sm font-bold text-indigo-900">👥 رأي الجمهور (قد يخطئ!)</div>
              {q.options.map((o, i) => {
                const pct = q.audience?.find((v) => v.id === o.id)?.pct ?? 0;
                return (
                  <div key={o.id} className="flex items-center gap-2 text-sm">
                    <span className="w-24 shrink-0 truncate font-semibold">{['أ', 'ب', 'ج', 'د', 'هـ', 'و'][i]}. {o.text}</span>
                    <span className="h-4 flex-1 overflow-hidden rounded-full bg-white"><span className="block h-full rounded-full bg-gradient-to-l from-indigo-400 to-violet-500 transition-all duration-700" style={{ width: `${pct}%` }} /></span>
                    <span className="w-10 shrink-0 text-end font-bold tabular-nums">{pct}%</span>
                  </div>
                );
              })}
            </div>
          )}
          <AnswerInput q={q} value={draft} onChange={setDraft} disabled={!canAnswer} />
          {feedback ? (
            <div className="space-y-2">
              {feedback.correct === true ? (
                <div role="status" className="flex animate-bounceIn items-center gap-2 rounded-2xl bg-gradient-to-r from-lime-300 to-emerald-400 p-3 text-xl font-extrabold text-emerald-950 shadow-lg"><CheckCircle2 className="h-8 w-8" />صحيحة! +{feedback.gain} نقاط{feedback.spin_earned && ' · كسبت رمية حظ 🎲'}</div>
              ) : feedback.correct === false ? (
                <div role="status" className="animate-pop space-y-1 rounded-2xl bg-gradient-to-r from-rose-100 to-orange-100 p-3 text-red-800 ring-2 ring-rose-300">
                  <div className="flex items-center gap-2 text-lg font-bold"><XCircle className="h-7 w-7" />إجابة غير صحيحة{feedback.gain > 0 && ` (+${feedback.gain} لجزء صحيح)`}</div>
                  {(feedback.lost ?? 0) > 0 || heartsOn ? <div className="font-bold" data-testid="penalty">{(feedback.lost ?? 0) > 0 && `−${feedback.lost} نقاط`}{heartsOn && ' · 💔 خسرت قلبًا'}{feedback.out && ' · انتهت قلوبك!'}</div> : null}
                  {feedback.correct_text && <div>الإجابة الصحيحة: <b>{feedback.correct_text}</b></div>}
                </div>
              ) : <div role="status" className="rounded-xl bg-brand-50 p-3 font-bold text-brand-800">سُجّلت إجابتك.</div>}
              {feedback.explanation && feedback.correct === false && <div className="rounded-xl bg-gold-50 p-3 text-brand-800"><b>التفسير:</b> {feedback.explanation}</div>}
              <Button size="lg" variant="outline" className="w-full" onClick={next}>السؤال التالي</Button>
            </div>
          ) : (
            <Button size="xl" className="w-full bg-gradient-to-r from-fuchsia-600 to-purple-700 text-white shadow-lg hover:from-fuchsia-500 hover:to-purple-600" disabled={!canAnswer || !answerComplete(q, draft)} loading={sending} onClick={submit}>إرسال الإجابة</Button>
          )}
        </Card>
      ) : me.finished ? (
        <Card className="space-y-2 py-8 text-center">
          <Flag className="mx-auto h-14 w-14 text-fuchsia-500 motion-safe:animate-wiggle" />
          <h2 className="text-xl font-extrabold">أنهيت كل الأسئلة!</h2>
          <p className="text-brand-600">انتظر حتى ينتهي التحدي{powersOn ? '، ويمكنك استخدام رمية الحظ إن كانت لديك' : ''}.</p>
        </Card>
      ) : <Card className="py-8 text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-500" /></Card>}

      {transient && <ErrorBox error={transient} />}
      </div>

      <div className="flex flex-col gap-3 lg:sticky lg:top-4">
      <Card className="space-y-2">
        <h2 className="font-bold">الترتيب</h2>
        <TeamScores teams={gs.teams} />
        <Leaderboard rows={gs.board} target={target} limit={8} />
      </Card>
      <Card className="space-y-2 bg-ivory-100"><h2 className="font-bold">ماذا يحدث؟</h2><EventFeed events={gs.events} /></Card>
      </div>
      </div>

      <Modal open={shopOpen} onClose={() => setShopOpen(false)} title="🛒 المتجر">
        <div className="space-y-3" data-testid="shop">
          <p className="text-brand-700">اشترِ بنقاطك. لديك <b className="text-purple-700">{me.points}</b> نقطة.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {SHOP.filter((it) => heartsOn || it.item !== 'heart').map((it) => (
              <button key={it.item} type="button" disabled={!!buying || me.points < it.price} onClick={() => buy(it.item)}
                className="flex items-center justify-between gap-2 rounded-2xl border-2 border-purple-100 bg-white p-3 text-start transition hover:border-purple-400 hover:bg-purple-50 disabled:opacity-50">
                <span className="flex items-center gap-2 font-bold"><span className="text-3xl">{it.emoji}</span>{it.title}</span>
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-sm font-extrabold text-amber-900">{buying === it.item ? '…' : `${it.price} ⭐`}</span>
              </button>
            ))}
          </div>
          {transient && <ErrorBox error={transient} />}
        </div>
      </Modal>

      <Modal open={!!roll} onClose={() => setRoll(null)} title="رقم الحظ"
        footer={<Button onClick={() => { const pw = roll?.power; setRoll(null); if (pw) setPicking(true); }}>{roll?.power ? 'اختر الهدف' : 'رائع!'}</Button>}>
        {roll && (
          <div className="space-y-3 text-center" data-testid="roll-result">
            <div className="mx-auto flex h-24 w-24 animate-bounceIn items-center justify-center rounded-3xl bg-gradient-to-br from-fuchsia-500 to-orange-400 text-6xl font-black text-white shadow-xl ring-4 ring-yellow-300">{roll.number}</div>
            <div className="text-2xl font-extrabold"><span className="inline-block text-4xl motion-safe:animate-wiggle">{LUCK[roll.kind]?.emoji}</span> {LUCK[roll.kind]?.title}</div>
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

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <FunBackdrop>
      <OfflineBanner extra="أعد المحاولة عند عودة الاتصال." />
      <div className="mx-auto flex w-full max-w-xl flex-col gap-3 px-3 py-4 sm:px-4 lg:max-w-none lg:px-8">{children}<Credit light className="pt-4" /></div>
    </FunBackdrop>
  );
}
