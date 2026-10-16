-- =====================================================================
-- نبض الفهم | منافسة الكمبيوتر وتنظيم الأسئلة إلى «المنهج» و«عامة»
-- • إن لم يجد الطالب زميلًا ينافس الكمبيوتر: يجيب الكمبيوتر سؤالًا مقابل كل سؤال
--   يجيبه الطالب، بنسبة صواب ثابتة، وكل ذلك على الخادم فقط.
-- • لكل سؤال قسم: المنهج (الدرس) أو عامة (ألغاز، رياضة، تاريخ، دين، لغة عربية، معلومات عامة...).
-- =====================================================================

-- ---------- الأقسام ----------
alter table public.questions add column if not exists is_general boolean not null default false;
update public.questions set is_general = true where 'جاهز' = any(tags) and not is_general;
update public.questions set lesson = 'دين' where is_general and btrim(lesson) = 'ثقافة إسلامية';

-- نسخة السؤال تحتفظ بقسمه
create or replace function public.duplicate_question(p_question uuid)
returns uuid language plpgsql volatile set search_path = public as $$
declare v_new uuid;
begin
  insert into public.questions (type, answer_format, text, stimulus_kind, stimulus_text, stimulus_source, image_url,
    subject_id, grade, unit, lesson, domain, difficulty, bloom, skill, points, time_limit_seconds, hint, explanation,
    answer_key, template_key, tags, is_general)
  select type, answer_format, text, stimulus_kind, stimulus_text, stimulus_source, image_url,
    subject_id, grade, unit, lesson, domain, difficulty, bloom, skill, points, time_limit_seconds, hint, explanation,
    answer_key, template_key, tags, is_general
  from public.questions where id = p_question
  returning id into v_new;
  if v_new is null then raise exception 'NABD:NOT_FOUND'; end if;
  insert into public.question_options (question_id, position, text, match_text, is_correct)
  select v_new, position, text, match_text, is_correct from public.question_options where question_id = p_question;
  return v_new;
end $$;

-- الحزمة الجاهزة: «ثقافة إسلامية» صار اسمها «دين»، وأُضيفت رياضة وتاريخ ولغة عربية (حقائق معروفة فقط)
alter function public._starter_questions() rename to _starter_questions_base;
revoke execute on function public._starter_questions_base() from public, anon, authenticated;
create or replace function public._starter_questions()
returns jsonb language sql immutable as $$ select replace(public._starter_questions_base()::text, '"ثقافة إسلامية"', '"دين"')::jsonb || $j$[
["رياضة","كم عدد لاعبي فريق كرة القدم داخل الملعب؟","11","9","7","12"],
["رياضة","كم دقيقة مدة مباراة كرة القدم الرسمية بشوطيها دون الوقت الإضافي؟","90","60","80","100"],
["رياضة","كم عدد لاعبي فريق كرة السلة داخل الملعب؟","5","6","7","4"],
["رياضة","كم عدد الحلقات في شعار الألعاب الأولمبية؟","5","4","6","7"],
["رياضة","كم عدد لاعبي فريق الكرة الطائرة داخل الملعب؟","6","5","7","11"],
["رياضة","أي دولة استضافت كأس العالم لكرة القدم عام 2022؟","قطر","السعودية","الإمارات","مصر"],
["رياضة","في أي لعبة يُستخدم مصطلح «كش ملك»؟","الشطرنج","الملاكمة","التنس","الجودو"],
["رياضة","كل كم سنة تُقام الألعاب الأولمبية الصيفية عادة؟","كل أربع سنوات","كل سنتين","كل سنة","كل خمس سنوات"],
["رياضة","في أي رياضة تُستخدم الريشة والمضرب؟","الريشة الطائرة","كرة الطاولة","كرة السلة","الغولف"],
["رياضة","يبلغ طول سباق الماراثون نحو 42 كيلومترًا.","صح"],
["تاريخ","من الخليفة الذي بدأ العمل بالتقويم الهجري؟","عمر بن الخطاب","أبو بكر الصديق","عثمان بن عفان","علي بن أبي طالب"],
["تاريخ","أي حضارة بنت أهرامات الجيزة؟","المصرية القديمة","الرومانية","الإغريقية","الفارسية"],
["تاريخ","من القائد الذي حرر القدس من الصليبيين عام 1187م؟","صلاح الدين الأيوبي","طارق بن زياد","خالد بن الوليد","سيف الدين قطز"],
["تاريخ","من القائد الذي عبر المضيق الذي سُمّي باسمه إلى الأندلس؟","طارق بن زياد","موسى بن نصير","عقبة بن نافع","صلاح الدين الأيوبي"],
["تاريخ","من السلطان العثماني الذي فتح القسطنطينية عام 1453م؟","محمد الفاتح","سليمان القانوني","عثمان الأول","سليم الأول"],
["تاريخ","ما المدينة التي بناها أبو جعفر المنصور عاصمة للدولة العباسية؟","بغداد","دمشق","القاهرة","قرطبة"],
["تاريخ","ما عاصمة الدولة الأموية؟","دمشق","بغداد","القاهرة","الكوفة"],
["تاريخ","في أي عام ميلادي انتهت الحرب العالمية الثانية؟","1945","1918","1939","1950"],
["تاريخ","من أول إنسان مشى على سطح القمر؟","نيل آرمسترونغ","يوري غاغارين","باز ألدرين","مايكل كولينز"],
["تاريخ","انتصر المسلمون على المغول في معركة عين جالوت.","صح"],
["لغة عربية","ما جمع كلمة «كتاب»؟","كُتُب","كتابات","كاتبون","مكاتب"],
["لغة عربية","ما ضد كلمة «طويل»؟","قصير","عريض","كبير","بعيد"],
["لغة عربية","ما معنى كلمة «الغيث»؟","المطر","الريح","الثلج","البرق"],
["لغة عربية","كم عدد حروف الهجاء العربية؟","28","26","29","30"],
["لغة عربية","ما علامة الرفع الأصلية؟","الضمة","الفتحة","الكسرة","السكون"],
["لغة عربية","ما حكم الفاعل الإعرابي؟","مرفوع","منصوب","مجرور","مجزوم"],
["لغة عربية","ما مفرد كلمة «أقلام»؟","قلم","مقلمة","قلامة","قالم"],
["لغة عربية","في جملة «كتبَ الطالبُ الدرسَ» ما الفاعل؟","الطالبُ","كتبَ","الدرسَ","لا يوجد فاعل"],
["لغة عربية","من الشاعر الملقب بأمير الشعراء؟","أحمد شوقي","المتنبي","حافظ إبراهيم","امرؤ القيس"],
["لغة عربية","حروف الجر تجر الاسم الذي بعدها.","صح"]
]$j$::jsonb $$;
revoke execute on function public._starter_questions() from public, anon, authenticated;

create or replace function public._add_starter_pack(p_owner uuid)
returns int language plpgsql volatile security definer set search_path = public as $$
declare e jsonb; i int := 0; added int := 0; qid uuid; tf boolean; opts text[]; k int; correct_at int;
begin
  for e in select x from jsonb_array_elements(public._starter_questions()) x loop
    i := i + 1;
    if exists (select 1 from public.questions where owner_id = p_owner and btrim(lesson) = e->>0 and text = e->>1) then continue; end if;
    tf := jsonb_array_length(e) = 3;
    insert into public.questions (owner_id, type, answer_format, text, lesson, difficulty, bloom, tags, is_general)
    values (p_owner, case when tf then 'true_false' else 'mcq' end::public.question_type, 'single', e->>1, e->>0,
            'easy', 'remember', array['جاهز'], true)
    returning id into qid;
    if tf then
      insert into public.question_options (question_id, position, text, is_correct)
      values (qid, 0, 'صح', e->>2 = 'صح'), (qid, 1, 'خطأ', e->>2 = 'خطأ');
    else
      -- الإجابة الصحيحة تتنقل بين المواضع حتى لا تكون دائمًا الأولى
      correct_at := i % 4;
      opts := array[e->>3, e->>4, e->>5];
      opts := opts[1:correct_at] || array[e->>2] || opts[correct_at + 1:3];
      for k in 1 .. 4 loop
        insert into public.question_options (question_id, position, text, is_correct) values (qid, k - 1, opts[k], k - 1 = correct_at);
      end loop;
    end if;
    added := added + 1;
  end loop;
  return added;
end $$;
revoke execute on function public._add_starter_pack(uuid) from public, anon, authenticated;

-- معاينة التحديات: كل درس يُعلَّم بقسمه (المنهج أو عامة)
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
  select coalesce(jsonb_agg(jsonb_build_object('lesson', l, 'count', n, 'general', g) order by l), '[]') into lessons from (
    select btrim(q.lesson) l, count(*) n, bool_and(q.is_general) g from public.questions q
    where q.owner_id = pl.owner_id and btrim(q.lesson) <> '' and not public._typed_format(q.answer_format)
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

-- ---------- منافسة الكمبيوتر ----------
-- حالة الكمبيوتر تُحفظ في sessions.game->'bot'؛ لا يدخل في تقارير المعلم ولا في قائمة المشاركين
create or replace function public._game_bot_step(p_session uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s public.sessions; b jsonb; ok boolean; pts int; hearts int; maxh int;
begin
  select * into s from public.sessions where id = p_session for update;
  b := s.game->'bot';
  if b is null or coalesce((b->>'out')::boolean, false) then return; end if;
  if (b->>'answered')::int >= (select count(*) from public.session_questions where session_id = s.id) then return; end if;
  ok := random() < coalesce((b->>'skill')::numeric, 0.7);
  pts := (b->>'points')::int; hearts := (b->>'hearts')::int; maxh := public._game_hearts(s);
  if ok then pts := pts + public._game_points(s);
  else
    pts := greatest(0, pts - public._game_penalty(s));
    if maxh > 0 then hearts := greatest(0, hearts - 1); end if;
  end if;
  b := b || jsonb_build_object('points', pts, 'answered', (b->>'answered')::int + 1,
    'correct', (b->>'correct')::int + case when ok then 1 else 0 end, 'hearts', hearts, 'out', maxh > 0 and hearts = 0, 'last', ok);
  update public.sessions set game = jsonb_set(game, '{bot}', b) where id = s.id;
end $$;

-- يفوز الكمبيوتر إن بقي في اللعبة وخرج الطالب، أو كانت نقاطه أعلى من كل الطلاب (التعادل للطالب)
create or replace function public._game_bot_won(s public.sessions)
returns boolean language sql stable security definer set search_path = public as $$
  select s.game ? 'bot' and s.status = 'ended' and not exists (
    select 1 from public.game_players g join public.participants pp on pp.id = g.participant_id and not pp.is_removed
    where g.session_id = s.id
      and ((g.out_at is null and coalesce((s.game->'bot'->>'out')::boolean, false))
        or ((g.out_at is null) = not coalesce((s.game->'bot'->>'out')::boolean, false) and g.points >= (s.game->'bot'->>'points')::int)))
$$;

alter function public.game_submit(uuid, text, uuid, jsonb, uuid) rename to _game_submit_core;
revoke execute on function public._game_submit_core(uuid, text, uuid, jsonb, uuid) from public, anon, authenticated;
create or replace function public.game_submit(p_participant uuid, p_token text, p_sq uuid, p_answer jsonb, p_client_request_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare r jsonb; sid uuid;
begin
  r := public._game_submit_core(p_participant, p_token, p_sq, p_answer, p_client_request_id);
  if r->>'status' = 'accepted' then
    select session_id into sid from public.participants where id = p_participant;
    perform public._game_bot_step(sid);
  end if;
  return r;
end $$;

alter function public.game_state(uuid, text) rename to _game_state_core;
revoke execute on function public._game_state_core(uuid, text) from public, anon, authenticated;
create or replace function public.game_state(p_participant uuid, p_token text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare r jsonb; s public.sessions; b jsonb; board jsonb;
begin
  r := public._game_state_core(p_participant, p_token);
  if not coalesce((r->>'ok')::boolean, false) then return r; end if;
  select * into s from public.sessions where id = (r->'session'->>'id')::uuid;
  b := s.game->'bot';
  if b is null then return r; end if;
  select jsonb_agg(x order by (x->>'points')::int desc, x ? 'bot') into board
    from jsonb_array_elements(coalesce(r->'board', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'id', 'bot', 'name', 'الكمبيوتر', 'points', (b->>'points')::int, 'avatar', 'robot', 'bot', true,
      'out', coalesce((b->>'out')::boolean, false), 'hearts', (b->>'hearts')::int, 'answered', (b->>'answered')::int,
      'me', false, 'shield', false, 'frozen', false, 'team', null, 'team_id', null, 'color', null, 'at', now()))) x;
  r := jsonb_set(r, '{board}', board);
  if (b->>'points')::int > coalesce((r->'me'->>'points')::int, 0) then
    r := jsonb_set(r, '{me,rank}', to_jsonb(coalesce((r->'me'->>'rank')::int, 1) + 1));
  end if;
  if public._game_bot_won(s) then
    r := jsonb_set(r, '{session,winner}', jsonb_build_object('id', 'bot', 'name', 'الكمبيوتر', 'avatar', 'robot'));
  end if;
  return r;
end $$;

-- صاحب الغرفة لم يجد زميلًا: ينافس الكمبيوتر ويبدأ التحدي فورًا
create or replace function public.practice_vs_computer(p_participant uuid, p_token text, p_level text default 'medium')
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare p public.participants; s public.sessions;
begin
  select * into p from public._participant(p_participant, p_token);
  if p.id is null then return jsonb_build_object('ok', false, 'error', 'INVALID_PARTICIPANT'); end if;
  select * into s from public.sessions where id = p.session_id for update;
  if s.mode <> 'self' or not coalesce((s.game->>'practice')::boolean, false) or s.game->>'host' is distinct from p.id::text then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;
  if s.status <> 'lobby' then return jsonb_build_object('ok', false, 'error', 'GAME_ALREADY_STARTED'); end if;
  if (select count(*) from public.participants where session_id = s.id and not is_removed) > 1 then
    return jsonb_build_object('ok', false, 'error', 'NOT_ALONE');
  end if;
  update public.sessions set game = game || jsonb_build_object('bot', jsonb_build_object(
    'points', 0, 'answered', 0, 'correct', 0, 'hearts', public._game_hearts(s), 'out', false,
    'skill', case p_level when 'easy' then 0.55 when 'hard' then 0.85 else 0.7 end))
  where id = s.id;
  perform public._game_begin(s.id);
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public._game_bot_step(uuid), public._game_bot_won(public.sessions) from public, anon, authenticated;
revoke execute on function public.game_submit(uuid, text, uuid, jsonb, uuid), public.game_state(uuid, text),
  public.practice_vs_computer(uuid, text, text) from public;
grant execute on function public.game_submit(uuid, text, uuid, jsonb, uuid), public.game_state(uuid, text),
  public.practice_vs_computer(uuid, text, text) to anon, authenticated;
