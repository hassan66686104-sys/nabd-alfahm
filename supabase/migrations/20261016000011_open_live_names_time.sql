-- =====================================================================
-- نبض الفهم | سؤال مفتوح فوري تظهر إجاباته على الشاشة مباشرة، واسم إجباري في التحديات،
-- وتحكم المعلم في وقت اللعبة (قبل البدء وأثناءه، وفي رابط التحديات الذاتية)
-- =====================================================================

-- ---------- السؤال المفتوح الفوري ----------
create or replace function public.grade_answer(snap jsonb, ans jsonb, out is_correct boolean, out ratio numeric, out needs_review boolean)
language plpgsql immutable as $$
declare
  fmt text := snap->>'answer_format';
  opts jsonb := coalesce(snap->'options', '[]'::jsonb);
  correct_ids text[];
  given text[];
  total int; ok int; i int;
  accepted text[];
  blanks jsonb;
begin
  needs_review := false;
  if fmt = 'single' and coalesce((snap->'answer_key'->>'poll')::boolean, false) then
    -- سؤال رأي: يُسجَّل الاختيار دون حكم بالصحة أو الخطأ
    is_correct := null; ratio := null;
  elsif fmt = 'single' then
    select array_agg(e->>'id') into correct_ids from jsonb_array_elements(opts) e where (e->>'is_correct')::boolean;
    is_correct := (ans->>'option_id') = any(coalesce(correct_ids, '{}'));
    ratio := case when is_correct then 1 else 0 end;
  elsif fmt = 'multi' then
    select coalesce(array_agg(e->>'id' order by e->>'id'), '{}') into correct_ids from jsonb_array_elements(opts) e where (e->>'is_correct')::boolean;
    select coalesce(array_agg(distinct v order by v), '{}') into given from jsonb_array_elements_text(ans->'option_ids') v;
    is_correct := correct_ids = given;
    ratio := case when is_correct then 1 else 0 end;
  elsif fmt = 'order' then
    select coalesce(array_agg(e->>'id' order by (e->>'position')::int), '{}') into correct_ids from jsonb_array_elements(opts) e;
    select coalesce(array_agg(v order by ord), '{}') into given from jsonb_array_elements_text(ans->'order') with ordinality as t(v, ord);
    is_correct := correct_ids = given;
    ratio := case when is_correct then 1 else 0 end;
  elsif fmt = 'match' then
    total := jsonb_array_length(opts);
    select count(*) into ok from jsonb_array_elements(opts) e
      where public.normalize_ar(ans->'pairs'->>(e->>'id')) = public.normalize_ar(e->>'match_text');
    is_correct := total > 0 and ok = total;
    ratio := case when total = 0 then 0 else round(ok::numeric / total, 4) end;
  elsif fmt = 'short' then
    select coalesce(array_agg(public.normalize_ar(v)), '{}') into accepted
      from jsonb_array_elements_text(coalesce(snap->'answer_key'->'accepted', '[]'::jsonb)) v;
    if cardinality(accepted) = 0 then
      is_correct := null; ratio := null; needs_review := true;
    else
      is_correct := public.normalize_ar(ans->>'text') = any(accepted);
      ratio := case when is_correct then 1 else 0 end;
      -- الإجابة غير المطابقة قد تكون صحيحة بصياغة أخرى؛ تبقى قابلة لمراجعة المعلم
      needs_review := not is_correct;
    end if;
  elsif fmt = 'blanks' then
    blanks := coalesce(snap->'answer_key'->'blanks', '[]'::jsonb);
    total := jsonb_array_length(blanks);
    if total = 0 then
      is_correct := null; ratio := null; needs_review := true;
    else
      ok := 0;
      for i in 0..total-1 loop
        select coalesce(array_agg(public.normalize_ar(v)), '{}') into accepted from jsonb_array_elements_text(blanks->i) v;
        if public.normalize_ar(ans->'blanks'->>i) = any(accepted) then ok := ok + 1; end if;
      end loop;
      is_correct := ok = total;
      ratio := round(ok::numeric / total, 4);
      needs_review := not is_correct;
    end if;
  else -- open
    -- السؤال المفتوح الفوري (رأي) لا يحتاج تصحيحًا: تظهر الإجابة على الشاشة فورًا
    is_correct := null; ratio := null; needs_review := not coalesce((snap->'answer_key'->>'poll')::boolean, false);
  end if;
end $$;

-- ---------- الاسم إجباري في كل التحديات ----------
create or replace function public._self_needs_names()
returns trigger language plpgsql as $$
begin
  if new.mode = 'self' then new.anonymous := false; end if;
  return new;
end $$;
create trigger sessions_self_names before insert or update of mode, anonymous on public.sessions
  for each row execute function public._self_needs_names();
update public.sessions set anonymous = false where mode = 'self' and anonymous and status <> 'ended';

-- ---------- وقت اللعبة ----------
alter table public.practice_links add column if not exists minutes int not null default 20 check (minutes between 1 and 120);

-- الوقت المحدد يُطبَّق في كل أنواع التحدي (في «من يصل أولًا» يصبح حدًا أقصى اختياريًا)
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
    ends_at = case when mins is not null and mins > 0 then now() + make_interval(mins => mins) end
    where id = s.id;
end $$;

-- المعلم يزيد وقت التحدي الجاري أو ينقصه بالدقائق
create or replace function public.game_add_time(p_session uuid, p_minutes int)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare s public.sessions; v_end timestamptz;
begin
  if not public.is_session_owner(p_session) then raise exception 'NABD:NOT_FOUND'; end if;
  if p_minutes is null or p_minutes = 0 or abs(p_minutes) > 120 then raise exception 'NABD:INVALID_TIME'; end if;
  select * into s from public.sessions where id = p_session for update;
  if s.mode <> 'self' then raise exception 'NABD:NOT_A_GAME'; end if;
  if s.status = 'lobby' then
    update public.sessions set game = game || jsonb_build_object('minutes',
      -- بلا وقت محدد: الضغط على «+5» يجعل المدة 5 دقائق
      least(120, greatest(1, coalesce(nullif(game->>'minutes', '')::int, 0) + p_minutes))) where id = s.id;
    return jsonb_build_object('ok', true);
  end if;
  if s.status <> 'live' then raise exception 'NABD:GAME_OVER'; end if;
  -- لا ينقص الوقت عن 10 ثوانٍ من الآن، ولا يزيد عن ساعتين
  v_end := least(now() + interval '120 minutes',
                 greatest(now() + interval '10 seconds', coalesce(s.ends_at, now()) + make_interval(mins => p_minutes)));
  update public.sessions set ends_at = v_end where id = s.id;
  return jsonb_build_object('ok', true, 'ends_at', v_end);
end $$;

create or replace function public.practice_start_many(p_code text, p_lessons text[], p_name text, p_with_friends boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare ip text := public.request_ip(); pl public.practice_links; s public.sessions; j jsonb; qid uuid; n int := 0;
  lessons text[]; label text;
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
  select array_agg(distinct btrim(x)) into lessons from unnest(coalesce(p_lessons, '{}')) x where btrim(x) <> '';
  if lessons is null or array_length(lessons, 1) > 12 then return jsonb_build_object('ok', false, 'error', 'LESSON_NOT_FOUND'); end if;
  if (select count(*) from public._practice_pool(pl.owner_id, lessons)) < 2 then
    return jsonb_build_object('ok', false, 'error', 'LESSON_NOT_FOUND');
  end if;
  label := left(array_to_string(lessons, ' + '), 160);

  insert into public.sessions (owner_id, title, lesson, mode, leaderboard_enabled, game)
  values (pl.owner_id, left('تحدي ذاتي: ' || label, 160), label, 'self', true,
          jsonb_build_object('end', 'all', 'minutes', coalesce(pl.minutes, 20), 'powers', true, 'practice', true))
  returning * into s;
  for qid in select x from public._practice_pool(pl.owner_id, lessons) x order by random()
             limit case when array_length(lessons, 1) > 1 then 40 else 30 end loop
    n := n + 1;
    insert into public.session_questions (session_id, question_id, position) values (s.id, qid, n);
  end loop;

  j := public.join_session(s.code, p_name, null);
  if not coalesce((j->>'ok')::boolean, false) then return j; end if;
  update public.sessions set game = game || jsonb_build_object('host', j->>'participant_id') where id = s.id;
  if not p_with_friends then perform public._game_begin(s.id); end if;
  return j;
end $$;

revoke execute on function public._self_needs_names() from public, anon, authenticated;
revoke execute on function public.game_add_time(uuid, int) from public, anon;
grant execute on function public.game_add_time(uuid, int) to authenticated;
grant execute on function public.practice_start_many(text, text[], text, boolean) to anon, authenticated;
