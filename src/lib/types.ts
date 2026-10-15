export type QuestionType =
  | 'mcq' | 'true_false' | 'multi_select' | 'short_answer' | 'open_ended' | 'fill_blank' | 'ordering'
  | 'matching' | 'image_based' | 'text_based' | 'reasoning' | 'critical_thinking' | 'life_situation' | 'exit_ticket';
export type AnswerFormat = 'single' | 'multi' | 'short' | 'open' | 'blanks' | 'order' | 'match';
export type Bloom = 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type StimulusKind = 'none' | 'ayah' | 'hadith' | 'text';
export type SessionStatus = 'lobby' | 'live' | 'ended';
export type SqStatus = 'draft' | 'open' | 'closed';
export type GameMode = 'none' | 'five_seconds' | 'survival' | 'golden' | 'team' | 'streak' | 'surprise' | 'luck' | 'exit';

export interface AnswerKey {
  accepted?: string[];
  blanks?: string[][];
  poll?: boolean; // سؤال رأي بلا إجابة صحيحة (الأسئلة الفورية)
}

export interface QuestionOption {
  id?: string;
  position?: number;
  text: string;
  match_text?: string | null;
  is_correct: boolean;
}

export interface Question {
  id: string;
  owner_id: string;
  type: QuestionType;
  answer_format: AnswerFormat;
  text: string;
  stimulus_kind: StimulusKind;
  stimulus_text: string | null;
  stimulus_source: string | null;
  image_url: string | null;
  subject_id: string | null;
  grade: string;
  unit: string;
  lesson: string;
  domain: string;
  difficulty: Difficulty;
  bloom: Bloom;
  skill: string;
  points: number;
  time_limit_seconds: number | null;
  hint: string | null;
  explanation: string | null;
  answer_key: AnswerKey;
  template_key: string | null;
  tags: string[];
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
  question_options?: QuestionOption[];
}

export interface SnapshotOption {
  id: string;
  position: number;
  text: string;
  match_text: string | null;
  is_correct: boolean;
}

export interface Snapshot {
  question_id: string | null;
  type: QuestionType;
  answer_format: AnswerFormat;
  text: string;
  stimulus_kind: StimulusKind;
  stimulus_text: string | null;
  stimulus_source: string | null;
  image_url: string | null;
  hint: string | null;
  explanation: string | null;
  bloom: Bloom;
  difficulty: Difficulty;
  skill: string;
  unit: string;
  lesson: string;
  domain: string;
  answer_key: AnswerKey;
  options: SnapshotOption[];
}

export interface Subject { id: string; name: string }
export interface ClassGroup { id: string; name: string; grade: string }

export interface Session {
  id: string;
  owner_id: string;
  title: string;
  class_id: string | null;
  subject_id: string | null;
  grade: string;
  unit: string;
  lesson: string;
  code: string;
  status: SessionStatus;
  anonymous: boolean;
  hide_names: boolean;
  hide_results: boolean;
  leaderboard_enabled: boolean;
  teams_enabled: boolean;
  auto_approve_open: boolean;
  is_quick: boolean;
  current_sq_id: string | null;
  mode: 'live' | 'self';
  game: GameSettings;
  ends_at: string | null;
  winner_id: string | null;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
}

export interface Team { id: string; session_id: string; name: string; color: string; position: number }

export interface SessionQuestion {
  id: string;
  session_id: string;
  question_id: string | null;
  position: number;
  status: SqStatus;
  snapshot: Snapshot;
  time_limit_seconds: number | null;
  points: number;
  game_mode: GameMode;
  multiplier: number;
  team_id: string | null;
  allow_retry: boolean;
  revealed: boolean;
  opened_at: string | null;
  closes_at: string | null;
  closed_at: string | null;
  created_at: string;
}

export interface Participant {
  id: string;
  session_id: string;
  display_name: string;
  alias: string;
  team_id: string | null;
  is_removed: boolean;
  joined_at: string;
  last_seen_at: string;
}

export interface Answer {
  option_id?: string;
  option_ids?: string[];
  order?: string[];
  pairs?: Record<string, string>;
  text?: string;
  blanks?: string[];
}

export interface ResponseRow {
  id: string;
  session_id: string;
  sq_id: string;
  participant_id: string;
  answer: Answer;
  is_correct: boolean | null;
  score_ratio: number | null;
  score: number | null;
  needs_review: boolean;
  graded_by_teacher: boolean;
  teacher_feedback: string | null;
  approved: boolean;
  flagged: boolean;
  response_ms: number | null;
  attempts: number;
  created_at: string;
  updated_at: string;
}

export interface TeacherSettings {
  mastery: number;
  reinforce: number;
  default_time: number | null;
  hide_names: boolean;
  anonymous: boolean;
}

export interface Profile {
  id: string;
  full_name: string;
  school: string;
  settings: TeacherSettings;
}

export interface Report {
  id: string;
  session_id: string;
  summary: import('./stats').SessionSummary;
  teacher_notes: string;
  created_at: string;
  updated_at: string;
}

// ما يصل للطالب من دالة student_state
export interface StudentQuestion {
  sq_id: string;
  number: number;
  status: SqStatus;
  type: QuestionType;
  answer_format: AnswerFormat;
  text: string;
  stimulus_kind: StimulusKind;
  stimulus_text: string | null;
  stimulus_source: string | null;
  image_url: string | null;
  hint: string | null;
  options: { id: string; text: string }[];
  right_items: string[] | null;
  blank_count: number;
  time_limit_seconds: number | null;
  opened_at: string | null;
  closes_at: string | null;
  allow_retry: boolean;
  revealed: boolean;
  game_mode: GameMode;
  points: number;
  for_team: string | null;
  can_answer: boolean;
  correct: { option_ids?: string[]; order?: string[]; pairs?: Record<string, string>; accepted?: string[]; blanks?: string[][] } | null;
  explanation: string | null;
  my_response: {
    answer: Answer;
    submitted_at: string;
    attempts: number;
    is_correct: boolean | null;
    score: number | null;
    feedback: string | null;
  } | null;
}

export interface StudentState {
  ok: true;
  server_time: string;
  session: { id: string; title: string; code: string; status: SessionStatus; anonymous: boolean; leaderboard_enabled: boolean; mode?: 'live' | 'self' };
  me: { id: string; alias: string; display_name: string; team: { id: string; name: string; color: string } | null; points: number | null };
  question: StudentQuestion | null;
}

// ---------- «تحدي الكأس»: لعب ذاتي ----------
export interface GameSettings {
  end?: 'time' | 'target' | 'all';
  practice?: boolean; // تحدٍّ بدأه الطالب بنفسه
  host?: string; // معرّف الطالب صاحب الغرفة
  minutes?: number;
  target?: number;
  powers?: boolean;
  prize?: string;
}
export type GamePower = 'take' | 'freeze' | 'raid' | 'bomb';

export interface GameEvent {
  id: number;
  kind: string;
  amount: number;
  actor: string | null;
  target: string | null;
  team: string | null;
  at: string;
}
export interface GameBoardRow {
  id: string;
  name: string;
  points: number;
  team: string | null;
  team_id: string | null;
  color: string | null;
  shield: boolean;
  frozen: boolean;
  me?: boolean;
  answered?: number;
  correct?: number;
}
export interface GameTeamRow { id: string; name: string; color: string; points: number; mine?: boolean }

export interface GameState {
  ok: true;
  server_time: string;
  session: { id: string; title: string; code: string; status: SessionStatus; mode: 'self'; game: GameSettings; started_at: string | null; ends_at: string | null; winner: { id: string; name: string } | null };
  me: {
    id: string; name: string; points: number; rank: number | null; answered: number; total: number; correct: number; streak: number;
    spins: number; power: GamePower | null; double_next: boolean; shield_until: string | null; frozen_until: string | null; team_id: string | null; finished: boolean;
  };
  question: Omit<StudentQuestion, 'status'> & { total: number } | null;
  board: GameBoardRow[];
  teams: GameTeamRow[];
  events: GameEvent[];
}

export interface GameSubmitResult { status: 'accepted' | 'duplicate'; correct: boolean | null; gain: number; points: number; spin_earned: boolean; won: boolean; correct_text: string | null; explanation: string | null }
export interface GameRollResult { number: number; kind: string; amount: number; points: number; spins: number; power: GamePower | null; won: boolean }
export interface GamePowerResult { result: 'done' | 'blocked'; amount?: number; blocked?: number; points?: number; won?: boolean }
