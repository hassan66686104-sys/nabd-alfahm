-- =====================================================================
-- نبض الفهم | الدوال والمشغلات
-- =====================================================================

-- ---------- أدوات عامة ----------

-- توحيد النص العربي للمقارنة في التصحيح الآلي (لا يُستخدم أبدًا لتعديل النص المحفوظ)
create or replace function public.normalize_ar(t text)
returns text language sql immutable as $$
  select btrim(regexp_replace(
    regexp_replace(
      translate(
        lower(regexp_replace(coalesce(t,''), '[ًٌٍَُِّْٰـ]', '', 'g')),
        'أإآٱةىؤئ٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
        'ااااهيوي01234567890123456789'
      ),
      '[[:punct:]،؛؟«»]', ' ', 'g'),
    '\s+', ' ', 'g'))
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger questions_touch before update on public.questions for each row execute function public.touch_updated_at();
create trigger responses_touch before update on public.responses for each row execute function public.touch_updated_at();
create trigger reports_touch before update on public.reports for each row execute function public.touch_updated_at();

-- إنشاء ملف المعلم تلقائيًا عند التسجيل
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- هل المستخدم الحالي مالك الحصة؟ (security definer لتجنب تكرار سياسات RLS)
create or replace function public.is_session_owner(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.sessions s where s.id = sid and s.owner_id = auth.uid())
$$;

-- رمز حصة عشوائي فريد من 6 أحرف (بدون الأحرف الملتبسة 0 O 1 I)
create or replace function public.gen_session_code()
returns text language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea;
  c text;
  i int;
begin
  loop
    bytes := extensions.gen_random_bytes(6);
    c := '';
    for i in 0..5 loop
      c := c || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.sessions where code = c);
  end loop;
  return c;
end $$;

alter table public.sessions alter column code set default public.gen_session_code();

-- عنوان IP للطالب (يمرره PostgREST في ترويسات الطلب)
create or replace function public.request_ip()
returns text language plpgsql stable as $$
declare h json; v text;
begin
  begin
    h := current_setting('request.headers', true)::json;
  exception when others then
    h := null;
  end;
  v := coalesce(h->>'cf-connecting-ip', split_part(coalesce(h->>'x-forwarded-for', ''), ',', 1), h->>'x-real-ip');
  return coalesce(nullif(btrim(v), ''), 'unknown');
end $$;

-- ---------- إشارات المزامنة للطلاب ----------
create or replace function public.bump_signal()
returns trigger language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  if tg_table_name = 'sessions' then
    sid := new.id;
  else
    sid := new.session_id;
  end if;
  insert into public.session_signals (session_id, version, updated_at)
  values (sid, 1, now())
  on conflict (session_id) do update set version = public.session_signals.version + 1, updated_at = now();
  return new;
end $$;

create trigger sessions_signal after insert or update on public.sessions
  for each row execute function public.bump_signal();
create trigger sq_signal after update on public.session_questions
  for each row execute function public.bump_signal();

-- ---------- لقطة السؤال ----------
create or replace function public.build_snapshot(qid uuid)
returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object(
    'question_id', q.id,
    'type', q.type,
    'answer_format', q.answer_format,
    'text', q.text,
    'stimulus_kind', q.stimulus_kind,
    'stimulus_text', q.stimulus_text,
    'stimulus_source', q.stimulus_source,
    'image_url', q.image_url,
    'hint', q.hint,
    'explanation', q.explanation,
    'bloom', q.bloom,
    'difficulty', q.difficulty,
    'skill', q.skill,
    'unit', q.unit,
    'lesson', q.lesson,
    'domain', q.domain,
    'answer_key', q.answer_key,
    'options', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'position', o.position, 'text', o.text,
        'match_text', o.match_text, 'is_correct', o.is_correct) order by o.position)
      from public.question_options o where o.question_id = q.id), '[]'::jsonb)
  )
  from public.questions q where q.id = qid
$$;

-- يملأ اللقطة والإعدادات الافتراضية عند إضافة سؤال من البنك إلى حصة
create or replace function public.sq_before_insert()
returns trigger language plpgsql set search_path = public as $$
declare q public.questions; s_owner uuid;
begin
  if new.question_id is not null then
    select owner_id into s_owner from public.sessions where id = new.session_id;
    select * into q from public.questions where id = new.question_id;
    if q.id is null or q.owner_id is distinct from s_owner then
      raise exception 'NABD:FORBIDDEN' using hint = 'لا يمكن استخدام سؤال لا تملكه';
    end if;
    if new.snapshot is null or new.snapshot = '{}'::jsonb then
      new.snapshot := public.build_snapshot(new.question_id);
      new.points := coalesce(q.points, new.points);
    end if;
  end if;
  if new.snapshot is null then
    raise exception 'NABD:QUESTION_INCOMPLETE' using hint = 'بيانات السؤال ناقصة';
  end if;
  if new.position = 0 then
    select coalesce(max(position), 0) + 1 into new.position from public.session_questions where session_id = new.session_id;
  end if;
  return new;
end $$;

create trigger sq_fill before insert on public.session_questions
  for each row execute function public.sq_before_insert();

-- ---------- التحقق من اكتمال السؤال ----------
create or replace function public.blank_count(t text)
returns int language sql immutable as $$
  select count(*)::int from regexp_matches(coalesce(t,''), '_{3,}', 'g')
$$;

create or replace function public.question_problem(snap jsonb)
returns text language plpgsql immutable as $$
declare
  fmt text := snap->>'answer_format';
  typ text := snap->>'type';
  opts jsonb := coalesce(snap->'options', '[]'::jsonb);
  n int := jsonb_array_length(coalesce(snap->'options', '[]'::jsonb));
  ncorrect int;
  nb int;
begin
  if char_length(btrim(coalesce(snap->>'text',''))) = 0 then
    return 'نص السؤال فارغ';
  end if;
  select count(*) into ncorrect from jsonb_array_elements(opts) e where (e->>'is_correct')::boolean;
  if fmt = 'single' then
    if typ = 'true_false' and n <> 2 then return 'سؤال الصح والخطأ يحتاج خيارين بالضبط'; end if;
    if n < 2 or n > 6 then return 'سؤال الاختيار يحتاج من 2 إلى 6 خيارات'; end if;
    if ncorrect <> 1 then return 'حدد إجابة صحيحة واحدة بالضبط'; end if;
  elsif fmt = 'multi' then
    if n < 2 or n > 8 then return 'سؤال الاختيار المتعدد يحتاج من 2 إلى 8 خيارات'; end if;
    if ncorrect < 1 then return 'حدد إجابة صحيحة واحدة على الأقل'; end if;
  elsif fmt = 'order' then
    if n < 2 or n > 10 then return 'سؤال الترتيب يحتاج من 2 إلى 10 عناصر'; end if;
  elsif fmt = 'match' then
    if n < 2 or n > 8 then return 'سؤال التوصيل يحتاج من 2 إلى 8 أزواج'; end if;
    if exists (select 1 from jsonb_array_elements(opts) e where char_length(btrim(coalesce(e->>'match_text',''))) = 0) then
      return 'أكمل الطرف المقابل لكل عنصر في سؤال التوصيل';
    end if;
  elsif fmt = 'blanks' then
    nb := public.blank_count(snap->>'text');
    if nb = 0 then return 'ضع فراغًا واحدًا على الأقل في نص السؤال باستخدام ___'; end if;
    if jsonb_typeof(snap->'answer_key'->'blanks') = 'array'
       and jsonb_array_length(snap->'answer_key'->'blanks') > 0
       and jsonb_array_length(snap->'answer_key'->'blanks') <> nb then
      return 'عدد الإجابات النموذجية لا يساوي عدد الفراغات';
    end if;
  end if;
  return null;
end $$;

-- ---------- التصحيح الآلي ----------
-- يعيد: is_correct (null = تصحيح يدوي)، ratio (0..1)، needs_review
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
  if fmt = 'single' then
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
    is_correct := null; ratio := null; needs_review := true;
  end if;
end $$;

-- التحقق من شكل الإجابة قبل حفظها
create or replace function public.answer_shape_ok(snap jsonb, ans jsonb)
returns boolean language plpgsql immutable as $$
declare fmt text := snap->>'answer_format'; ids text[]; n int;
begin
  if ans is null or jsonb_typeof(ans) <> 'object' or pg_column_size(ans) > 8000 then return false; end if;
  select array_agg(e->>'id') into ids from jsonb_array_elements(coalesce(snap->'options','[]'::jsonb)) e;
  ids := coalesce(ids, '{}');
  n := cardinality(ids);
  if fmt = 'single' then
    return (ans->>'option_id') = any(ids);
  elsif fmt = 'multi' then
    return jsonb_typeof(ans->'option_ids') = 'array'
      and jsonb_array_length(ans->'option_ids') between 1 and n
      and not exists (select 1 from jsonb_array_elements_text(ans->'option_ids') v where v <> all(ids));
  elsif fmt = 'order' then
    return jsonb_typeof(ans->'order') = 'array'
      and jsonb_array_length(ans->'order') = n
      and (select count(distinct v) from jsonb_array_elements_text(ans->'order') v where v = any(ids)) = n;
  elsif fmt = 'match' then
    return jsonb_typeof(ans->'pairs') = 'object'
      and not exists (select 1 from jsonb_object_keys(ans->'pairs') k where k <> all(ids));
  elsif fmt in ('short','open') then
    return jsonb_typeof(ans->'text') = 'string' and char_length(btrim(ans->>'text')) between 1 and 1500;
  elsif fmt = 'blanks' then
    return jsonb_typeof(ans->'blanks') = 'array'
      and jsonb_array_length(ans->'blanks') between 1 and 20
      and not exists (select 1 from jsonb_array_elements(ans->'blanks') v where jsonb_typeof(v) <> 'string' or char_length(v #>> '{}') > 300);
  end if;
  return false;
end $$;

-- =====================================================================
-- واجهة الطالب (بدون حساب): دوال security definer بأقل صلاحيات
-- =====================================================================

create or replace function public._participant(p_participant uuid, p_token text)
returns public.participants language sql stable security definer set search_path = public, extensions as $$
  select p.* from public.participants p
  where p.id = p_participant
    and p_token is not null
    and p.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
$$;

create or replace function public._too_many_failures(p_ip text)
returns boolean language sql stable security definer set search_path = public as $$
  select count(*) >= 20 from public.join_attempts
  where ip = p_ip and not success and created_at > now() - interval '10 minutes'
$$;

create or replace function public._clean_code(p_code text)
returns text language sql immutable as $$
  select regexp_replace(upper(translate(coalesce(p_code,''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789')), '[^A-Z0-9]', '', 'g')
$$;

-- معاينة الحصة قبل الانضمام
create or replace function public.session_lookup(p_code text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare ip text := public.request_ip(); s public.sessions;
begin
  if public._too_many_failures(ip) then
    return jsonb_build_object('ok', false, 'error', 'RATE_LIMITED');
  end if;
  select * into s from public.sessions where code = public._clean_code(p_code);
  if s.id is null then
    insert into public.join_attempts(ip, success) values (ip, false);
    return jsonb_build_object('ok', false, 'error', 'INVALID_CODE');
  end if;
  if s.status = 'ended' then
    return jsonb_build_object('ok', false, 'error', 'SESSION_ENDED');
  end if;
  return jsonb_build_object('ok', true, 'session', jsonb_build_object(
    'title', s.title, 'code', s.code, 'status', s.status, 'anonymous', s.anonymous,
    'teams_enabled', s.teams_enabled,
    'teams', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color) order by t.position)
                       from public.session_teams t where t.session_id = s.id), '[]'::jsonb)));
end $$;

-- الانضمام إلى حصة
create or replace function public.join_session(p_code text, p_name text default null, p_team uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  ip text := public.request_ip();
  s public.sessions;
  pseudonyms constant text[] := array['نخلة','نجمة','قمر','صقر','غيمة','وردة','شمس','لؤلؤة','غزال','زيتونة','قلم','كتاب','نهر','جبل','سنبلة','بوصلة','فنار','ياسمين','مرجان','واحة','سحابة','نسمة','ريشة','منارة'];
  cnt int;
  v_alias text;
  v_name text;
  v_team uuid;
  v_token text;
  v_id uuid;
  tries int := 0;
begin
  if random() < 0.02 then
    delete from public.join_attempts where created_at < now() - interval '1 day';
  end if;
  if public._too_many_failures(ip) then
    return jsonb_build_object('ok', false, 'error', 'RATE_LIMITED');
  end if;
  select * into s from public.sessions where code = public._clean_code(p_code);
  if s.id is null then
    insert into public.join_attempts(ip, success) values (ip, false);
    return jsonb_build_object('ok', false, 'error', 'INVALID_CODE');
  end if;
  if s.status = 'ended' then
    return jsonb_build_object('ok', false, 'error', 'SESSION_ENDED');
  end if;
  select count(*) into cnt from public.participants where session_id = s.id;
  if cnt >= 400 then
    return jsonb_build_object('ok', false, 'error', 'SESSION_FULL');
  end if;

  if s.teams_enabled then
    if p_team is not null then
      select id into v_team from public.session_teams where id = p_team and session_id = s.id;
      if v_team is null then
        return jsonb_build_object('ok', false, 'error', 'INVALID_TEAM');
      end if;
    else
      select t.id into v_team from public.session_teams t
        left join public.participants p on p.team_id = t.id
        where t.session_id = s.id group by t.id, t.position order by count(p.id), t.position limit 1;
    end if;
  end if;

  loop
    v_alias := pseudonyms[1 + ((cnt + tries) % array_length(pseudonyms, 1))]
      || case when (cnt + tries) >= array_length(pseudonyms, 1)
              then ' ' || ((cnt + tries) / array_length(pseudonyms, 1) + 1)::text else '' end;
    exit when not exists (select 1 from public.participants where session_id = s.id and alias = v_alias);
    tries := tries + 1;
  end loop;

  if s.anonymous then
    v_name := v_alias;
  else
    v_name := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
    if char_length(v_name) < 2 or char_length(v_name) > 40 then
      return jsonb_build_object('ok', false, 'error', 'NAME_REQUIRED');
    end if;
  end if;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.participants (session_id, display_name, alias, team_id, token_hash)
  values (s.id, v_name, v_alias, v_team, encode(extensions.digest(v_token, 'sha256'), 'hex'))
  returning id into v_id;
  insert into public.join_attempts(ip, success) values (ip, true);

  return jsonb_build_object('ok', true, 'participant_id', v_id, 'token', v_token,
    'session_id', s.id, 'code', s.code, 'alias', v_alias, 'display_name', v_name);
end $$;

-- الحالة الحالية للطالب: السؤال الجاري فقط، دون أي إجابات صحيحة قبل كشفها
create or replace function public.student_state(p_participant uuid, p_token text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  p public.participants;
  s public.sessions;
  sq public.session_questions;
  r public.responses;
  snap jsonb;
  fmt text;
  result jsonb;
  qj jsonb;
  opts jsonb := '[]'::jsonb;
  rights jsonb := null;
  correct jsonb := null;
  team jsonb := null;
  sq_team text;
  v_points numeric;
  pushed_count int;
  can_answer boolean;
begin
  select * into p from public._participant(p_participant, p_token);
  if p.id is null then
    return jsonb_build_object('ok', false, 'error', 'INVALID_PARTICIPANT');
  end if;
  if p.is_removed then
    return jsonb_build_object('ok', false, 'error', 'REMOVED');
  end if;
  update public.participants set last_seen_at = now()
    where id = p.id and last_seen_at < now() - interval '10 seconds';
  select * into s from public.sessions where id = p.session_id;
  if p.team_id is not null then
    select jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color) into team from public.session_teams t where t.id = p.team_id;
  end if;
  if s.leaderboard_enabled then
    select coalesce(sum(rr.score), 0) into v_points from public.responses rr
      join public.session_questions x on x.id = rr.sq_id
      where rr.participant_id = p.id and x.revealed;
  end if;

  result := jsonb_build_object(
    'ok', true,
    'server_time', now(),
    'session', jsonb_build_object('id', s.id, 'title', s.title, 'code', s.code, 'status', s.status,
                                  'anonymous', s.anonymous, 'leaderboard_enabled', s.leaderboard_enabled),
    'me', jsonb_build_object('id', p.id, 'alias', p.alias, 'display_name', p.display_name, 'team', team, 'points', v_points),
    'question', null);

  if s.status <> 'live' or s.current_sq_id is null then
    return result;
  end if;
  select * into sq from public.session_questions where id = s.current_sq_id;
  if sq.id is null or sq.status = 'draft' then
    return result;
  end if;

  snap := sq.snapshot;
  fmt := snap->>'answer_format';
  if fmt in ('single','multi') then
    select coalesce(jsonb_agg(jsonb_build_object('id', e->>'id', 'text', e->>'text') order by (e->>'position')::int), '[]')
      into opts from jsonb_array_elements(snap->'options') e;
  elsif fmt = 'order' then
    -- ترتيب عشوائي ثابت لا يكشف الترتيب الصحيح
    select coalesce(jsonb_agg(jsonb_build_object('id', e->>'id', 'text', e->>'text') order by md5((e->>'id') || sq.id::text)), '[]')
      into opts from jsonb_array_elements(snap->'options') e;
  elsif fmt = 'match' then
    select coalesce(jsonb_agg(jsonb_build_object('id', e->>'id', 'text', e->>'text') order by (e->>'position')::int), '[]')
      into opts from jsonb_array_elements(snap->'options') e;
    -- الطرف المقابل يُرسل نصوصًا فقط بترتيب مختلط حتى لا يكشف الأزواج الصحيحة
    select coalesce(jsonb_agg(m order by md5(m || sq.id::text)), '[]') into rights
      from (select distinct e->>'match_text' as m from jsonb_array_elements(snap->'options') e) d;
  end if;

  select * into r from public.responses where sq_id = sq.id and participant_id = p.id;
  if sq.team_id is not null then
    select name into sq_team from public.session_teams where id = sq.team_id;
  end if;
  select count(*) into pushed_count from public.session_questions where session_id = s.id and status <> 'draft';

  can_answer := sq.status = 'open'
    and (sq.closes_at is null or now() <= sq.closes_at + interval '2 seconds')
    and (sq.team_id is null or sq.team_id = p.team_id)
    and (r.id is null or sq.allow_retry);

  if sq.revealed then
    correct := case fmt
      when 'single' then jsonb_build_object('option_ids', (select jsonb_agg(e->>'id') from jsonb_array_elements(snap->'options') e where (e->>'is_correct')::boolean))
      when 'multi' then jsonb_build_object('option_ids', (select jsonb_agg(e->>'id') from jsonb_array_elements(snap->'options') e where (e->>'is_correct')::boolean))
      when 'order' then jsonb_build_object('order', (select jsonb_agg(e->>'id' order by (e->>'position')::int) from jsonb_array_elements(snap->'options') e))
      when 'match' then jsonb_build_object('pairs', (select jsonb_object_agg(e->>'id', e->>'match_text') from jsonb_array_elements(snap->'options') e))
      when 'short' then jsonb_build_object('accepted', coalesce(snap->'answer_key'->'accepted', '[]'::jsonb))
      when 'blanks' then jsonb_build_object('blanks', coalesce(snap->'answer_key'->'blanks', '[]'::jsonb))
      else null end;
  end if;

  qj := jsonb_build_object(
    'sq_id', sq.id,
    'number', pushed_count,
    'status', sq.status,
    'type', snap->>'type',
    'answer_format', fmt,
    'text', snap->>'text',
    'stimulus_kind', snap->>'stimulus_kind',
    'stimulus_text', snap->>'stimulus_text',
    'stimulus_source', snap->>'stimulus_source',
    'image_url', snap->>'image_url',
    'hint', snap->>'hint',
    'options', opts,
    'right_items', rights,
    'blank_count', public.blank_count(snap->>'text'),
    'time_limit_seconds', sq.time_limit_seconds,
    'opened_at', sq.opened_at,
    'closes_at', sq.closes_at,
    'allow_retry', sq.allow_retry,
    'revealed', sq.revealed,
    'game_mode', sq.game_mode,
    'points', sq.points * sq.multiplier,
    'for_team', sq_team,
    'can_answer', can_answer,
    'correct', correct,
    'explanation', case when sq.revealed then snap->>'explanation' end,
    'my_response', case when r.id is null then null else jsonb_build_object(
        'answer', r.answer, 'submitted_at', r.updated_at, 'attempts', r.attempts,
        'is_correct', case when sq.revealed then r.is_correct end,
        'score', case when sq.revealed then r.score end,
        'feedback', case when sq.revealed then r.teacher_feedback end) end
  );
  return result || jsonb_build_object('question', qj);
end $$;

-- إرسال إجابة: آمنة ضد التكرار (client_request_id + قيد فريد)
create or replace function public.submit_response(p_participant uuid, p_token text, p_sq uuid, p_answer jsonb, p_client_request_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  p public.participants;
  s public.sessions;
  sq public.session_questions;
  ex public.responses;
  g record;
  v_ms int;
  v_flag boolean := false;
  v_id uuid;
begin
  select * into p from public._participant(p_participant, p_token);
  if p.id is null then return jsonb_build_object('ok', false, 'error', 'INVALID_PARTICIPANT'); end if;
  if p.is_removed then return jsonb_build_object('ok', false, 'error', 'REMOVED'); end if;
  select * into s from public.sessions where id = p.session_id;
  if s.status = 'ended' then return jsonb_build_object('ok', false, 'error', 'SESSION_ENDED'); end if;
  select * into sq from public.session_questions where id = p_sq and session_id = p.session_id;
  if sq.id is null then return jsonb_build_object('ok', false, 'error', 'QUESTION_NOT_FOUND'); end if;

  -- طلب مكرر لنفس الإجابة (إعادة إرسال بعد انقطاع الاتصال): نعيد النجاح دون تغيير
  select * into ex from public.responses where sq_id = sq.id and participant_id = p.id;
  if ex.id is not null and p_client_request_id is not null and ex.client_request_id = p_client_request_id then
    return jsonb_build_object('ok', true, 'status', 'duplicate', 'submitted_at', ex.updated_at);
  end if;

  if s.status <> 'live' or s.current_sq_id is distinct from sq.id or sq.status <> 'open' then
    return jsonb_build_object('ok', false, 'error', 'QUESTION_CLOSED');
  end if;
  if sq.closes_at is not null and now() > sq.closes_at + interval '2 seconds' then
    return jsonb_build_object('ok', false, 'error', 'TIME_UP');
  end if;
  if sq.team_id is not null and sq.team_id is distinct from p.team_id then
    return jsonb_build_object('ok', false, 'error', 'NOT_YOUR_TEAM');
  end if;
  if not public.answer_shape_ok(sq.snapshot, p_answer) then
    return jsonb_build_object('ok', false, 'error', 'INVALID_ANSWER');
  end if;
  if ex.id is not null and not sq.allow_retry then
    return jsonb_build_object('ok', false, 'error', 'ALREADY_ANSWERED');
  end if;

  g := public.grade_answer(sq.snapshot, p_answer);
  v_ms := greatest(0, (extract(epoch from (now() - coalesce(sq.opened_at, now()))) * 1000)::int);
  if p_answer ? 'text' then
    -- إشارة للمعلم: قد تحتوي الإجابة بريدًا أو رقم هاتف أو رابطًا
    v_flag := (p_answer->>'text') ~* '([[:alnum:]._%+-]+@[[:alnum:].-]+\.[a-z]{2,})|((\+|00)?[0-9٠-٩][0-9٠-٩ \-]{7,})|(https?://|www\.)';
  end if;

  if ex.id is null then
    insert into public.responses (session_id, sq_id, participant_id, answer, is_correct, score_ratio, score,
                                  needs_review, approved, flagged, response_ms, client_request_id)
    values (s.id, sq.id, p.id, p_answer, g.is_correct, g.ratio,
            case when g.ratio is null then null else round(sq.points * sq.multiplier * g.ratio, 2) end,
            g.needs_review, s.auto_approve_open and not v_flag, v_flag, v_ms, p_client_request_id)
    on conflict (sq_id, participant_id) do nothing
    returning id into v_id;
    if v_id is null then
      return jsonb_build_object('ok', true, 'status', 'duplicate');
    end if;
    return jsonb_build_object('ok', true, 'status', 'accepted', 'submitted_at', now());
  end if;

  update public.responses set
    answer = p_answer, is_correct = g.is_correct, score_ratio = g.ratio,
    score = case when g.ratio is null then null else round(sq.points * sq.multiplier * g.ratio, 2) end,
    needs_review = g.needs_review, graded_by_teacher = false, approved = s.auto_approve_open and not v_flag,
    flagged = v_flag, response_ms = v_ms, attempts = ex.attempts + 1, client_request_id = p_client_request_id
  where id = ex.id;
  return jsonb_build_object('ok', true, 'status', 'updated', 'submitted_at', now());
end $$;

-- =====================================================================
-- واجهة المعلم: دوال security invoker تعمل تحت سياسات RLS
-- =====================================================================

-- حفظ سؤال مع خياراته في عملية واحدة
create or replace function public.save_question(p_question jsonb, p_options jsonb default '[]'::jsonb)
returns uuid language plpgsql volatile set search_path = public as $$
declare v_id uuid := nullif(p_question->>'id', '')::uuid; o jsonb; i int := 0;
begin
  if v_id is null then
    insert into public.questions (type, answer_format, text) values
      ((p_question->>'type')::public.question_type, (p_question->>'answer_format')::public.answer_format, p_question->>'text')
    returning id into v_id;
  elsif not exists (select 1 from public.questions where id = v_id) then
    raise exception 'NABD:NOT_FOUND';
  end if;
  update public.questions set
    type = (p_question->>'type')::public.question_type,
    answer_format = (p_question->>'answer_format')::public.answer_format,
    text = p_question->>'text',
    stimulus_kind = coalesce(p_question->>'stimulus_kind', 'none'),
    stimulus_text = nullif(p_question->>'stimulus_text', ''),
    stimulus_source = nullif(p_question->>'stimulus_source', ''),
    image_url = nullif(p_question->>'image_url', ''),
    subject_id = nullif(p_question->>'subject_id', '')::uuid,
    grade = coalesce(p_question->>'grade', ''),
    unit = coalesce(p_question->>'unit', ''),
    lesson = coalesce(p_question->>'lesson', ''),
    domain = coalesce(p_question->>'domain', ''),
    difficulty = coalesce(p_question->>'difficulty', 'medium')::public.difficulty_level,
    bloom = coalesce(p_question->>'bloom', 'understand')::public.bloom_level,
    skill = coalesce(p_question->>'skill', ''),
    points = coalesce((p_question->>'points')::numeric, 1),
    time_limit_seconds = nullif(p_question->>'time_limit_seconds', '')::int,
    hint = nullif(p_question->>'hint', ''),
    explanation = nullif(p_question->>'explanation', ''),
    answer_key = coalesce(p_question->'answer_key', '{}'::jsonb),
    template_key = nullif(p_question->>'template_key', ''),
    tags = coalesce((select array_agg(x) from jsonb_array_elements_text(p_question->'tags') x), '{}'),
    is_favorite = coalesce((p_question->>'is_favorite')::boolean, false)
  where id = v_id;

  delete from public.question_options where question_id = v_id;
  for o in select * from jsonb_array_elements(coalesce(p_options, '[]'::jsonb)) loop
    insert into public.question_options (question_id, position, text, match_text, is_correct)
    values (v_id, i, o->>'text', nullif(o->>'match_text', ''), coalesce((o->>'is_correct')::boolean, false));
    i := i + 1;
  end loop;
  return v_id;
end $$;

create or replace function public.duplicate_question(p_question uuid)
returns uuid language plpgsql volatile set search_path = public as $$
declare v_new uuid;
begin
  insert into public.questions (type, answer_format, text, stimulus_kind, stimulus_text, stimulus_source, image_url,
    subject_id, grade, unit, lesson, domain, difficulty, bloom, skill, points, time_limit_seconds, hint, explanation,
    answer_key, template_key, tags)
  select type, answer_format, text, stimulus_kind, stimulus_text, stimulus_source, image_url,
    subject_id, grade, unit, lesson, domain, difficulty, bloom, skill, points, time_limit_seconds, hint, explanation,
    answer_key, template_key, tags
  from public.questions where id = p_question
  returning id into v_new;
  if v_new is null then raise exception 'NABD:NOT_FOUND'; end if;
  insert into public.question_options (question_id, position, text, match_text, is_correct)
  select v_new, position, text, match_text, is_correct from public.question_options where question_id = p_question;
  return v_new;
end $$;

-- إرسال سؤال إلى الطلاب
create or replace function public.push_question(p_sq uuid, p_time_limit int default -1)
returns void language plpgsql volatile set search_path = public as $$
declare sq public.session_questions; s public.sessions; snap jsonb; problem text; v_limit int;
begin
  select * into sq from public.session_questions where id = p_sq for update;
  if sq.id is null then raise exception 'NABD:NOT_FOUND'; end if;
  select * into s from public.sessions where id = sq.session_id;
  if s.status = 'ended' then raise exception 'NABD:SESSION_ENDED'; end if;
  if sq.status = 'closed' then raise exception 'NABD:ALREADY_CLOSED' using hint = 'استخدم إعادة المحاولة لإعادة فتح سؤال مغلق'; end if;
  if sq.status = 'open' then return; end if;

  snap := sq.snapshot;
  if sq.question_id is not null then
    -- تحديث اللقطة من البنك لأن السؤال لم يُرسل بعد (يسمح بتعديله قبل الإرسال)
    snap := coalesce(public.build_snapshot(sq.question_id), snap);
  end if;
  problem := public.question_problem(snap);
  if problem is not null then
    raise exception 'NABD:QUESTION_INCOMPLETE' using hint = problem;
  end if;

  v_limit := case when p_time_limit = -1 then sq.time_limit_seconds when p_time_limit = 0 then null else p_time_limit end;
  if sq.game_mode = 'five_seconds' and p_time_limit = -1 then v_limit := 5; end if;

  update public.session_questions set status = 'closed', closed_at = now()
    where session_id = s.id and status = 'open' and id <> sq.id;
  update public.session_questions set
    snapshot = snap, status = 'open', time_limit_seconds = v_limit, opened_at = now(),
    closes_at = case when v_limit is null then null else now() + make_interval(secs => v_limit) end,
    closed_at = null, revealed = false,
    multiplier = case when game_mode = 'golden' then greatest(multiplier, 2) else multiplier end
  where id = sq.id;
  update public.sessions set status = 'live', started_at = coalesce(started_at, now()), current_sq_id = sq.id
    where id = s.id;
end $$;

create or replace function public.close_question(p_sq uuid)
returns void language plpgsql volatile set search_path = public as $$
begin
  update public.session_questions set status = 'closed', closed_at = now()
    where id = p_sq and status = 'open';
  if not found and not exists (select 1 from public.session_questions where id = p_sq) then
    raise exception 'NABD:NOT_FOUND';
  end if;
end $$;

create or replace function public.reveal_answer(p_sq uuid, p_reveal boolean default true)
returns void language plpgsql volatile set search_path = public as $$
begin
  if not exists (select 1 from public.session_questions where id = p_sq) then raise exception 'NABD:NOT_FOUND'; end if;
  -- لا تُكشف الإجابة والسؤال مفتوح: يُغلق أولًا
  update public.session_questions set status = 'closed', closed_at = now() where id = p_sq and status = 'open';
  update public.session_questions set revealed = p_reveal where id = p_sq;
end $$;

-- إعادة فتح سؤال مغلق مع السماح بتغيير الإجابة
create or replace function public.reopen_question(p_sq uuid, p_seconds int default null)
returns void language plpgsql volatile set search_path = public as $$
declare sq public.session_questions; s public.sessions;
begin
  select * into sq from public.session_questions where id = p_sq for update;
  if sq.id is null then raise exception 'NABD:NOT_FOUND'; end if;
  select * into s from public.sessions where id = sq.session_id;
  if s.status = 'ended' then raise exception 'NABD:SESSION_ENDED'; end if;
  if sq.status <> 'closed' then raise exception 'NABD:NOT_CLOSED'; end if;
  update public.session_questions set status = 'closed', closed_at = now()
    where session_id = s.id and status = 'open';
  update public.session_questions set status = 'open', allow_retry = true, revealed = false, closed_at = null,
    opened_at = now(), time_limit_seconds = p_seconds,
    closes_at = case when p_seconds is null then null else now() + make_interval(secs => p_seconds) end
  where id = p_sq;
  update public.sessions set current_sq_id = p_sq where id = s.id;
end $$;

create or replace function public.cancel_timer(p_sq uuid)
returns void language sql volatile set search_path = public as $$
  update public.session_questions set closes_at = null, time_limit_seconds = null where id = p_sq and status = 'open';
$$;

-- بطاقة الحظ: مضاعف عشوائي 1-3 لدرجات السؤال
create or replace function public.draw_luck(p_sq uuid)
returns numeric language plpgsql volatile security definer set search_path = public as $$
declare m numeric := 1 + floor(random() * 3);
begin
  if not exists (select 1 from public.session_questions where id = p_sq and public.is_session_owner(session_id)) then
    raise exception 'NABD:NOT_FOUND';
  end if;
  update public.session_questions set multiplier = m, game_mode = 'luck' where id = p_sq;
  if not found then raise exception 'NABD:NOT_FOUND'; end if;
  update public.responses r set score = round(sq.points * m * r.score_ratio, 2)
    from public.session_questions sq
    where sq.id = p_sq and r.sq_id = sq.id and r.score_ratio is not null;
  return m;
end $$;

-- تصحيح يدوي من المعلم
create or replace function public.grade_response(p_response uuid, p_correct boolean, p_ratio numeric default null, p_feedback text default null)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_ratio numeric;
begin
  if not exists (select 1 from public.responses where id = p_response and public.is_session_owner(session_id)) then
    raise exception 'NABD:NOT_FOUND';
  end if;
  v_ratio := coalesce(p_ratio, case when p_correct then 1 when p_correct = false then 0 end);
  if v_ratio is not null and (v_ratio < 0 or v_ratio > 1) then raise exception 'NABD:INVALID_SCORE'; end if;
  update public.responses r set
    is_correct = p_correct, score_ratio = v_ratio,
    score = case when v_ratio is null then null else round(sq.points * sq.multiplier * v_ratio, 2) end,
    needs_review = false, graded_by_teacher = true,
    teacher_feedback = coalesce(p_feedback, r.teacher_feedback)
  from public.session_questions sq
  where r.id = p_response and sq.id = r.sq_id;
  if not found then raise exception 'NABD:NOT_FOUND'; end if;
end $$;

create or replace function public.end_session(p_session uuid)
returns void language plpgsql volatile set search_path = public as $$
begin
  if not exists (select 1 from public.sessions where id = p_session) then raise exception 'NABD:NOT_FOUND'; end if;
  update public.session_questions set status = 'closed', closed_at = now() where session_id = p_session and status = 'open';
  update public.sessions set status = 'ended', ended_at = coalesce(ended_at, now()) where id = p_session;
end $$;

-- وقت الخادم لمزامنة المؤقتات في واجهة المعلم
create or replace function public.server_time()
returns timestamptz language sql stable as $$ select now() $$;
