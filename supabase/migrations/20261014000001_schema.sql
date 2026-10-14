-- =====================================================================
-- نبض الفهم | المخطط الأساسي لقاعدة البيانات
-- الجداول، الأنواع، القيود، والفهارس
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- الأنواع ----------
create type public.question_type as enum (
  'mcq',               -- اختيار من متعدد
  'true_false',        -- صح أو خطأ
  'multi_select',      -- اختيار أكثر من إجابة صحيحة
  'short_answer',      -- إجابة قصيرة
  'open_ended',        -- سؤال مفتوح
  'fill_blank',        -- إكمال الفراغ
  'ordering',          -- ترتيب الخطوات أو الأحداث
  'matching',          -- توصيل العناصر المتناظرة
  'image_based',       -- سؤال يعتمد على صورة
  'text_based',        -- سؤال يعتمد على نص أو آية أو حديث
  'reasoning',         -- تعليل وتفسير
  'critical_thinking', -- تفكير ناقد
  'life_situation',    -- موقف حياتي يتطلب قرارًا
  'exit_ticket'        -- سؤال خروج من الحصة
);

-- صيغة الإجابة التي يتعامل بها الطالب والمصحح الآلي
create type public.answer_format as enum ('single','multi','short','open','blanks','order','match');
create type public.bloom_level as enum ('remember','understand','apply','analyze','evaluate','create');
create type public.difficulty_level as enum ('easy','medium','hard');
create type public.session_status as enum ('lobby','live','ended');
create type public.sq_status as enum ('draft','open','closed');
create type public.game_mode as enum ('none','five_seconds','survival','golden','team','streak','surprise','luck','exit');

-- الصيغ المسموحة لكل نوع سؤال
create or replace function public.format_allowed(t public.question_type, f public.answer_format)
returns boolean language sql immutable as $$
  select case t
    when 'mcq' then f = 'single'
    when 'true_false' then f = 'single'
    when 'multi_select' then f = 'multi'
    when 'short_answer' then f = 'short'
    when 'open_ended' then f = 'open'
    when 'fill_blank' then f = 'blanks'
    when 'ordering' then f = 'order'
    when 'matching' then f = 'match'
    when 'reasoning' then f in ('open','short','single')
    when 'critical_thinking' then f in ('open','short','single')
    when 'exit_ticket' then f in ('open','short','single','multi')
    else f in ('single','multi','short','open') -- image_based, text_based, life_situation
  end
$$;

-- ---------- ملفات المعلمين ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  school text not null default '' check (char_length(school) <= 160),
  settings jsonb not null default '{"mastery":80,"reinforce":50,"default_time":30,"hide_names":false,"anonymous":false}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- المواد والصفوف ----------
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  grade text not null default '' check (char_length(grade) <= 60),
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);

-- ---------- بنك الأسئلة ----------
create table public.questions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  type public.question_type not null,
  answer_format public.answer_format not null,
  text text not null check (char_length(btrim(text)) between 1 and 4000),
  -- النص المرجعي (آية/حديث/نص) يُحفظ كما أدخله المعلم حرفيًا دون أي معالجة
  stimulus_kind text not null default 'none' check (stimulus_kind in ('none','ayah','hadith','text')),
  stimulus_text text check (stimulus_text is null or char_length(stimulus_text) <= 6000),
  stimulus_source text check (stimulus_source is null or char_length(stimulus_source) <= 300),
  image_url text check (image_url is null or image_url ~* '^https?://'),
  subject_id uuid references public.subjects(id) on delete set null,
  grade text not null default '' check (char_length(grade) <= 60),
  unit text not null default '' check (char_length(unit) <= 120),
  lesson text not null default '' check (char_length(lesson) <= 160),
  domain text not null default '' check (char_length(domain) <= 80),
  difficulty public.difficulty_level not null default 'medium',
  bloom public.bloom_level not null default 'understand',
  skill text not null default '' check (char_length(skill) <= 160),
  points numeric(6,2) not null default 1 check (points >= 0 and points <= 1000),
  time_limit_seconds int check (time_limit_seconds is null or time_limit_seconds between 5 and 3600),
  hint text check (hint is null or char_length(hint) <= 1000),
  explanation text check (explanation is null or char_length(explanation) <= 2000),
  -- مفتاح الإجابة للأنواع غير القائمة على الخيارات:
  -- short: {"accepted":["..."]}  blanks: {"blanks":[["..",".."],["..."]]}
  answer_key jsonb not null default '{}'::jsonb,
  template_key text,
  tags text[] not null default '{}',
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint questions_format_ok check (public.format_allowed(type, answer_format)),
  constraint questions_stimulus_ok check (stimulus_kind = 'none' or char_length(btrim(coalesce(stimulus_text,''))) > 0)
);
create index questions_owner_idx on public.questions(owner_id, created_at desc);
create index questions_filter_idx on public.questions(owner_id, subject_id, grade, lesson);

create table public.question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  position int not null check (position between 0 and 19),
  text text not null check (char_length(btrim(text)) between 1 and 1000),
  match_text text check (match_text is null or char_length(match_text) <= 1000), -- الطرف المقابل في أسئلة التوصيل
  is_correct boolean not null default false,
  unique (question_id, position) deferrable initially deferred
);
create index question_options_q_idx on public.question_options(question_id);

-- ---------- الحصص ----------
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  class_id uuid references public.classes(id) on delete set null,
  subject_id uuid references public.subjects(id) on delete set null,
  grade text not null default '',
  unit text not null default '',
  lesson text not null default '',
  code text not null unique,
  status public.session_status not null default 'lobby',
  anonymous boolean not null default false,       -- الطلاب ينضمون دون أسماء
  hide_names boolean not null default false,      -- عرض أسماء مستعارة على شاشة العرض
  hide_results boolean not null default true,     -- إخفاء النتائج على شاشة العرض حتى إغلاق السؤال
  leaderboard_enabled boolean not null default false,
  teams_enabled boolean not null default false,
  auto_approve_open boolean not null default false, -- اعتماد الإجابات المفتوحة تلقائيًا للعرض العام
  is_quick boolean not null default false,
  current_sq_id uuid,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz
);
create index sessions_owner_idx on public.sessions(owner_id, created_at desc);

create table public.session_teams (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  color text not null default '#0f5132' check (color ~ '^#[0-9a-fA-F]{6}$'),
  position int not null default 0,
  unique (session_id, name)
);

create table public.session_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  question_id uuid references public.questions(id) on delete set null,
  position int not null default 0,
  status public.sq_status not null default 'draft',
  -- نسخة مجمدة من السؤال وقت الإرسال؛ تضمن ثبات التقارير حتى لو عُدّل السؤال في البنك
  snapshot jsonb not null,
  time_limit_seconds int check (time_limit_seconds is null or time_limit_seconds between 3 and 3600),
  points numeric(6,2) not null default 1 check (points >= 0),
  game_mode public.game_mode not null default 'none',
  multiplier numeric(4,2) not null default 1 check (multiplier between 0 and 10),
  team_id uuid references public.session_teams(id) on delete set null,
  allow_retry boolean not null default false,
  revealed boolean not null default false,
  opened_at timestamptz,
  closes_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);
create index session_questions_s_idx on public.session_questions(session_id, position);

alter table public.sessions
  add constraint sessions_current_sq_fk foreign key (current_sq_id)
  references public.session_questions(id) on delete set null;

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  alias text not null,
  team_id uuid references public.session_teams(id) on delete set null,
  token_hash text not null,
  is_removed boolean not null default false,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (session_id, alias)
);
create index participants_s_idx on public.participants(session_id);

create table public.responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  sq_id uuid not null references public.session_questions(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  answer jsonb not null,
  is_correct boolean,            -- null = بانتظار تصحيح المعلم
  score_ratio numeric(5,4),      -- نسبة الدرجة 0..1 (تسمح بإعادة الحساب عند تغيير المضاعف)
  score numeric(8,2),
  needs_review boolean not null default false,
  graded_by_teacher boolean not null default false,
  teacher_feedback text check (teacher_feedback is null or char_length(teacher_feedback) <= 1000),
  approved boolean not null default false,  -- اعتماد الإجابة المفتوحة للعرض العام
  flagged boolean not null default false,   -- قد تحتوي معلومات شخصية
  response_ms int,
  attempts int not null default 1,
  client_request_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sq_id, participant_id)            -- منع الإجابات المكررة
);
create index responses_s_idx on public.responses(session_id);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.sessions(id) on delete cascade,
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  summary jsonb not null default '{}'::jsonb,
  teacher_notes text not null default '' check (char_length(teacher_notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- إشارات خفيفة يستمع لها الطلاب لمعرفة أن حالة الحصة تغيّرت (لا تحتوي بيانات حساسة)
create table public.session_signals (
  session_id uuid primary key references public.sessions(id) on delete cascade,
  version bigint not null default 0,
  updated_at timestamptz not null default now()
);

-- محاولات الدخول لتقييد التخمين
create table public.join_attempts (
  id bigserial primary key,
  ip text not null,
  success boolean not null,
  created_at timestamptz not null default now()
);
create index join_attempts_ip_idx on public.join_attempts(ip, created_at desc);
