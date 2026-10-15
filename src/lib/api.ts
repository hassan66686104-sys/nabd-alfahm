// طبقة الوصول إلى البيانات (Supabase). كل خطأ يتحول إلى رسالة عربية واضحة.
import { uuid } from './uuid';
import { supabase, isConfigured, publicAppUrl } from './supabase';
import { AppError, toAppError } from './errors';
import type {
  Answer, ClassGroup, GameBuyResult, GameEvent, GameHelp, GameHelpResult, ShopItem, GamePowerResult, GameRollResult, GameSettings, GameState, GameSubmitResult, Participant, Profile, Question, Report, ResponseRow, Session, SessionQuestion, Snapshot, StudentState, Subject, Team, TeacherSettings,
} from './types';
import type { QuestionInput } from './schemas';
import type { SessionSummary } from './stats';
import { DEFAULT_SETTINGS } from './constants';

interface Res<T> { data: T | null; error: unknown }

function ensure() {
  if (!isConfigured) throw new AppError('NOT_CONFIGURED');
}

async function run<T>(p: PromiseLike<Res<T>>): Promise<T> {
  ensure();
  let r: Res<T>;
  try {
    r = await p;
  } catch (e) {
    throw toAppError(e);
  }
  if (r.error) throw toAppError(r.error);
  return r.data as T;
}

// ---------- المصادقة ----------
export const auth = {
  async signIn(email: string, password: string) {
    ensure();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw toAppError(error);
  },
  async signUp(email: string, password: string, fullName: string) {
    ensure();
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName }, emailRedirectTo: `${publicAppUrl()}/t` },
    });
    if (error) throw toAppError(error);
    return { needsConfirmation: !data.session };
  },
  async signOut() {
    await supabase.auth.signOut();
  },
  async requestReset(email: string) {
    ensure();
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${publicAppUrl()}/reset` });
    if (error) throw toAppError(error);
  },
  async updatePassword(password: string) {
    ensure();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw toAppError(error);
  },
  // حذف الحساب نهائيًا مع كل بياناته (شرط متجر Apple). الصور أولًا ثم الحساب.
  async deleteAccount(confirmWord: string) {
    ensure();
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw new AppError('AUTH', 'سجّل الدخول أولًا.');
    const bucket = supabase.storage.from('question-images');
    for (let i = 0; i < 50; i++) {
      const { data: files } = await bucket.list(u.user.id, { limit: 100 });
      if (!files?.length) break;
      const { data: gone, error } = await bucket.remove(files.map((f) => `${u.user!.id}/${f.name}`));
      if (error || !gone?.length) break;
    }
    const r = (await run(supabase.rpc('delete_my_account', { p_confirm: confirmWord }))) as { ok: boolean; error?: string };
    if (!r.ok) throw new AppError(r.error ?? 'FORBIDDEN');
    await supabase.auth.signOut().catch(() => {});
  },
};

// ---------- الملف والإعدادات ----------
export async function getProfile(): Promise<Profile> {
  const p = await run(supabase.from('profiles').select('*').maybeSingle());
  if (!p) throw new AppError('NOT_FOUND', 'لم يُعثر على ملف المعلم. سجّل الخروج ثم ادخل مجددًا.');
  const prof = p as Profile;
  return { ...prof, settings: { ...DEFAULT_SETTINGS, ...(prof.settings ?? {}) } };
}

export async function updateProfile(id: string, patch: { full_name?: string; school?: string; settings?: TeacherSettings }) {
  return run(supabase.from('profiles').update(patch).eq('id', id).select().single());
}

// ---------- المواد والصفوف ----------
export const subjects = {
  list: () => run(supabase.from('subjects').select('id,name').order('name')) as Promise<Subject[]>,
  create: (name: string) => run(supabase.from('subjects').insert({ name: name.trim() }).select('id,name').single()) as Promise<Subject>,
  remove: (id: string) => run(supabase.from('subjects').delete().eq('id', id)),
};
export const classes = {
  list: () => run(supabase.from('classes').select('id,name,grade').order('name')) as Promise<ClassGroup[]>,
  create: (name: string, grade: string) => run(supabase.from('classes').insert({ name: name.trim(), grade: grade.trim() }).select('id,name,grade').single()) as Promise<ClassGroup>,
  remove: (id: string) => run(supabase.from('classes').delete().eq('id', id)),
};

// ---------- بنك الأسئلة ----------
export interface QuestionFilters {
  search?: string;
  subject_id?: string;
  grade?: string;
  lesson?: string;
  type?: string;
  difficulty?: string;
  bloom?: string;
  domain?: string;
  favorites?: boolean;
  limit?: number;
}

const escLike = (s: string) => s.replace(/[%_,()*\\]/g, ' ').trim();

export async function listQuestions(f: QuestionFilters = {}): Promise<Question[]> {
  let q = supabase.from('questions').select('*, question_options(id,position,text,match_text,is_correct)').order('updated_at', { ascending: false }).limit(f.limit ?? 300);
  if (f.subject_id) q = q.eq('subject_id', f.subject_id);
  if (f.grade) q = q.eq('grade', f.grade);
  if (f.lesson) q = q.ilike('lesson', `%${escLike(f.lesson)}%`);
  if (f.type) q = q.eq('type', f.type);
  if (f.difficulty) q = q.eq('difficulty', f.difficulty);
  if (f.bloom) q = q.eq('bloom', f.bloom);
  if (f.domain) q = q.eq('domain', f.domain);
  if (f.favorites) q = q.eq('is_favorite', true);
  if (f.search?.trim()) {
    const s = escLike(f.search);
    if (s) q = q.or(`text.ilike.*${s}*,lesson.ilike.*${s}*,unit.ilike.*${s}*,skill.ilike.*${s}*,stimulus_text.ilike.*${s}*`);
  }
  const rows = (await run(q)) as Question[];
  for (const r of rows) r.question_options?.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  return rows;
}

export async function getQuestion(id: string): Promise<Question> {
  const r = (await run(supabase.from('questions').select('*, question_options(id,position,text,match_text,is_correct)').eq('id', id).maybeSingle())) as Question | null;
  if (!r) throw new AppError('NOT_FOUND');
  r.question_options?.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  return r;
}

export async function saveQuestion(input: QuestionInput): Promise<string> {
  const { options, ...q } = input;
  const payload = { ...q, subject_id: q.subject_id || null, image_url: q.image_url || null };
  return run(supabase.rpc('save_question', { p_question: payload, p_options: options.map((o) => ({ ...o, match_text: o.match_text || null })) })) as Promise<string>;
}

export const duplicateQuestion = (id: string) => run(supabase.rpc('duplicate_question', { p_question: id })) as Promise<string>;
export const deleteQuestion = (id: string) => run(supabase.from('questions').delete().eq('id', id));
export const setFavorite = (id: string, fav: boolean) => run(supabase.from('questions').update({ is_favorite: fav }).eq('id', id));

export async function uploadQuestionImage(file: File): Promise<string> {
  ensure();
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new AppError('IMAGE', 'نوع الصورة غير مدعوم (PNG أو JPG أو WEBP أو GIF).');
  if (file.size > 3 * 1024 * 1024) throw new AppError('IMAGE', 'حجم الصورة أكبر من 3 ميجابايت.');
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new AppError('AUTH', 'سجّل الدخول أولًا.');
  const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
  const path = `${u.user.id}/${uuid()}.${ext}`;
  const { error } = await supabase.storage.from('question-images').upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw toAppError(error);
  return supabase.storage.from('question-images').getPublicUrl(path).data.publicUrl;
}

// ---------- الحصص ----------
export interface NewSessionInput {
  title: string;
  class_id: string | null;
  subject_id: string | null;
  grade: string;
  unit: string;
  lesson: string;
  anonymous: boolean;
  hide_names: boolean;
  hide_results: boolean;
  leaderboard_enabled: boolean;
  teams_enabled: boolean;
  auto_approve_open: boolean;
  is_quick?: boolean;
  mode?: 'live' | 'self';
  game?: GameSettings;
}
export interface QueueItemInput {
  question_id: string;
  time_limit_seconds?: number | null;
  game_mode?: SessionQuestion['game_mode'];
  allow_retry?: boolean;
}

export async function createSession(input: NewSessionInput, items: QueueItemInput[], teamNames: { name: string; color: string }[]): Promise<Session> {
  const session = (await run(supabase.from('sessions').insert(input).select().single())) as Session;
  try {
    if (input.teams_enabled && teamNames.length) {
      await run(supabase.from('session_teams').insert(teamNames.map((t, i) => ({ session_id: session.id, name: t.name, color: t.color, position: i }))));
    }
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const row: Record<string, unknown> = { session_id: session.id, question_id: it.question_id, position: i + 1, game_mode: it.game_mode ?? 'none', allow_retry: it.allow_retry ?? false };
      if (it.time_limit_seconds !== undefined) row.time_limit_seconds = it.time_limit_seconds;
      await run(supabase.from('session_questions').insert(row));
    }
  } catch (e) {
    // لا نترك حصة ناقصة: نحذفها ونبلغ بالخطأ
    await supabase.from('sessions').delete().eq('id', session.id);
    throw e;
  }
  return session;
}

export const listSessions = (limit = 50) =>
  run(supabase.from('sessions').select('*').order('created_at', { ascending: false }).limit(limit)) as Promise<Session[]>;

export async function getSession(id: string): Promise<Session> {
  const s = (await run(supabase.from('sessions').select('*').eq('id', id).maybeSingle())) as Session | null;
  if (!s) throw new AppError('NOT_FOUND', 'الحصة غير موجودة أو لا تملك صلاحية الوصول إليها.');
  return s;
}

export const updateSession = (id: string, patch: Partial<Session>) => run(supabase.from('sessions').update(patch).eq('id', id));
export const deleteSession = (id: string) => run(supabase.from('sessions').delete().eq('id', id));

export const listSessionQuestions = (sessionId: string) =>
  run(supabase.from('session_questions').select('*').eq('session_id', sessionId).order('position')) as Promise<SessionQuestion[]>;
export const addSessionQuestion = (sessionId: string, questionId: string, extra: Partial<SessionQuestion> = {}) =>
  run(supabase.from('session_questions').insert({ session_id: sessionId, question_id: questionId, ...extra }).select().single()) as Promise<SessionQuestion>;
// سؤال فوري يُكتب مباشرة في الحصة دون حفظه في بنك الأسئلة
export const addInstantQuestion = (sessionId: string, snapshot: Snapshot) =>
  run(supabase.from('session_questions').insert({ session_id: sessionId, question_id: null, snapshot, points: 1, time_limit_seconds: null }).select().single()) as Promise<SessionQuestion>;
export const updateSessionQuestion = (id: string, patch: Partial<SessionQuestion>) =>
  run(supabase.from('session_questions').update(patch).eq('id', id));
export const removeSessionQuestion = (id: string) => run(supabase.from('session_questions').delete().eq('id', id).eq('status', 'draft'));

export const listParticipants = (sessionId: string) =>
  run(supabase.from('participants').select('id,session_id,display_name,alias,team_id,is_removed,avatar,joined_at,last_seen_at').eq('session_id', sessionId).order('joined_at')) as Promise<Participant[]>;
export const listResponses = (sessionId: string) =>
  run(supabase.from('responses').select('*').eq('session_id', sessionId)) as Promise<ResponseRow[]>;
export const listTeams = (sessionId: string) =>
  run(supabase.from('session_teams').select('*').eq('session_id', sessionId).order('position')) as Promise<Team[]>;
export const removeParticipant = (id: string, removed = true) => run(supabase.from('participants').update({ is_removed: removed }).eq('id', id));

// ---------- التحكم المباشر ----------
export const live = {
  push: (sqId: string, timeLimit: number | null | undefined = undefined) =>
    run(supabase.rpc('push_question', { p_sq: sqId, p_time_limit: timeLimit === undefined ? -1 : timeLimit === null ? 0 : timeLimit })),
  close: (sqId: string) => run(supabase.rpc('close_question', { p_sq: sqId })),
  reveal: (sqId: string, on = true) => run(supabase.rpc('reveal_answer', { p_sq: sqId, p_reveal: on })),
  reopen: (sqId: string, seconds: number | null) => run(supabase.rpc('reopen_question', { p_sq: sqId, p_seconds: seconds })),
  cancelTimer: (sqId: string) => run(supabase.rpc('cancel_timer', { p_sq: sqId })),
  drawLuck: (sqId: string) => run(supabase.rpc('draw_luck', { p_sq: sqId })) as Promise<number>,
  end: (sessionId: string) => run(supabase.rpc('end_session', { p_session: sessionId })),
  grade: (responseId: string, correct: boolean | null, ratio: number | null = null, feedback: string | null = null) =>
    run(supabase.rpc('grade_response', { p_response: responseId, p_correct: correct, p_ratio: ratio, p_feedback: feedback })),
  approve: (responseId: string, approved: boolean) => run(supabase.from('responses').update({ approved }).eq('id', responseId)),
  serverTime: () => run(supabase.rpc('server_time')) as Promise<string>,
};

// ---------- التقارير ----------
export const reports = {
  get: (sessionId: string) => run(supabase.from('reports').select('*').eq('session_id', sessionId).maybeSingle()) as Promise<Report | null>,
  save: (sessionId: string, summary: SessionSummary, notes?: string) =>
    run(supabase.from('reports').upsert({ session_id: sessionId, summary, ...(notes !== undefined ? { teacher_notes: notes } : {}) }, { onConflict: 'session_id' }).select().single()) as Promise<Report>,
  list: () => run(supabase.from('reports').select('id,session_id,summary,updated_at').order('updated_at', { ascending: false }).limit(200)) as Promise<Pick<Report, 'id' | 'session_id' | 'summary' | 'updated_at'>[]>,
};

export async function dashboardCounts() {
  const count = async (table: string) => {
    const { count: c, error } = await supabase.from(table).select('id', { count: 'exact', head: true });
    if (error) throw toAppError(error);
    return c ?? 0;
  };
  ensure();
  const [s, q, p] = await Promise.all([count('sessions'), count('questions'), count('participants')]);
  return { sessions: s, questions: q, participants: p };
}

// ---------- الطالب (بدون حساب) ----------
type StudentResult<T> = ({ ok: true } & T) | { ok: false; error: string };

export const student = {
  lookup: (code: string) =>
    run(supabase.rpc('session_lookup', { p_code: code })) as Promise<StudentResult<{ session: { title: string; code: string; status: string; anonymous: boolean; teams_enabled: boolean; teams: { id: string; name: string; color: string }[] } }>>,
  join: (code: string, name: string | null, team: string | null) =>
    run(supabase.rpc('join_session', { p_code: code, p_name: name, p_team: team })) as Promise<StudentResult<{ participant_id: string; token: string; session_id: string; code: string; alias: string; display_name: string }>>,
  state: (participantId: string, token: string) =>
    run(supabase.rpc('student_state', { p_participant: participantId, p_token: token })) as Promise<StudentState | { ok: false; error: string }>,
  submit: (participantId: string, token: string, sqId: string, answer: Answer, requestId: string) =>
    run(supabase.rpc('submit_response', { p_participant: participantId, p_token: token, p_sq: sqId, p_answer: answer, p_client_request_id: requestId })) as Promise<StudentResult<{ status: 'accepted' | 'duplicate' | 'updated'; submitted_at?: string }>>,
};

// ---------- «تحدي الكأس» ----------
export interface GamePlayerRow {
  participant_id: string; points: number; answered: number; correct: number; best_streak: number;
  shield_until: string | null; frozen_until: string | null; hearts: number; out_at: string | null; updated_at: string;
}
export interface GameEventRow { id: number; kind: string; actor_id: string | null; target_id: string | null; team_id: string | null; amount: number; created_at: string }

export const game = {
  // الطالب
  state: (participantId: string, token: string) =>
    run(supabase.rpc('game_state', { p_participant: participantId, p_token: token })) as Promise<GameState | { ok: false; error: string }>,
  submit: (participantId: string, token: string, sqId: string, answer: Answer, requestId: string) =>
    run(supabase.rpc('game_submit', { p_participant: participantId, p_token: token, p_sq: sqId, p_answer: answer, p_client_request_id: requestId })) as Promise<StudentResult<GameSubmitResult>>,
  roll: (participantId: string, token: string) =>
    run(supabase.rpc('game_roll', { p_participant: participantId, p_token: token })) as Promise<StudentResult<GameRollResult>>,
  usePower: (participantId: string, token: string, target: string | null, team: string | null) =>
    run(supabase.rpc('game_use_power', { p_participant: participantId, p_token: token, p_target: target, p_team: team })) as Promise<StudentResult<GamePowerResult>>,
  help: (participantId: string, token: string, sqId: string, kind: GameHelp) =>
    run(supabase.rpc('game_help', { p_participant: participantId, p_token: token, p_sq: sqId, p_kind: kind })) as Promise<StudentResult<GameHelpResult>>,
  buy: (participantId: string, token: string, item: ShopItem) =>
    run(supabase.rpc('game_buy', { p_participant: participantId, p_token: token, p_item: item })) as Promise<StudentResult<GameBuyResult>>,
  setAvatar: (participantId: string, token: string, avatar: string) =>
    run(supabase.rpc('set_avatar', { p_participant: participantId, p_token: token, p_avatar: avatar })) as Promise<StudentResult<{ avatar: string }>>,
  // المعلم
  start: (sessionId: string) => run(supabase.rpc('game_start', { p_session: sessionId })),
  end: (sessionId: string) => run(supabase.rpc('game_end', { p_session: sessionId })),
  players: (sessionId: string) =>
    run(supabase.from('game_players').select('participant_id,points,answered,correct,best_streak,shield_until,frozen_until,hearts,out_at,updated_at').eq('session_id', sessionId)) as Promise<GamePlayerRow[]>,
  events: (sessionId: string, limit = 12) =>
    run(supabase.from('game_events').select('id,kind,actor_id,target_id,team_id,amount,created_at').eq('session_id', sessionId).order('id', { ascending: false }).limit(limit)) as Promise<GameEventRow[]>,
};
export type { GameEvent };

// ---------- التحدي الذاتي: الطالب يختار الدرس ويبدأ بنفسه ----------
export interface PracticeLink { owner_id: string; code: string; enabled: boolean; is_public: boolean }
export interface PublicPractice { code: string; teacher: string }
export interface PracticePreview { teacher: string; lessons: { lesson: string; count: number }[]; rooms: { code: string; lesson: string; host: string | null; players: number }[] }
type JoinResult = { participant_id: string; token: string; session_id: string; code: string; alias: string; display_name: string };

const LINK_COLS = 'owner_id,code,enabled,is_public';

export const practice = {
  // المعلم
  myLink: () => run(supabase.from('practice_links').select(LINK_COLS).maybeSingle()) as Promise<PracticeLink | null>,
  createLink: () => run(supabase.from('practice_links').insert({ is_public: true }).select(LINK_COLS).single()) as Promise<PracticeLink>,
  setEnabled: (ownerId: string, enabled: boolean) => run(supabase.from('practice_links').update({ enabled }).eq('owner_id', ownerId).select(LINK_COLS).single()) as Promise<PracticeLink>,
  setPublic: (ownerId: string, isPublic: boolean) => run(supabase.from('practice_links').update({ is_public: isPublic }).eq('owner_id', ownerId).select(LINK_COLS).single()) as Promise<PracticeLink>,
  // الطالب
  publicList: () => run(supabase.rpc('practice_public')) as Promise<PublicPractice[]>,
  lookup: (code: string) => run(supabase.rpc('practice_lookup', { p_code: code })) as Promise<StudentResult<PracticePreview>>,
  start: (code: string, lesson: string, name: string, withFriends: boolean) =>
    run(supabase.rpc('practice_start', { p_code: code, p_lesson: lesson, p_name: name, p_with_friends: withFriends })) as Promise<StudentResult<JoinResult>>,
  begin: (participantId: string, token: string) => run(supabase.rpc('practice_begin', { p_participant: participantId, p_token: token })) as Promise<StudentResult<object>>,
};
