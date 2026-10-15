-- =====================================================================
-- نبض الفهم | تحدي الكأس: قلوب وعقوبات، وسائل مساعدة، متجر بالنقاط، وشخصيات
-- • لكل لاعب 3 قلوب: الخطأ يُفقده قلبًا و5 نقاط، ومن تنتهي قلوبه يخرج من اللعبة.
-- • وسائل المساعدة: حذف إجابتين، رأي الجمهور، تبديل السؤال (واحدة من كل نوع مجانًا).
-- • المتجر: يشتري الطالب بنقاطه وسائل إضافية أو قلبًا أو درعًا أو مضاعف النقاط.
-- • الشخصية: يختار الطالب شخصية (رياضي، كرتونية، سيارة) تظهر بجانب اسمه.
-- كل ذلك يُحسب على الخادم فقط؛ الطالب لا يرى الإجابة الصحيحة في أي وسيلة.
-- =====================================================================

alter table public.participants add column if not exists avatar text
  check (avatar is null or avatar ~ '^[a-z_]{2,20}$');

alter table public.game_players
  add column if not exists hearts int not null default 3 check (hearts between 0 and 9),
  add column if not exists out_at timestamptz,
  add column if not exists fifty int not null default 1 check (fifty >= 0),
  add column if not exists audience int not null default 1 check (audience >= 0),
  add column if not exists swaps int not null default 1 check (swaps >= 0),
  add column if not exists skipped uuid[] not null default '{}',
  add column if not exists fifty_sq uuid,
  add column if not exists fifty_hide jsonb not null default '[]'::jsonb,
  add column if not exists audience_sq uuid,
  add column if not exists audience_votes jsonb not null default '[]'::jsonb;

-- إعدادات التحدي (افتراضيًا مفعّلة): game.hearts عدد القلوب (0 = بلا قلوب)، game.helps وسائل المساعدة والمتجر
create or replace function public._game_hearts(s public.sessions)
returns int language sql immutable as $$ select greatest(0, least(9, coalesce(nullif(s.game->>'hearts', '')::int, 3))) $$;
create or replace function public._game_helps(s public.sessions)
returns boolean language sql immutable as $$ select coalesce((s.game->>'helps')::boolean, true) $$;
create or replace function public._game_penalty(s public.sessions)
returns int language sql immutable as $$ select case when public._game_hearts(s) = 0 then 0 else 5 end $$;

create or replace function public._game_avatars()
returns text[] language sql immutable as $$
  select array['striker','keeper','runner','swimmer','basket','tennis','karate','rider',
               'lion','robot','hero','ninja','astronaut','owl','panda','fox','dragon','unicorn','cat','falcon',
               'race','jeep','sport','police','fire','truck','bike','rocket']
$$;

-- اللاعب الجديد يبدأ بعدد القلوب المحدد في التحدي
create or replace function public._game_player(p public.participants)
returns public.game_players language plpgsql security definer set search_path = public as $$
declare g public.game_players; s public.sessions;
begin
  select * into s from public.sessions where id = p.session_id;
  insert into public.game_players (participant_id, session_id, hearts) values (p.id, p.session_id, public._game_hearts(s))
    on conflict (participant_id) do nothing;
  select * into g from public.game_players where participant_id = p.id;
  return g;
end $$;

-- السؤال التالي: أول سؤال لم يُجب عنه ولم يُبدَّل، بترتيب عشوائي ثابت خاص بالطالب
create or replace function public._game_next(p public.participants)
returns public.session_questions language sql stable security definer set search_path = public as $$
  select sq.* from public.session_questions sq
  where sq.session_id = p.session_id and sq.status = 'open'
    and not exists (select 1 from public.responses r where r.sq_id = sq.id and r.participant_id = p.id)
    and not (sq.id = any(coalesce((select g.skipped from public.game_players g where g.participant_id = p.id), '{}')))
  order by md5(sq.id::text || p.id::text)
  limit 1
$$;

-- الفائز: من بقي في اللعبة أولًا، ثم الأعلى نقاطًا
create or replace function public._game_finish(p_session uuid, p_winner uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.session_questions set status = 'closed', closed_at = coalesce(closed_at, now()), revealed = true
    where session_id = p_session and status <> 'closed';
  update public.session_questions set revealed = true where session_id = p_session and not revealed;
  update public.sessions set status = 'ended', ended_at = coalesce(ended_at, now()),
    winner_id = coalesce(winner_id, p_winner,
      (select g.participant_id from public.game_players g where g.session_id = p_session and g.points > 0
        order by (g.out_at is null) desc, g.points desc, g.updated_at limit 1))
    where id = p_session and status <> 'ended';
end $$;

-- ينتهي التحدي حين لا يبقى لاعب نشط لديه سؤال (أنهى أسئلته أو خرج)، أو خرج الجميع في أي نوع تحدٍّ
create or replace function public._game_maybe_finish(s public.sessions)
returns boolean language plpgsql security definer set search_path = public as $$
declare active boolean;
begin
  if s.status <> 'live' then return false; end if;
  select exists (
    select 1 from public.participants pp join public.game_players gp on gp.participant_id = pp.id
    where pp.session_id = s.id and not pp.is_removed and gp.out_at is null
      and (s.game->>'end' is distinct from 'all' or exists (
        select 1 from public.session_questions x where x.session_id = s.id and x.status = 'open'
          and not exists (select 1 from public.responses rr where rr.sq_id = x.id and rr.participant_id = pp.id)
          and not (x.id = any(gp.skipped))))
  ) into active;
  if not active then perform public._game_finish(s.id); return true; end if;
  return false;
end $$;

-- ---------- حالة اللاعب ----------
create or replace function public.game_state(p_participant uuid, p_token text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  p public.participants; s public.sessions; g public.game_players; sq public.session_questions;
  snap jsonb; fmt text; opts jsonb := '[]'::jsonb; rights jsonb; qj jsonb := null; hide jsonb := '[]'::jsonb; votes jsonb := null;
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
  select count(*) + coalesce(array_length(g.skipped, 1), 0) into done from public.responses r join public.session_questions x on x.id = r.sq_id
    where r.participant_id = p.id and x.session_id = s.id;

  if s.status = 'live' and g.out_at is null then
    sq := public._game_next(p);
    if sq.id is not null then
      snap := sq.snapshot; fmt := snap->>'answer_format';
      if g.fifty_sq = sq.id then hide := g.fifty_hide; end if;
      if g.audience_sq = sq.id then votes := g.audience_votes; end if;
      if fmt in ('single','multi') then
        select coalesce(jsonb_agg(jsonb_build_object('id', e->>'id', 'text', e->>'text') order by (e->>'position')::int), '[]') into opts
          from jsonb_array_elements(snap->'options') e where not (hide ? (e->>'id'));
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
        'explanation', null, 'my_response', null,
        'option_count', jsonb_array_length(coalesce(snap->'options', '[]'::jsonb)),
        'fifty_used', g.fifty_sq = sq.id, 'audience', votes);
    end if;
  end if;

  select rk into my_rank from (
    select participant_id, rank() over (order by points desc) rk from public.game_players where session_id = s.id
  ) x where participant_id = p.id;

  select coalesce(jsonb_agg(b order by (b->>'points')::int desc, b->>'at'), '[]') into board from (
    select jsonb_build_object('id', gp.participant_id, 'name', public._game_name(s, gp.participant_id),
      'points', gp.points, 'team', t.name, 'team_id', t.id, 'color', t.color,
      'shield', public._shielded(gp), 'frozen', gp.frozen_until is not null and gp.frozen_until > now(),
      'avatar', pp.avatar, 'out', gp.out_at is not null, 'hearts', gp.hearts,
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
      'winner', case when s.winner_id is null then null else jsonb_build_object('id', s.winner_id, 'name', public._game_name(s, s.winner_id),
        'avatar', (select avatar from public.participants where id = s.winner_id)) end),
    'me', jsonb_build_object('id', p.id, 'name', public._game_name(s, p.id), 'points', g.points, 'rank', my_rank,
      'answered', done, 'total', total, 'correct', g.correct, 'streak', g.streak, 'spins', g.spins, 'power', g.power,
      'double_next', g.double_next, 'shield_until', g.shield_until, 'frozen_until', g.frozen_until, 'team_id', p.team_id,
      'avatar', p.avatar, 'hearts', g.hearts, 'max_hearts', public._game_hearts(s), 'out', g.out_at is not null,
      'helps', jsonb_build_object('fifty', g.fifty, 'audience', g.audience, 'swap', g.swaps),
      'finished', s.status = 'live' and g.out_at is null and sq.id is null),
    'question', qj, 'board', board, 'teams', teams, 'events', events);
end $$;

-- ---------- الإجابة: نقاط للصحيحة، وعقوبة وقلب أقل للخاطئة ----------
create or replace function public.game_submit(p_participant uuid, p_token text, p_sq uuid, p_answer jsonb, p_client_request_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  p public.participants; s public.sessions; sq public.session_questions; g public.game_players; ex public.responses;
  gr record; gain int := 0; lost int := 0; won boolean := false; spin_earned boolean := false; out boolean := false; wrong boolean;
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
      select * into g from public.game_players where participant_id = p.id;
      return jsonb_build_object('ok', true, 'status', 'duplicate', 'correct', ex.is_correct, 'gain', coalesce(ex.score, 0)::int,
        'hearts', g.hearts, 'out', g.out_at is not null,
        'correct_text', public._correct_text(sq.snapshot), 'explanation', sq.snapshot->>'explanation');
    end if;
    return jsonb_build_object('ok', false, 'error', 'ALREADY_ANSWERED');
  end if;

  g := public._game_player(p);
  select * into g from public.game_players where participant_id = p.id for update;
  if g.out_at is not null then return jsonb_build_object('ok', false, 'error', 'OUT'); end if;
  if sq.id = any(g.skipped) then return jsonb_build_object('ok', false, 'error', 'QUESTION_NOT_FOUND'); end if;
  if g.frozen_until is not null and g.frozen_until > now() then
    return jsonb_build_object('ok', false, 'error', 'FROZEN', 'until', g.frozen_until);
  end if;
  if not public.answer_shape_ok(sq.snapshot, p_answer) then return jsonb_build_object('ok', false, 'error', 'INVALID_ANSWER'); end if;

  gr := public.grade_answer(sq.snapshot, p_answer);
  wrong := gr.is_correct = false;
  if gr.is_correct then
    gain := public._game_points(s) * case when g.double_next then 2 else 1 end;
  elsif gr.ratio is not null and gr.ratio > 0 then
    gain := round(public._game_points(s) * gr.ratio * 0.5);
  end if;
  if wrong then lost := least(public._game_penalty(s), g.points + gain); end if;

  insert into public.responses (session_id, sq_id, participant_id, answer, is_correct, score_ratio, score, needs_review, response_ms, client_request_id)
  values (s.id, sq.id, p.id, p_answer, gr.is_correct, gr.ratio, gain, gr.needs_review,
          greatest(0, (extract(epoch from (now() - coalesce(sq.opened_at, now()))) * 1000)::int), p_client_request_id)
  on conflict (sq_id, participant_id) do nothing;

  update public.game_players set
    points = points + gain - lost,
    answered = answered + 1,
    correct = correct + case when gr.is_correct then 1 else 0 end,
    streak = case when gr.is_correct then streak + 1 else 0 end,
    best_streak = greatest(best_streak, case when gr.is_correct then streak + 1 else 0 end),
    double_next = case when gr.is_correct or gr.is_correct = false then false else double_next end,
    spins = spins + case when coalesce((s.game->>'powers')::boolean, true) and gr.is_correct and (streak + 1) % 3 = 0 then 1 else 0 end,
    hearts = case when wrong and public._game_hearts(s) > 0 then greatest(0, hearts - 1) else hearts end,
    updated_at = now()
  where participant_id = p.id
  returning * into g;
  spin_earned := coalesce((s.game->>'powers')::boolean, true) and gr.is_correct and g.streak > 0 and g.streak % 3 = 0;
  if spin_earned then
    insert into public.game_events (session_id, kind, actor_id, amount) values (s.id, 'streak', p.id, g.streak);
  end if;
  -- انتهت القلوب: يخرج الطالب من اللعبة
  if wrong and public._game_hearts(s) > 0 and g.hearts = 0 then
    update public.game_players set out_at = now() where participant_id = p.id returning * into g;
    insert into public.game_events (session_id, kind, actor_id, amount) values (s.id, 'out', p.id, g.points);
    out := true;
  end if;

  won := public._game_check_target(s, p.id);
  if not won then perform public._game_maybe_finish(s); end if;

  return jsonb_build_object('ok', true, 'status', 'accepted', 'correct', gr.is_correct, 'gain', gain, 'lost', lost, 'points', g.points,
    'hearts', g.hearts, 'out', out, 'spin_earned', spin_earned, 'won', won,
    'correct_text', case when gr.is_correct then null else public._correct_text(sq.snapshot) end,
    'explanation', sq.snapshot->>'explanation');
end $$;

-- ---------- وسائل المساعدة ----------
create or replace function public.game_help(p_participant uuid, p_token text, p_sq uuid, p_kind text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  p public.participants; s public.sessions; g public.game_players; sq public.session_questions; nxt public.session_questions;
  snap jsonb; n int; keep text; hide jsonb; votes jsonb; correct_id text; left_pct int; others text[]; i int; share int;
begin
  select * into p from public._participant(p_participant, p_token);
  if p.id is null then return jsonb_build_object('ok', false, 'error', 'INVALID_PARTICIPANT'); end if;
  select * into s from public.sessions where id = p.session_id;
  if s.status <> 'live' or public._game_over(s) then return jsonb_build_object('ok', false, 'error', 'GAME_OVER'); end if;
  if not public._game_helps(s) then return jsonb_build_object('ok', false, 'error', 'HELPS_OFF'); end if;
  if p_kind not in ('fifty','audience','swap') then return jsonb_build_object('ok', false, 'error', 'INVALID_HELP'); end if;
  g := public._game_player(p);
  select * into g from public.game_players where participant_id = p.id for update;
  if g.out_at is not null then return jsonb_build_object('ok', false, 'error', 'OUT'); end if;
  -- الوسيلة تخص السؤال المعروض الآن فقط
  nxt := public._game_next(p);
  if nxt.id is null or nxt.id <> p_sq then return jsonb_build_object('ok', false, 'error', 'QUESTION_NOT_FOUND'); end if;
  sq := nxt; snap := sq.snapshot;
  if (p_kind = 'fifty' and g.fifty < 1) or (p_kind = 'audience' and g.audience < 1) or (p_kind = 'swap' and g.swaps < 1) then
    return jsonb_build_object('ok', false, 'error', 'NO_HELP');
  end if;

  if p_kind = 'swap' then
    update public.game_players set swaps = swaps - 1, skipped = array_append(skipped, sq.id), updated_at = now() where participant_id = p.id;
    insert into public.game_events (session_id, kind, actor_id) values (s.id, 'help_swap', p.id);
    perform public._game_maybe_finish(s);
    return jsonb_build_object('ok', true, 'kind', 'swap');
  end if;

  -- حذف إجابتين ورأي الجمهور لأسئلة الاختيار بإجابة واحدة فقط
  n := jsonb_array_length(coalesce(snap->'options', '[]'::jsonb));
  if snap->>'answer_format' <> 'single' or n < 3 then return jsonb_build_object('ok', false, 'error', 'HELP_NOT_FOR_QUESTION'); end if;
  select e->>'id' into correct_id from jsonb_array_elements(snap->'options') e where (e->>'is_correct')::boolean limit 1;

  if p_kind = 'fifty' then
    if g.fifty_sq = sq.id then return jsonb_build_object('ok', false, 'error', 'ALREADY_USED'); end if;
    select e->>'id' into keep from jsonb_array_elements(snap->'options') e where e->>'id' <> correct_id order by random() limit 1;
    select coalesce(jsonb_agg(e->>'id'), '[]') into hide from jsonb_array_elements(snap->'options') e
      where e->>'id' not in (correct_id, keep);
    update public.game_players set fifty = fifty - 1, fifty_sq = sq.id, fifty_hide = hide, updated_at = now() where participant_id = p.id;
    insert into public.game_events (session_id, kind, actor_id) values (s.id, 'help_fifty', p.id);
    return jsonb_build_object('ok', true, 'kind', 'fifty', 'hide', hide);
  end if;

  -- رأي الجمهور: جمهور افتراضي يميل غالبًا إلى الصواب ولا يضمنه (كما في المسابقات)
  if g.audience_sq = sq.id then return jsonb_build_object('ok', false, 'error', 'ALREADY_USED'); end if;
  select coalesce(array_agg(e->>'id' order by random()), '{}') into others from jsonb_array_elements(snap->'options') e
    where e->>'id' <> correct_id and not (case when g.fifty_sq = sq.id then g.fifty_hide else '[]'::jsonb end ? (e->>'id'));
  left_pct := 100 - (40 + floor(random() * 36)::int);
  votes := jsonb_build_array(jsonb_build_object('id', correct_id, 'pct', 100 - left_pct));
  for i in 1 .. coalesce(array_length(others, 1), 0) loop
    share := case when i = array_length(others, 1) then left_pct else floor(random() * (left_pct + 1))::int end;
    votes := votes || jsonb_build_object('id', others[i], 'pct', share);
    left_pct := left_pct - share;
  end loop;
  -- في حالات قليلة يتفوق خيار خاطئ، فالجمهور قد يخطئ
  if random() < 0.12 and array_length(others, 1) >= 1 then
    select coalesce(jsonb_agg(case when v->>'id' = correct_id then jsonb_build_object('id', v->>'id', 'pct', (select (x->>'pct')::int from jsonb_array_elements(votes) x where x->>'id' = others[1]))
                                   when v->>'id' = others[1] then jsonb_build_object('id', v->>'id', 'pct', (select (x->>'pct')::int from jsonb_array_elements(votes) x where x->>'id' = correct_id))
                                   else v end), '[]') into votes from jsonb_array_elements(votes) v;
  end if;
  select coalesce(jsonb_agg(v order by md5(v->>'id')), '[]') into votes from jsonb_array_elements(votes) v;
  update public.game_players set audience = audience - 1, audience_sq = sq.id, audience_votes = votes, updated_at = now() where participant_id = p.id;
  insert into public.game_events (session_id, kind, actor_id) values (s.id, 'help_audience', p.id);
  return jsonb_build_object('ok', true, 'kind', 'audience', 'votes', votes);
end $$;

-- ---------- المتجر: الشراء بالنقاط ----------
create or replace function public._game_price(p_item text)
returns int language sql immutable as $$
  select case p_item when 'fifty' then 20 when 'audience' then 15 when 'swap' then 15
    when 'heart' then 30 when 'shield' then 25 when 'double' then 20 end
$$;

create or replace function public.game_buy(p_participant uuid, p_token text, p_item text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare p public.participants; s public.sessions; g public.game_players; price int := public._game_price(p_item);
begin
  select * into p from public._participant(p_participant, p_token);
  if p.id is null then return jsonb_build_object('ok', false, 'error', 'INVALID_PARTICIPANT'); end if;
  select * into s from public.sessions where id = p.session_id;
  if s.status <> 'live' or public._game_over(s) then return jsonb_build_object('ok', false, 'error', 'GAME_OVER'); end if;
  if not public._game_helps(s) then return jsonb_build_object('ok', false, 'error', 'HELPS_OFF'); end if;
  if price is null then return jsonb_build_object('ok', false, 'error', 'INVALID_ITEM'); end if;
  g := public._game_player(p);
  select * into g from public.game_players where participant_id = p.id for update;
  if g.out_at is not null then return jsonb_build_object('ok', false, 'error', 'OUT'); end if;
  if p_item = 'heart' and (public._game_hearts(s) = 0 or g.hearts >= public._game_hearts(s) + 2) then
    return jsonb_build_object('ok', false, 'error', 'MAX_HEARTS');
  end if;
  if g.points < price then return jsonb_build_object('ok', false, 'error', 'NOT_ENOUGH_POINTS'); end if;
  update public.game_players set points = points - price,
    fifty = fifty + case when p_item = 'fifty' then 1 else 0 end,
    audience = audience + case when p_item = 'audience' then 1 else 0 end,
    swaps = swaps + case when p_item = 'swap' then 1 else 0 end,
    hearts = hearts + case when p_item = 'heart' then 1 else 0 end,
    shield_until = case when p_item = 'shield' then greatest(coalesce(shield_until, now()), now()) + interval '90 seconds' else shield_until end,
    double_next = double_next or p_item = 'double',
    updated_at = now()
  where participant_id = p.id returning * into g;
  insert into public.game_events (session_id, kind, actor_id, amount) values (s.id, 'buy_' || p_item, p.id, price);
  return jsonb_build_object('ok', true, 'item', p_item, 'price', price, 'points', g.points, 'hearts', g.hearts,
    'helps', jsonb_build_object('fifty', g.fifty, 'audience', g.audience, 'swap', g.swaps));
end $$;

-- ---------- الشخصية ----------
create or replace function public.set_avatar(p_participant uuid, p_token text, p_avatar text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare p public.participants;
begin
  select * into p from public._participant(p_participant, p_token);
  if p.id is null then return jsonb_build_object('ok', false, 'error', 'INVALID_PARTICIPANT'); end if;
  if p_avatar is not null and not (p_avatar = any(public._game_avatars())) then return jsonb_build_object('ok', false, 'error', 'INVALID_AVATAR'); end if;
  update public.participants set avatar = p_avatar where id = p.id;
  return jsonb_build_object('ok', true, 'avatar', p_avatar);
end $$;

-- ---------- الصلاحيات ----------
revoke execute on function public._game_hearts(public.sessions), public._game_helps(public.sessions), public._game_penalty(public.sessions),
  public._game_avatars(), public._game_maybe_finish(public.sessions), public._game_price(text) from public, anon, authenticated;
grant execute on function public.game_help(uuid, text, uuid, text), public.game_buy(uuid, text, text), public.set_avatar(uuid, text, text) to anon, authenticated;
