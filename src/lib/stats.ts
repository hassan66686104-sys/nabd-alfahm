// حساب مؤشرات الفهم والتقارير ولوحة الصدارة (دوال نقية قابلة للاختبار)
import type { Participant, ResponseRow, Session, SessionQuestion, Team, TeacherSettings } from './types';
import { OPTION_LETTERS, bloomLabel, typeLabel } from './constants';
import { groupAnswers } from './text';

export type Level = 'green' | 'yellow' | 'red' | 'none';
export type Thresholds = Pick<TeacherSettings, 'mastery' | 'reinforce'>;

export const LEVEL_LABELS: Record<Level, string> = {
  green: 'إتقان جيد',
  yellow: 'يحتاج إلى تعزيز',
  red: 'يحتاج إلى معالجة',
  none: 'لا توجد بيانات كافية',
};

// سؤال رأي (نعم/لا) لا يُصحَّح ولا يدخل في نسب الصحة
export const isPoll = (sq: Pick<SessionQuestion, 'snapshot'>) => sq.snapshot.answer_key?.poll === true;

export function levelFor(correctPct: number | null, t: Thresholds): Level {
  if (correctPct == null) return 'none';
  if (correctPct >= t.mastery) return 'green';
  if (correctPct >= t.reinforce) return 'yellow';
  return 'red';
}

export interface DistributionItem { key: string; label: string; text: string; count: number; isCorrect: boolean | null }

export interface QuestionStats {
  eligible: number;
  answered: number;
  notAnswered: number;
  participation: number; // 0..100
  correct: number;
  incorrect: number;
  pending: number;
  correctPct: number | null; // من الإجابات المصححة
  distribution: DistributionItem[];
  mostChosen: DistributionItem | null;
  commonWrong: DistributionItem | null;
  avgMs: number | null;
  level: Level;
  needSupport: string[]; // معرفات المشاركين: أخطؤوا أو لم يجيبوا
  wrong: string[];
  missing: string[];
  textAnswers: { text: string; count: number }[];
}

export function eligibleParticipants(sq: SessionQuestion, participants: Participant[]): Participant[] {
  return participants.filter((p) => !p.is_removed && (!sq.team_id || p.team_id === sq.team_id));
}

export function computeQuestionStats(
  sq: SessionQuestion,
  participants: Participant[],
  responses: ResponseRow[],
  t: Thresholds,
): QuestionStats {
  const elig = eligibleParticipants(sq, participants);
  const eligIds = new Set(elig.map((p) => p.id));
  const rs = responses.filter((r) => r.sq_id === sq.id);
  const answeredIds = new Set(rs.map((r) => r.participant_id));
  const answered = rs.length;
  const eligible = Math.max(elig.length, answered);
  const correct = rs.filter((r) => r.is_correct === true).length;
  const incorrect = rs.filter((r) => r.is_correct === false).length;
  const pending = isPoll(sq) ? 0 : rs.filter((r) => r.is_correct === null).length;
  const graded = correct + incorrect;
  const correctPct = graded > 0 ? (correct / graded) * 100 : null;
  const times = rs.map((r) => r.response_ms).filter((x): x is number => typeof x === 'number');
  const avgMs = times.length ? times.reduce((a, b) => a + b, 0) / times.length : null;

  const snap = sq.snapshot;
  const fmt = snap.answer_format;
  let distribution: DistributionItem[] = [];
  if (fmt === 'single' || fmt === 'multi') {
    distribution = snap.options.map((o, i) => ({
      key: o.id,
      label: OPTION_LETTERS[i] ?? String(i + 1),
      text: o.text,
      isCorrect: isPoll(sq) ? null : o.is_correct,
      count: rs.filter((r) => (fmt === 'single' ? r.answer.option_id === o.id : r.answer.option_ids?.includes(o.id))).length,
    }));
  } else {
    distribution = [
      { key: 'correct', label: 'صحيحة', text: 'إجابات صحيحة', count: correct, isCorrect: true },
      { key: 'incorrect', label: 'خاطئة', text: 'إجابات خاطئة', count: incorrect, isCorrect: false },
      { key: 'pending', label: 'للمراجعة', text: 'بانتظار تصحيح المعلم', count: pending, isCorrect: null },
    ].filter((d) => d.count > 0 || d.key !== 'pending');
  }
  const sorted = [...distribution].sort((a, b) => b.count - a.count);
  const mostChosen = sorted[0] && sorted[0].count > 0 ? sorted[0] : null;
  const commonWrong = (fmt === 'single' || fmt === 'multi')
    ? sorted.find((d) => d.isCorrect === false && d.count > 0) ?? null
    : null;

  const wrong = rs.filter((r) => r.is_correct === false && eligIds.has(r.participant_id)).map((r) => r.participant_id);
  const missing = elig.filter((p) => !answeredIds.has(p.id)).map((p) => p.id);
  const textAnswers = fmt === 'short' || fmt === 'open'
    ? groupAnswers(rs.map((r) => r.answer.text ?? ''))
    : fmt === 'blanks' ? groupAnswers(rs.map((r) => (r.answer.blanks ?? []).join(' / '))) : [];

  return {
    eligible,
    answered,
    notAnswered: Math.max(0, eligible - answered),
    participation: eligible > 0 ? (answered / eligible) * 100 : 0,
    correct, incorrect, pending, correctPct,
    distribution, mostChosen, commonWrong, avgMs,
    level: levelFor(correctPct, t),
    needSupport: [...wrong, ...missing],
    wrong, missing, textAnswers,
  };
}

// إجراء تعليمي مقترح حسب مستوى الفهم (مؤشر مساعد وليس حكمًا نهائيًا)
export function suggestActions(stats: QuestionStats, sq: SessionQuestion): string[] {
  const out: string[] = [];
  const fmt = sq.snapshot.answer_format;
  if (stats.answered === 0) return ['لم تصل إجابات بعد. ذكّر الطلاب برمز الحصة أو امنحهم وقتًا إضافيًا.'];
  if (stats.participation < 60) out.push('نسبة المشاركة منخفضة؛ شجّع الطلاب الذين لم يجيبوا قبل الحكم على مستوى الفهم.');
  if (isPoll(sq)) return [...out, 'سؤال رأي: استخدم توزيع الإجابات لفتح نقاش مع الطلاب.'];
  if (stats.level === 'none') {
    if (fmt === 'open' || stats.pending > 0) out.push('راجع الإجابات المفتوحة واعتمد أبرزها للنقاش الجماعي.');
    return out;
  }
  if (stats.level === 'green') {
    out.push('الفهم جيد؛ يمكنك الانتقال إلى النقطة التالية.');
    out.push('اطلب من طالب أجاب صحيحًا أن يشرح طريقته لزملائه بإيجاز.');
  } else if (stats.level === 'yellow') {
    out.push('قدّم مثالًا جديدًا أو تطبيقًا قصيرًا لتعزيز الفكرة.');
    if (stats.commonWrong) out.push(`ناقش سبب اختيار «${stats.commonWrong.text}» (${stats.commonWrong.count} طالب).`);
    out.push('أعد طرح سؤال مشابه بصياغة مختلفة بعد التوضيح.');
  } else {
    out.push('أعد شرح الفكرة بطريقة مختلفة (مثال محسوس، رسم، قصة).');
    if (stats.commonWrong) out.push(`الخطأ الشائع: «${stats.commonWrong.text}» — ناقشه صراحة مع الطلاب.`);
    out.push('اطرح سؤالًا علاجيًا أبسط قبل الانتقال، أو استخدم «إعادة المحاولة» بعد النقاش.');
    out.push('نفّذ نشاطًا ثنائيًا قصيرًا: يشرح كل طالب لزميله ثم يعيدان الإجابة.');
  }
  return out;
}

export interface StudentResult {
  id: string;
  name: string;
  alias: string;
  team: string | null;
  answered: number;
  correct: number;
  incorrect: number;
  pending: number;
  score: number;
  correctPct: number | null;
  level: Level;
}

export interface QuestionSummary {
  sq_id: string;
  number: number;
  text: string;
  type: string;
  bloom: string;
  skill: string;
  lesson: string;
  game_mode: string;
  answered: number;
  eligible: number;
  participation: number;
  correctPct: number | null;
  level: Level;
  avgMs: number | null;
  commonWrong: string | null;
  distribution: { label: string; text: string; count: number; isCorrect: boolean | null }[];
}

export interface SessionSummary {
  version: 1;
  generated_at: string;
  session: { id: string; title: string; code: string; lesson: string; unit: string; grade: string; class_id: string | null; created_at: string; started_at: string | null; ended_at: string | null };
  thresholds: Thresholds;
  participants: number;
  questionsAsked: number;
  overallCorrectPct: number | null;
  overallParticipation: number;
  level: Level;
  questions: QuestionSummary[];
  hardest: { sq_id: string; number: number; text: string; correctPct: number }[];
  reteach: { text: string; skill: string; lesson: string; correctPct: number }[];
  students: StudentResult[];
  needSupport: { id: string; name: string; correctPct: number | null }[];
  exitTicket: { sq_id: string; text: string; correctPct: number | null; answered: number } | null;
  recommendations: string[];
}

export function summarizeSession(
  session: Session,
  sqs: SessionQuestion[],
  participants: Participant[],
  responses: ResponseRow[],
  teams: Team[],
  t: Thresholds,
): SessionSummary {
  const asked = sqs.filter((s) => s.status !== 'draft' && s.opened_at).sort((a, b) => (a.opened_at! < b.opened_at! ? -1 : 1));
  const active = participants.filter((p) => !p.is_removed);
  const teamName = new Map(teams.map((x) => [x.id, x.name]));
  const questions: QuestionSummary[] = asked.map((sq, i) => {
    const st = computeQuestionStats(sq, active, responses, t);
    return {
      sq_id: sq.id,
      number: i + 1,
      text: sq.snapshot.text,
      type: typeLabel(sq.snapshot.type),
      bloom: bloomLabel(sq.snapshot.bloom),
      skill: sq.snapshot.skill,
      lesson: sq.snapshot.lesson,
      game_mode: sq.game_mode,
      answered: st.answered,
      eligible: st.eligible,
      participation: st.participation,
      correctPct: st.correctPct,
      level: st.level,
      avgMs: st.avgMs,
      commonWrong: st.commonWrong?.text ?? null,
      distribution: st.distribution.map((d) => ({ label: d.label, text: d.text, count: d.count, isCorrect: d.isCorrect })),
    };
  });
  const askedIds = new Set(asked.map((s) => s.id));
  const rs = responses.filter((r) => askedIds.has(r.sq_id));
  const pollIds = new Set(asked.filter(isPoll).map((s) => s.id));

  const students: StudentResult[] = active.map((p) => {
    const mine = rs.filter((r) => r.participant_id === p.id);
    const correct = mine.filter((r) => r.is_correct === true).length;
    const incorrect = mine.filter((r) => r.is_correct === false).length;
    const graded = correct + incorrect;
    const cp = graded ? (correct / graded) * 100 : null;
    return {
      id: p.id,
      name: p.display_name,
      alias: p.alias,
      team: p.team_id ? teamName.get(p.team_id) ?? null : null,
      answered: mine.length,
      correct, incorrect,
      pending: mine.filter((r) => r.is_correct === null && !pollIds.has(r.sq_id)).length,
      score: Math.round(mine.reduce((a, r) => a + (r.score ?? 0), 0) * 100) / 100,
      correctPct: cp,
      level: levelFor(cp, t),
    };
  }).sort((a, b) => (b.correctPct ?? -1) - (a.correctPct ?? -1) || a.name.localeCompare(b.name, 'ar'));

  const gradedAll = rs.filter((r) => r.is_correct !== null);
  const overallCorrectPct = gradedAll.length ? (gradedAll.filter((r) => r.is_correct).length / gradedAll.length) * 100 : null;
  const possible = questions.reduce((a, q) => a + q.eligible, 0);
  const overallParticipation = possible ? (questions.reduce((a, q) => a + q.answered, 0) / possible) * 100 : 0;
  const withPct = questions.filter((q) => q.correctPct != null) as (QuestionSummary & { correctPct: number })[];
  const hardest = [...withPct].sort((a, b) => a.correctPct - b.correctPct).slice(0, 3)
    .map((q) => ({ sq_id: q.sq_id, number: q.number, text: q.text, correctPct: q.correctPct }));
  const reteach = withPct.filter((q) => q.correctPct < t.reinforce)
    .map((q) => ({ text: q.text, skill: q.skill, lesson: q.lesson, correctPct: q.correctPct }));
  const needSupport = students
    .filter((s) => (s.correctPct != null && s.correctPct < t.reinforce) || (questions.length > 0 && s.answered < questions.length / 2))
    .map((s) => ({ id: s.id, name: s.name, correctPct: s.correctPct }));
  const exitSq = [...asked].reverse().find((s) => s.game_mode === 'exit' || s.snapshot.type === 'exit_ticket');
  const exitQ = exitSq ? questions.find((q) => q.sq_id === exitSq.id) : undefined;
  const level = levelFor(overallCorrectPct, t);

  const recommendations: string[] = [];
  if (questions.length === 0) recommendations.push('لم تُطرح أسئلة في هذه الحصة.');
  if (level === 'green') recommendations.push('مستوى الفهم العام جيد؛ انتقل إلى أهداف الدرس التالي مع مراجعة سريعة في بداية الحصة القادمة.');
  if (level === 'yellow') recommendations.push('الفهم العام يحتاج إلى تعزيز؛ خصص 5–10 دقائق في الحصة القادمة لأنشطة تطبيقية على المفاهيم الأضعف.');
  if (level === 'red') recommendations.push('الفهم العام منخفض؛ أعد تدريس المفاهيم الأساسية بأسلوب مختلف قبل الانتقال.');
  for (const r of reteach.slice(0, 3)) recommendations.push(`أعد تدريس: «${r.skill || r.lesson || r.text.slice(0, 60)}» (صحة ${Math.round(r.correctPct)}%).`);
  if (needSupport.length) recommendations.push(`تابع ${needSupport.length} طالبًا يحتاجون إلى دعم إضافي (مجموعة صغيرة أو واجب علاجي).`);
  if (overallParticipation < 70 && questions.length) recommendations.push('المشاركة أقل من 70%؛ جرّب أسئلة أقصر أو تحدي الفرق لرفع التفاعل.');
  if (exitQ && exitQ.correctPct != null) {
    recommendations.push(exitQ.correctPct >= t.mastery
      ? 'سؤال الخروج يشير إلى تحقق هدف الدرس لدى أغلب الطلاب.'
      : 'سؤال الخروج يشير إلى أن هدف الدرس لم يتحقق بعد لدى عدد من الطلاب.');
  }
  recommendations.push('تذكير: هذه النتائج مؤشرات مساعدة، وليست حكمًا نهائيًا على مستوى أي طالب.');

  return {
    version: 1,
    generated_at: new Date().toISOString(),
    session: {
      id: session.id, title: session.title, code: session.code, lesson: session.lesson, unit: session.unit,
      grade: session.grade, class_id: session.class_id, created_at: session.created_at, started_at: session.started_at, ended_at: session.ended_at,
    },
    thresholds: { mastery: t.mastery, reinforce: t.reinforce },
    participants: active.length,
    questionsAsked: questions.length,
    overallCorrectPct,
    overallParticipation,
    level,
    questions,
    hardest,
    reteach,
    students,
    needSupport,
    exitTicket: exitQ ? { sq_id: exitQ.sq_id, text: exitQ.text, correctPct: exitQ.correctPct, answered: exitQ.answered } : null,
    recommendations,
  };
}

export interface LeaderRow { id: string; alias: string; name: string; teamId: string | null; points: number; streak: number; bestStreak: number; survivor: boolean }
export interface TeamRow { id: string; name: string; color: string; points: number; members: number; average: number }

// لوحة الصدارة: تُحسب فقط من الأسئلة المكشوفة حتى لا تكشف الصحة قبل قرار المعلم
export function computeLeaderboard(sqs: SessionQuestion[], participants: Participant[], responses: ResponseRow[], teams: Team[]) {
  const revealed = sqs.filter((s) => s.revealed && s.opened_at).sort((a, b) => (a.opened_at! < b.opened_at! ? -1 : 1));
  const byKey = new Map(responses.map((r) => [`${r.sq_id}:${r.participant_id}`, r]));
  const players: LeaderRow[] = participants.filter((p) => !p.is_removed).map((p) => {
    let points = 0, streak = 0, best = 0, survivor = true;
    for (const sq of revealed) {
      if (sq.team_id && sq.team_id !== p.team_id) continue;
      const r = byKey.get(`${sq.id}:${p.id}`);
      points += r?.score ?? 0;
      if (r?.is_correct) {
        streak += 1;
        best = Math.max(best, streak);
        if (sq.game_mode === 'streak' && streak >= 2) points += streak - 1; // مكافأة السلسلة
      } else if (r?.is_correct === false || !r) {
        streak = 0;
        if (sq.game_mode === 'survival') survivor = false;
      }
    }
    return { id: p.id, alias: p.alias, name: p.display_name, teamId: p.team_id, points: Math.round(points * 100) / 100, streak, bestStreak: best, survivor };
  }).sort((a, b) => b.points - a.points || b.bestStreak - a.bestStreak);
  const teamRows: TeamRow[] = teams.map((t) => {
    const members = players.filter((p) => p.teamId === t.id);
    const total = members.reduce((a, m) => a + m.points, 0);
    return { id: t.id, name: t.name, color: t.color, points: Math.round(total * 100) / 100, members: members.length, average: members.length ? Math.round((total / members.length) * 100) / 100 : 0 };
  }).sort((a, b) => b.average - a.average || b.points - a.points);
  const hasSurvival = revealed.some((s) => s.game_mode === 'survival');
  return { players, teams: teamRows, hasSurvival };
}
