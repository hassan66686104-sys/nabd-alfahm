-- =====================================================================
-- نبض الفهم | التحدي الذاتي: الطالب يختار الدرس ويبدأ وحده أو مع زميل
-- يفعّل المعلم مرة واحدة «رابط التحديات»، فيرى الطلاب دروس بنكه ويلعبون دون تدخله.
-- الأسئلة تبقى ملك المعلم، والتصحيح والنقاط على الخادم فقط، والنتائج تصل إلى تقاريره.
-- =====================================================================

create or replace function public.gen_practice_code()
returns text language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea; c text; i int;
begin
  loop
    bytes := extensions.gen_random_bytes(6);
    c := '';
    for i in 0..5 loop c := c || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1); end loop;
    exit when not exists (select 1 from public.practice_links where code = c);
  end loop;
  return c;
end $$;

create table public.practice_links (
  owner_id uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  code text not null unique,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.practice_links alter column code set default public.gen_practice_code();
alter table public.practice_links enable row level security;
create policy practice_links_owner on public.practice_links for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
revoke all on public.practice_links from anon;

-- الأسئلة الصالحة للعب الذاتي: تُصحَّح آليًا، وليست استطلاع رأي، ومكتملة
create or replace function public._practice_questions(p_owner uuid, p_lesson text)
returns setof uuid language sql stable security definer set search_path = public as $$
  select q.id from public.questions q
  where q.owner_id = p_owner and btrim(q.lesson) = btrim(p_lesson) and btrim(q.lesson) <> ''
    and q.answer_format <> 'open' and not coalesce((q.answer_key->>'poll')::boolean, false)
    and public.question_problem(public.build_snapshot(q.id)) is null
$$;

-- بدء اللعب: فتح كل الأسئلة مع حد أقصى للمدة حتى لا يبقى التحدي مفتوحًا
create or replace function public._game_begin(p_session uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.session_questions set status = 'open', opened_at = now(), time_limit_seconds = null, closes_at = null, revealed = false
    where session_id = p_session;
  update public.sessions set status = 'live', started_at = now(),
    ends_at = now() + make_interval(mins => coalesce(nullif(game->>'minutes', '')::int, 20))
    where id = p_session and status = 'lobby';
end $$;

-- معاينة رابط التحديات: دروس المعلم وتحديات الزملاء التي تنتظر لاعبين
create or replace function public.practice_lookup(p_code text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare ip text := public.request_ip(); pl public.practice_links; teacher text; lessons jsonb; rooms jsonb;
begin
  if public._too_many_failures(ip) then return jsonb_build_object('ok', false, 'error', 'RATE_LIMITED'); end if;
  select * into pl from public.practice_links where code = public._clean_code(p_code) and enabled;
  if pl.owner_id is null then
    insert into public.join_attempts(ip, success) values (ip, false);
    return jsonb_build_object('ok', false, 'error', 'INVALID_CODE');
  end if;
  select full_name into teacher from public.profiles where id = pl.owner_id;
  select coalesce(jsonb_agg(jsonb_build_object('lesson', l, 'count', n) order by l), '[]') into lessons from (
    select btrim(q.lesson) l, count(*) n from public.questions q
    where q.owner_id = pl.owner_id and btrim(q.lesson) <> '' and q.answer_format <> 'open'
      and not coalesce((q.answer_key->>'poll')::boolean, false) and public.question_problem(public.build_snapshot(q.id)) is null
    group by btrim(q.lesson) having count(*) >= 2
  ) x;
  select coalesce(jsonb_agg(jsonb_build_object('code', s.code, 'lesson', s.lesson,
      'host', (select display_name from public.participants where id::text = s.game->>'host'),
      'players', (select count(*) from public.participants where session_id = s.id and not is_removed)) order by s.created_at desc), '[]')
    into rooms
    from public.sessions s
    where s.owner_id = pl.owner_id and s.mode = 'self' and s.status = 'lobby' and coalesce((s.game->>'practice')::boolean, false)
      and s.created_at > now() - interval '20 minutes';
  return jsonb_build_object('ok', true, 'teacher', coalesce(nullif(teacher, ''), 'المعلم'), 'lessons', lessons, 'rooms', rooms);
end $$;

-- الطالب يبدأ تحديًا: وحده (يبدأ فورًا) أو مع زملاء (غرفة انتظار برمز يشاركه)
create or replace function public.practice_start(p_code text, p_lesson text, p_name text, p_with_friends boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare ip text := public.request_ip(); pl public.practice_links; s public.sessions; j jsonb; qid uuid; n int := 0;
begin
  if public._too_many_failures(ip) then return jsonb_build_object('ok', false, 'error', 'RATE_LIMITED'); end if;
  if (select count(*) from public.join_attempts a where a.ip = public.request_ip() and a.success and a.created_at > now() - interval '10 minutes') >= 60 then
    return jsonb_build_object('ok', false, 'error', 'RATE_LIMITED');
  end if;
  select * into pl from public.practice_links where code = public._clean_code(p_code) and enabled;
  if pl.owner_id is null then
    insert into public.join_attempts(ip, success) values (ip, false);
    return jsonb_build_object('ok', false, 'error', 'INVALID_CODE');
  end if;
  if char_length(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'))) not between 2 and 40 then
    return jsonb_build_object('ok', false, 'error', 'NAME_REQUIRED');
  end if;
  if (select count(*) from public._practice_questions(pl.owner_id, p_lesson)) < 2 then
    return jsonb_build_object('ok', false, 'error', 'LESSON_NOT_FOUND');
  end if;

  insert into public.sessions (owner_id, title, lesson, mode, leaderboard_enabled, game)
  values (pl.owner_id, left('تحدي ذاتي: ' || btrim(p_lesson), 160), left(btrim(p_lesson), 160), 'self', true,
          jsonb_build_object('end', 'all', 'minutes', 20, 'powers', true, 'practice', true))
  returning * into s;
  for qid in select x from public._practice_questions(pl.owner_id, p_lesson) x order by random() limit 30 loop
    n := n + 1;
    insert into public.session_questions (session_id, question_id, position) values (s.id, qid, n);
  end loop;

  j := public.join_session(s.code, p_name, null);
  if not coalesce((j->>'ok')::boolean, false) then return j; end if;
  update public.sessions set game = game || jsonb_build_object('host', j->>'participant_id') where id = s.id;
  if not p_with_friends then perform public._game_begin(s.id); end if;
  return j;
end $$;

-- صاحب الغرفة يبدأ التحدي حين يجتمع زملاؤه
create or replace function public.practice_begin(p_participant uuid, p_token text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare p public.participants; s public.sessions;
begin
  select * into p from public._participant(p_participant, p_token);
  if p.id is null then return jsonb_build_object('ok', false, 'error', 'INVALID_PARTICIPANT'); end if;
  select * into s from public.sessions where id = p.session_id for update;
  if s.mode <> 'self' or s.game->>'host' is distinct from p.id::text then return jsonb_build_object('ok', false, 'error', 'FORBIDDEN'); end if;
  if s.status <> 'lobby' then return jsonb_build_object('ok', true); end if;
  perform public._game_begin(s.id);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.game_submit(p_participant uuid, p_token text, p_sq uuid, p_answer jsonb, p_client_request_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  p public.participants; s public.sessions; sq public.session_questions; g public.game_players; ex public.responses;
  gr record; gain int := 0; won boolean := false; spin_earned boolean := false;
begin
  select * into p from public._participant(p_participant, p_token);
  if p.id is null then return jsonb_build_object('ok', false, 'error', 'INVALID_PARTICIPANT'); end if;
  if p.is_removed then return jsonb_build_object('ok', false, 'error', 'REMOVED'); end if;
  select * into s from public.sessions where id = p.session_id;
  if s.mode <> 'self' then return jsonb_build_object('ok', false, 'error', 'NOT_A_GAME'); end if;
  if s.status = 'live' and public._game_over(s) then perform public._game_finish(s.id); return jsonb_build_object('ok', false, 'error', 'GAME_OVER'); end if;
  if s.status <> 'live' then return jsonb_build_object('ok', false, 'error', case when s.status = 'ended' then 'GAME_OVER' else 'GAME_NOT_STARTED' end); end if;
  select * into sq from public.session_questions where id = p_sq and session_id = s.id and status = 'open';
  if sq.id is null then return jsonb_build_object('ok', false, 'error', 'QUESTION_NOT_FOUND'); end if;

  select * into ex from public.responses where sq_id = sq.id and participant_id = p.id;
  if ex.id is not null then
    if p_client_request_id is not null and ex.client_request_id = p_client_request_id then
      return jsonb_build_object('ok', true, 'status', 'duplicate', 'correct', ex.is_correct, 'gain', coalesce(ex.score, 0)::int,
        'correct_text', public._correct_text(sq.snapshot), 'explanation', sq.snapshot->>'explanation');
    end if;
    return jsonb_build_object('ok', false, 'error', 'ALREADY_ANSWERED');
  end if;

  g := public._game_player(p);
  select * into g from public.game_players where participant_id = p.id for update;
  if g.frozen_until is not null and g.frozen_until > now() then
    return jsonb_build_object('ok', false, 'error', 'FROZEN', 'until', g.frozen_until);
  end if;
  if not public.answer_shape_ok(sq.snapshot, p_answer) then return jsonb_build_object('ok', false, 'error', 'INVALID_ANSWER'); end if;

  gr := public.grade_answer(sq.snapshot, p_answer);
  if gr.is_correct then
    gain := public._game_points(s) * case when g.double_next then 2 else 1 end;
  elsif gr.ratio is not null and gr.ratio > 0 then
    gain := round(public._game_points(s) * gr.ratio * 0.5);
  end if;

  insert into public.responses (session_id, sq_id, participant_id, answer, is_correct, score_ratio, score, needs_review, response_ms, client_request_id)
  values (s.id, sq.id, p.id, p_answer, gr.is_correct, gr.ratio, gain, gr.needs_review,
          greatest(0, (extract(epoch from (now() - coalesce(sq.opened_at, now()))) * 1000)::int), p_client_request_id)
  on conflict (sq_id, participant_id) do nothing;

  update public.game_players set
    points = points + gain,
    answered = answered + 1,
    correct = correct + case when gr.is_correct then 1 else 0 end,
    streak = case when gr.is_correct then streak + 1 else 0 end,
    best_streak = greatest(best_streak, case when gr.is_correct then streak + 1 else 0 end),
    double_next = case when gr.is_correct or gr.is_correct = false then false else double_next end,
    spins = spins + case when coalesce((s.game->>'powers')::boolean, true) and gr.is_correct and (streak + 1) % 3 = 0 then 1 else 0 end,
    updated_at = now()
  where participant_id = p.id
  returning * into g;
  spin_earned := coalesce((s.game->>'powers')::boolean, true) and gr.is_correct and g.streak > 0 and g.streak % 3 = 0;
  if spin_earned then
    insert into public.game_events (session_id, kind, actor_id, amount) values (s.id, 'streak', p.id, g.streak);
  end if;

  won := public._game_check_target(s, p.id);
  -- التحدي الذاتي ينتهي حين يُنهي كل اللاعبين أسئلة الدرس
  if not won and s.game->>'end' = 'all' and not exists (
    select 1 from public.participants pp
    where pp.session_id = s.id and not pp.is_removed
      and exists (select 1 from public.session_questions x where x.session_id = s.id and x.status = 'open'
                  and not exists (select 1 from public.responses rr where rr.sq_id = x.id and rr.participant_id = pp.id))
  ) then
    perform public._game_finish(s.id);
  end if;

  return jsonb_build_object('ok', true, 'status', 'accepted', 'correct', gr.is_correct, 'gain', gain, 'points', g.points,
    'spin_earned', spin_earned, 'won', won,
    'correct_text', case when gr.is_correct then null else public._correct_text(sq.snapshot) end,
    'explanation', sq.snapshot->>'explanation');
end $$;

revoke execute on function public._practice_questions(uuid, text), public._game_begin(uuid), public.gen_practice_code() from public, anon, authenticated;
grant execute on function public.gen_practice_code() to authenticated;
grant execute on function public.practice_lookup(text), public.practice_start(text, text, text, boolean), public.practice_begin(uuid, text) to anon, authenticated;
grant select, insert, update on public.practice_links to authenticated;
