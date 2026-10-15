-- =====================================================================
-- نبض الفهم | «تحدي الكأس»: لعب ذاتي للطلاب بنقاط ورقم حظ وقدرات
-- الطالب يجيب بسرعته، ينتقل مباشرة للسؤال التالي، ويجمع النقاط.
-- كل حركة (إجابة، رمي رقم الحظ، استخدام قدرة) تُنفّذ على الخادم فقط.
-- =====================================================================

alter table public.sessions
  add column mode text not null default 'live' check (mode in ('live','self')),
  -- {"end":"time"|"target","minutes":10,"target":100,"powers":true,"prize":"..."}
  add column game jsonb not null default '{}'::jsonb,
  add column ends_at timestamptz,
  add column winner_id uuid references public.participants(id) on delete set null;

create table public.game_players (
  participant_id uuid primary key references public.participants(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  points int not null default 0 check (points >= 0),
  answered int not null default 0,
  correct int not null default 0,
  streak int not null default 0,
  best_streak int not null default 0,
  spins int not null default 0,
  power text check (power in ('take','freeze','raid','bomb')),
  double_next boolean not null default false,
  shield_until timestamptz,
  frozen_until timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);
create index game_players_s_idx on public.game_players(session_id, points desc);

create table public.game_events (
  id bigserial primary key,
  session_id uuid not null references public.sessions(id) on delete cascade,
  kind text not null,
  actor_id uuid references public.participants(id) on delete cascade,
  target_id uuid references public.participants(id) on delete set null,
  team_id uuid references public.session_teams(id) on delete set null,
  amount int not null default 0,
  created_at timestamptz not null default now()
);
create index game_events_s_idx on public.game_events(session_id, id desc);

alter table public.game_players enable row level security;
alter table public.game_events enable row level security;
create policy game_players_owner on public.game_players for select to authenticated using (public.is_session_owner(session_id));
create policy game_events_owner on public.game_events for select to authenticated using (public.is_session_owner(session_id));
revoke all on public.game_players, public.game_events from anon;
revoke insert, update on public.game_players, public.game_events from authenticated;

-- ---------- أدوات داخلية ----------
create or replace function public._game_points(s public.sessions)
returns int language sql immutable as $$ select 10 $$;

create or replace function public._game_over(s public.sessions)
returns boolean language sql stable as $$
  select s.status = 'ended' or (s.ends_at is not null and now() > s.ends_at)
$$;

-- إنهاء التحدي: تُغلق الأسئلة وتُكشف حتى تُحسب في التقرير
create or replace function public._game_finish(p_session uuid, p_winner uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.session_questions set status = 'closed', closed_at = coalesce(closed_at, now()), revealed = true
    where session_id = p_session and status <> 'closed';
  update public.session_questions set revealed = true where session_id = p_session and not revealed;
  update public.sessions set status = 'ended', ended_at = coalesce(ended_at, now()),
    winner_id = coalesce(winner_id, p_winner,
      (select g.participant_id from public.game_players g where g.session_id = p_session and g.points > 0 order by g.points desc, g.updated_at limit 1))
    where id = p_session and status <> 'ended';
end $$;

create or replace function public._game_player(p public.participants)
returns public.game_players language plpgsql security definer set search_path = public as $$
declare g public.game_players;
begin
  insert into public.game_players (participant_id, session_id) values (p.id, p.session_id)
    on conflict (participant_id) do nothing;
  select * into g from public.game_players where participant_id = p.id;
  return g;
end $$;

create or replace function public._shielded(g public.game_players)
returns boolean language sql stable as $$ select g.shield_until is not null and g.shield_until > now() $$;

-- السؤال التالي للطالب: أول سؤال لم يُجب عنه بترتيب عشوائي ثابت خاص به
create or replace function public._game_next(p public.participants)
returns public.session_questions language sql stable security definer set search_path = public as $$
  select sq.* from public.session_questions sq
  where sq.session_id = p.session_id and sq.status = 'open'
    and not exists (select 1 from public.responses r where r.sq_id = sq.id and r.participant_id = p.id)
  order by md5(sq.id::text || p.id::text)
  limit 1
$$;

create or replace function public._game_name(s public.sessions, pid uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when s.hide_names or s.anonymous then p.alias else p.display_name end from public.participants p where p.id = pid
$$;

-- نص الإجابة الصحيحة لعرضه بعد الإجابة مباشرة (لأسئلة الاختيار والقصيرة)
create or replace function public._correct_text(snap jsonb)
returns text language sql immutable as $$
  select case snap->>'answer_format'
    when 'single' then (select string_agg(e->>'text', '، ') from jsonb_array_elements(snap->'options') e where (e->>'is_correct')::boolean)
    when 'multi' then (select string_agg(e->>'text', '، ') from jsonb_array_elements(snap->'options') e where (e->>'is_correct')::boolean)
    when 'order' then (select string_agg(e->>'text', ' ← ' order by (e->>'position')::int) from jsonb_array_elements(snap->'options') e)
    when 'match' then (select string_agg((e->>'text') || ' = ' || (e->>'match_text'), '، ') from jsonb_array_elements(snap->'options') e)
    when 'short' then snap->'answer_key'->'accepted'->>0
    when 'blanks' then (select string_agg(b->>0, '، ') from jsonb_array_elements(snap->'answer_key'->'blanks') b)
    else null end
$$;


-- بلوغ النقاط المستهدفة يمنح الكأس وينهي التحدي
create or replace function public._game_check_target(s public.sessions, pid uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_target int := nullif(s.game->>'target', '')::int; pts int;
begin
  if s.game->>'end' <> 'target' or v_target is null then return false; end if;
  select points into pts from public.game_players where participant_id = pid;
  if pts is null or pts < v_target then return false; end if;
  insert into public.game_events (session_id, kind, actor_id, amount) values (s.id, 'trophy', pid, pts);
  perform public._game_finish(s.id, pid);
  return true;
end $$;

-- ---------- حالة اللاعب ----------
create or replace function public.game_state(p_participant uuid, p_token text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  p public.participants; s public.sessions; g public.game_players; sq public.session_questions;
  snap jsonb; fmt text; opts jsonb := '[]'::jsonb; rights jsonb; qj jsonb := null;
  total int; done int; my_rank int; board jsonb; teams jsonb; events jsonb;
begin
  select * into p from public._participant(p_participant, p_token);
  if p.id is null then return jsonb_build_object('ok', false, 'error', 'INVALID_PARTICIPANT'); end if;
  if p.is_removed then return jsonb_build_object('ok', false, 'error', 'REMOVED'); end if;
  select * into s from public.sessions where id = p.session_id;
  if s.mode <> 'self' then return jsonb_build_object('ok', false, 'error', 'NOT_A_GAME'); end if;
  if s.status = 'live' and public._game_over(s) then
    perform public._game_finish(s.id);
    select * into s from public.sessions where id = p.session_id;
  end if;
  update public.participants set last_seen_at = now() where id = p.id and last_seen_at < now() - interval '10 seconds';
  g := public._game_player(p);

  select count(*) into total from public.session_questions where session_id = s.id;
  select count(*) into done from public.responses r join public.session_questions x on x.id = r.sq_id
    where r.participant_id = p.id and x.session_id = s.id;

  if s.status = 'live' then
    sq := public._game_next(p);
    if sq.id is not null then
      snap := sq.snapshot; fmt := snap->>'answer_format';
      if fmt in ('single','multi') then
        select coalesce(jsonb_agg(jsonb_build_object('id', e->>'id', 'text', e->>'text') order by (e->>'position')::int), '[]') into opts from jsonb_array_elements(snap->'options') e;
      elsif fmt in ('order','match') then
        select coalesce(jsonb_agg(jsonb_build_object('id', e->>'id', 'text', e->>'text') order by md5((e->>'id') || p.id::text)), '[]') into opts from jsonb_array_elements(snap->'options') e;
        if fmt = 'match' then
          select coalesce(jsonb_agg(m order by md5(m || p.id::text)), '[]') into rights
            from (select distinct e->>'match_text' as m from jsonb_array_elements(snap->'options') e) d;
        end if;
      end if;
      qj := jsonb_build_object('sq_id', sq.id, 'number', done + 1, 'total', total, 'type', snap->>'type', 'answer_format', fmt,
        'text', snap->>'text', 'stimulus_kind', snap->>'stimulus_kind', 'stimulus_text', snap->>'stimulus_text',
        'stimulus_source', snap->>'stimulus_source', 'image_url', snap->>'image_url', 'hint', snap->>'hint',
        'options', opts, 'right_items', rights, 'blank_count', public.blank_count(snap->>'text'),
        'time_limit_seconds', null, 'opened_at', sq.opened_at, 'closes_at', null, 'allow_retry', false, 'revealed', false,
        'game_mode', 'none', 'points', public._game_points(s), 'for_team', null, 'can_answer', true, 'correct', null,
        'explanation', null, 'my_response', null);
    end if;
  end if;

  select rk into my_rank from (
    select participant_id, rank() over (order by points desc) rk from public.game_players where session_id = s.id
  ) x where participant_id = p.id;

  select coalesce(jsonb_agg(b order by (b->>'points')::int desc, b->>'at'), '[]') into board from (
    select jsonb_build_object('id', gp.participant_id, 'name', public._game_name(s, gp.participant_id),
      'points', gp.points, 'team', t.name, 'team_id', t.id, 'color', t.color,
      'shield', public._shielded(gp), 'frozen', gp.frozen_until is not null and gp.frozen_until > now(),
      'me', gp.participant_id = p.id, 'at', gp.updated_at) b
    from public.game_players gp
    join public.participants pp on pp.id = gp.participant_id and not pp.is_removed
    left join public.session_teams t on t.id = pp.team_id
    where gp.session_id = s.id
  ) z;

  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color,
      'points', coalesce((select sum(gp.points) from public.game_players gp join public.participants pp on pp.id = gp.participant_id
                         where pp.team_id = t.id and not pp.is_removed), 0),
      'mine', t.id = p.team_id) order by t.position), '[]') into teams
    from public.session_teams t where t.session_id = s.id;

  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'amount', e.amount,
      'actor', public._game_name(s, e.actor_id), 'target', public._game_name(s, e.target_id),
      'team', (select name from public.session_teams where id = e.team_id), 'at', e.created_at) order by e.id desc), '[]')
    into events from (select * from public.game_events where session_id = s.id order by id desc limit 8) e;

  return jsonb_build_object('ok', true, 'server_time', now(),
    'session', jsonb_build_object('id', s.id, 'title', s.title, 'code', s.code, 'status', s.status, 'mode', s.mode,
      'game', s.game, 'started_at', s.started_at, 'ends_at', s.ends_at,
      'winner', case when s.winner_id is null then null else jsonb_build_object('id', s.winner_id, 'name', public._game_name(s, s.winner_id)) end),
    'me', jsonb_build_object('id', p.id, 'name', public._game_name(s, p.id), 'points', g.points, 'rank', my_rank,
      'answered', done, 'total', total, 'correct', g.correct, 'streak', g.streak, 'spins', g.spins, 'power', g.power,
      'double_next', g.double_next, 'shield_until', g.shield_until, 'frozen_until', g.frozen_until, 'team_id', p.team_id,
      'finished', s.status = 'live' and sq.id is null),
    'question', qj, 'board', board, 'teams', teams, 'events', events);
end $$;

-- ---------- الإجابة ----------
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

  return jsonb_build_object('ok', true, 'status', 'accepted', 'correct', gr.is_correct, 'gain', gain, 'points', g.points,
    'spin_earned', spin_earned, 'won', won,
    'correct_text', case when gr.is_correct then null else public._correct_text(sq.snapshot) end,
    'explanation', sq.snapshot->>'explanation');
end $$;

-- ---------- رقم الحظ ----------
-- 1 كنز +5 · 2 مضاعف ×2 · 3 خذ نقاطًا من زميل · 4 درع 90 ثانية · 5 أخذ من مجموعة (أو تجميد زميل) · 6 قصف مجموعة (أو كنز كبير +15)
create or replace function public.game_roll(p_participant uuid, p_token text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare p public.participants; s public.sessions; g public.game_players; n int; kind text; has_teams boolean; amt int := 0;
begin
  select * into p from public._participant(p_participant, p_token);
  if p.id is null then return jsonb_build_object('ok', false, 'error', 'INVALID_PARTICIPANT'); end if;
  select * into s from public.sessions where id = p.session_id;
  if s.status <> 'live' or public._game_over(s) then return jsonb_build_object('ok', false, 'error', 'GAME_OVER'); end if;
  select * into g from public.game_players where participant_id = p.id for update;
  if g.participant_id is null or g.spins < 1 then return jsonb_build_object('ok', false, 'error', 'NO_SPINS'); end if;
  if g.power is not null then return jsonb_build_object('ok', false, 'error', 'USE_POWER_FIRST'); end if;
  has_teams := s.teams_enabled and p.team_id is not null
    and exists (select 1 from public.session_teams t where t.session_id = s.id and t.id <> p.team_id);
  n := 1 + floor(random() * 6)::int;
  kind := case n
    when 1 then 'treasure' when 2 then 'double' when 3 then 'take' when 4 then 'shield'
    when 5 then case when has_teams then 'raid' else 'freeze' end
    else case when has_teams then 'bomb' else 'big_treasure' end end;
  update public.game_players set spins = spins - 1,
    points = points + case kind when 'treasure' then 5 when 'big_treasure' then 15 else 0 end,
    double_next = double_next or kind = 'double',
    shield_until = case when kind = 'shield' then now() + interval '90 seconds' else shield_until end,
    power = case when kind in ('take','freeze','raid','bomb') then kind else null end,
    updated_at = now()
  where participant_id = p.id returning * into g;
  amt := case kind when 'treasure' then 5 when 'big_treasure' then 15 else 0 end;
  insert into public.game_events (session_id, kind, actor_id, amount) values (s.id, 'roll_' || kind, p.id, n);
  return jsonb_build_object('ok', true, 'number', n, 'kind', kind, 'amount', amt, 'points', g.points, 'spins', g.spins, 'power', g.power,
    'won', public._game_check_target(s, p.id));
end $$;

-- ---------- استخدام القدرة ----------
create or replace function public.game_use_power(p_participant uuid, p_token text, p_target uuid default null, p_team uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  p public.participants; s public.sessions; g public.game_players; tg public.game_players; tp public.participants;
  took int := 0; hit int := 0; blocked int := 0; m record;
begin
  select * into p from public._participant(p_participant, p_token);
  if p.id is null then return jsonb_build_object('ok', false, 'error', 'INVALID_PARTICIPANT'); end if;
  select * into s from public.sessions where id = p.session_id;
  if s.status <> 'live' or public._game_over(s) then return jsonb_build_object('ok', false, 'error', 'GAME_OVER'); end if;
  select * into g from public.game_players where participant_id = p.id for update;
  if g.participant_id is null or g.power is null then return jsonb_build_object('ok', false, 'error', 'NO_POWER'); end if;

  if g.power in ('take','freeze') then
    select * into tp from public.participants where id = p_target and session_id = s.id and not is_removed;
    if tp.id is null or tp.id = p.id then return jsonb_build_object('ok', false, 'error', 'INVALID_TARGET'); end if;
    tg := public._game_player(tp);
    select * into tg from public.game_players where participant_id = tp.id for update;
    if public._shielded(tg) then
      insert into public.game_events (session_id, kind, actor_id, target_id) values (s.id, 'blocked_' || g.power, p.id, tp.id);
      update public.game_players set power = null, updated_at = now() where participant_id = p.id;
      return jsonb_build_object('ok', true, 'result', 'blocked');
    end if;
    if g.power = 'take' then
      took := least(10, tg.points);
      update public.game_players set points = points - took, updated_at = now() where participant_id = tp.id;
      update public.game_players set points = points + took, power = null, updated_at = now() where participant_id = p.id;
      insert into public.game_events (session_id, kind, actor_id, target_id, amount) values (s.id, 'take', p.id, tp.id, took);
    else
      update public.game_players set frozen_until = now() + interval '15 seconds', updated_at = now() where participant_id = tp.id;
      update public.game_players set power = null, updated_at = now() where participant_id = p.id;
      insert into public.game_events (session_id, kind, actor_id, target_id, amount) values (s.id, 'freeze', p.id, tp.id, 15);
    end if;
  else
    if p_team is null or p_team = p.team_id or not exists (select 1 from public.session_teams where id = p_team and session_id = s.id) then
      return jsonb_build_object('ok', false, 'error', 'INVALID_TARGET');
    end if;
    for m in
      select gp.participant_id, gp.points, gp.shield_until from public.game_players gp
      join public.participants pp on pp.id = gp.participant_id and not pp.is_removed
      where pp.team_id = p_team for update of gp
    loop
      if m.shield_until is not null and m.shield_until > now() then blocked := blocked + 1; continue; end if;
      hit := least(case when g.power = 'raid' then 3 else 5 end, m.points);
      took := took + hit;
      update public.game_players set points = points - hit, updated_at = now() where participant_id = m.participant_id;
    end loop;
    update public.game_players set points = points + case when g.power = 'raid' then took else 0 end, power = null, updated_at = now()
      where participant_id = p.id;
    insert into public.game_events (session_id, kind, actor_id, team_id, amount) values (s.id, g.power, p.id, p_team, took);
  end if;

  select * into g from public.game_players where participant_id = p.id;
  return jsonb_build_object('ok', true, 'result', 'done', 'amount', took, 'blocked', blocked, 'points', g.points,
    'won', public._game_check_target(s, p.id));
end $$;

-- ---------- تحكم المعلم ----------
create or replace function public.game_start(p_session uuid)
returns void language plpgsql volatile set search_path = public as $$
declare s public.sessions; mins int; problem text; sq record;
begin
  select * into s from public.sessions where id = p_session for update;
  if s.id is null then raise exception 'NABD:NOT_FOUND'; end if;
  if s.mode <> 'self' then raise exception 'NABD:NOT_A_GAME'; end if;
  if s.status <> 'lobby' then return; end if;
  if not exists (select 1 from public.session_questions where session_id = s.id) then
    raise exception 'NABD:QUESTION_INCOMPLETE' using hint = 'أضف أسئلة إلى التحدي أولًا';
  end if;
  for sq in select id, snapshot, question_id from public.session_questions where session_id = s.id loop
    problem := public.question_problem(coalesce(public.build_snapshot(sq.question_id), sq.snapshot));
    if problem is not null then
      raise exception 'NABD:QUESTION_INCOMPLETE' using hint = problem || ': ' || left(sq.snapshot->>'text', 60);
    end if;
  end loop;
  update public.session_questions x set snapshot = coalesce(public.build_snapshot(x.question_id), x.snapshot),
    status = 'open', opened_at = now(), time_limit_seconds = null, closes_at = null, revealed = false
    where session_id = s.id;
  mins := nullif(s.game->>'minutes', '')::int;
  update public.sessions set status = 'live', started_at = now(),
    ends_at = case when s.game->>'end' = 'time' and mins is not null then now() + make_interval(mins => mins) end
    where id = s.id;
end $$;

create or replace function public.game_end(p_session uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.is_session_owner(p_session) then raise exception 'NABD:NOT_FOUND'; end if;
  perform public._game_finish(p_session);
end $$;


-- ---------- حالة الطالب: إضافة نوع الحصة حتى تعرف الواجهة أنها تحدٍّ ذاتي ----------
alter function public.student_state(uuid, text) rename to _student_state_live;
create function public.student_state(p_participant uuid, p_token text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare r jsonb; m text;
begin
  r := public._student_state_live(p_participant, p_token);
  if coalesce((r->>'ok')::boolean, false) then
    select mode into m from public.sessions where id = (r->'session'->>'id')::uuid;
    r := jsonb_set(r, '{session,mode}', to_jsonb(coalesce(m, 'live')));
  end if;
  return r;
end $$;

-- ---------- الصلاحيات ----------
revoke execute on function public._game_finish(uuid, uuid), public._game_player(public.participants), public._game_next(public.participants),
  public._game_name(public.sessions, uuid), public._game_over(public.sessions), public._game_points(public.sessions),
  public._shielded(public.game_players), public._correct_text(jsonb),
  public._game_check_target(public.sessions, uuid), public._student_state_live(uuid, text) from public, anon, authenticated;
grant execute on function public.student_state(uuid, text), public.game_state(uuid, text), public.game_submit(uuid, text, uuid, jsonb, uuid),
  public.game_roll(uuid, text), public.game_use_power(uuid, text, uuid, uuid) to anon, authenticated;
grant execute on function public.game_start(uuid), public.game_end(uuid) to authenticated;
revoke execute on function public.game_start(uuid), public.game_end(uuid) from public, anon;

alter publication supabase_realtime add table public.game_players, public.game_events;
