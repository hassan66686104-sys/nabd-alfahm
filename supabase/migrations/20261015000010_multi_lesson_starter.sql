-- =====================================================================
-- نبض الفهم | منافسة بأكثر من درس، وإبعاد الأسئلة الكتابية عن التحديات، وأسئلة جاهزة
-- • الأسئلة التي تحتاج كتابة (إجابة قصيرة، ملء فراغ، سؤال مفتوح) لا تدخل أي تحدٍّ ذاتي.
-- • يختار الطالب درسًا أو عدة دروس فتُخلط أسئلتها في تحدٍّ واحد.
-- • حزمة جاهزة يضيفها المعلم إلى بنكه: ألغاز، ومعلومات عامة، وثقافة إسلامية (حقائق معروفة
--   لا آيات ولا أحاديث ولا أحكام)، وكلها اختيار من متعدد أو صح وخطأ.
-- =====================================================================

create or replace function public._typed_format(f public.answer_format)
returns boolean language sql immutable as $$ select f::text in ('short','open','blanks') $$;

-- الأسئلة الصالحة للعب الذاتي من درس أو أكثر
create or replace function public._practice_pool(p_owner uuid, p_lessons text[])
returns setof uuid language sql stable security definer set search_path = public as $$
  select q.id from public.questions q
  where q.owner_id = p_owner and btrim(q.lesson) <> ''
    and btrim(q.lesson) = any(select btrim(x) from unnest(p_lessons) x)
    and not public._typed_format(q.answer_format) and not coalesce((q.answer_key->>'poll')::boolean, false)
    and public.question_problem(public.build_snapshot(q.id)) is null
$$;

create or replace function public._practice_questions(p_owner uuid, p_lesson text)
returns setof uuid language sql stable security definer set search_path = public as $$
  select public._practice_pool(p_owner, array[p_lesson])
$$;

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

-- الطالب يبدأ تحديًا بدرس أو أكثر: وحده (يبدأ فورًا) أو مع زملاء (غرفة انتظار)
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
          jsonb_build_object('end', 'all', 'minutes', case when array_length(lessons, 1) > 1 then 30 else 20 end, 'powers', true, 'practice', true))
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

create or replace function public.practice_start(p_code text, p_lesson text, p_name text, p_with_friends boolean default false)
returns jsonb language sql volatile security definer set search_path = public as $$
  select public.practice_start_many(p_code, array[p_lesson], p_name, p_with_friends)
$$;

-- ---------- الأسئلة الجاهزة ----------
-- كل عنصر: [الدرس، السؤال، الإجابة الصحيحة، خطأ، خطأ، خطأ] أو [الدرس، العبارة، صح|خطأ] لأسئلة الصح والخطأ
create or replace function public._starter_questions()
returns jsonb language sql immutable as $$ select $j$[
["ألغاز","ما الشيء الذي كلما أخذت منه كبر؟","الحفرة","الشمعة","الكعكة","الظل"],
["ألغاز","ما الشيء الذي يمشي بلا رجلين ويبكي بلا عينين؟","السحاب","النهر","الساعة","الريح"],
["ألغاز","ما الشيء الذي له أسنان ولا يعض؟","المشط","المنشار","المفتاح","الشوكة"],
["ألغاز","ما الشيء الذي يكتب ولا يقرأ؟","القلم","الكتاب","السبورة","الدفتر"],
["ألغاز","ما الشيء الذي كلما زاد نقص؟","العمر","المال","الماء","الطعام"],
["ألغاز","ما الشيء الذي له عين ولا يرى؟","الإبرة","المرآة","النافذة","الباب"],
["ألغاز","ما الشيء الذي يتكلم جميع اللغات دون أن يتعلمها؟","الصدى","الهاتف","المذياع","الببغاء"],
["ألغاز","بيت بلا أبواب ولا نوافذ، فما هو؟","البيضة","الخيمة","الصندوق","الكهف"],
["ألغاز","ما الشيء الذي تراه في «الليل» ثلاث مرات وفي «النهار» مرة واحدة؟","حرف اللام","القمر","النجوم","الظلام"],
["ألغاز","ما الشيء الذي يرفع السفن الثقيلة ولا يقدر على رفع مسمار؟","البحر","الرافعة","الريح","الجسر"],
["ألغاز","ما الذي يوجد في وسط «مكة»؟","حرف الكاف","الكعبة","زمزم","حرف الميم"],
["ألغاز","ما الشيء الذي له رقبة وليس له رأس؟","الزجاجة","القميص","الزرافة","المصباح"],
["ألغاز","ما الشيء الذي يقرصك ولا تراه؟","الجوع","البعوضة","البرد","النملة"],
["ألغاز","ما الشيء الذي يحيط بالبيت دون أن يتحرك؟","السور","الحديقة","الطريق","الهواء"],
["ألغاز","هو ابن أبيك وابن أمك وليس أخاك، فمن هو؟","أنت","ابن عمك","جدك","خالك"],
["ألغاز","ما الشيء الذي يجري ولا يمشي؟","الماء","السلحفاة","الظل","الجبل"],
["ألغاز","ما الشيء الذي يحملك وتحمله؟","الحذاء","الكرسي","الحقيبة","السيارة"],
["ألغاز","ما الشيء الذي يدخل الماء ولا يبتل؟","الظل","السمكة","الإسفنجة","المنديل"],
["ألغاز","ما الشيء الذي إذا لمسته صاح؟","الجرس","الكتاب","الحجر","الوسادة"],
["ألغاز","ما الشيء الذي تأكل منه ولا يؤكل؟","الطبق","الخبز","التفاحة","العسل"],
["معلومات عامة","ما أكبر كوكب في المجموعة الشمسية؟","المشتري","زحل","الأرض","المريخ"],
["معلومات عامة","ما عاصمة اليابان؟","طوكيو","بكين","سيول","بانكوك"],
["معلومات عامة","كم عدد قارات العالم في التقسيم الشائع؟","سبع","خمس","ثمان","عشر"],
["معلومات عامة","ما أكبر محيط في العالم؟","المحيط الهادئ","المحيط الأطلسي","المحيط الهندي","المحيط المتجمد الشمالي"],
["معلومات عامة","ما الغاز الذي نحتاجه في التنفس لنعيش؟","الأكسجين","ثاني أكسيد الكربون","النيتروجين","الهيليوم"],
["معلومات عامة","ما أسرع حيوان بري؟","الفهد","الأسد","الحصان","الغزال"],
["معلومات عامة","كم عدد أيام السنة الميلادية البسيطة؟","365","360","366","354"],
["معلومات عامة","أي كوكب يُعرف بالكوكب الأحمر؟","المريخ","عطارد","الزهرة","المشتري"],
["معلومات عامة","ما أعلى جبل في العالم؟","إيفرست","كليمنجارو","الألب","طوبقال"],
["معلومات عامة","ما أكبر قارة في العالم مساحة؟","آسيا","أفريقيا","أوروبا","أمريكا الشمالية"],
["معلومات عامة","عند كم درجة مئوية يغلي الماء عند مستوى سطح البحر؟","100","50","90","120"],
["معلومات عامة","ما أصغر عدد أولي؟","2","1","3","0"],
["معلومات عامة","ما عاصمة مصر؟","القاهرة","الإسكندرية","الأقصر","أسوان"],
["معلومات عامة","كم عدد أرجل العنكبوت؟","8","6","10","4"],
["معلومات عامة","ما أكبر حيوان يعيش على الأرض؟","الحوت الأزرق","الفيل","القرش الأبيض","الزرافة"],
["معلومات عامة","ما العضو الذي يضخ الدم في جسم الإنسان؟","القلب","الرئة","الكبد","المعدة"],
["معلومات عامة","كم عدد الأضلاع في المثلث؟","3","4","5","6"],
["معلومات عامة","الشمس نجم.","صح"],
["معلومات عامة","القمر يضيء بنفسه.","خطأ"],
["معلومات عامة","الحوت من الثدييات.","صح"],
["ثقافة إسلامية","كم عدد سور القرآن الكريم؟","114","110","120","99"],
["ثقافة إسلامية","ما أطول سورة في القرآن الكريم؟","البقرة","آل عمران","النساء","الكهف"],
["ثقافة إسلامية","ما أقصر سورة في القرآن الكريم؟","الكوثر","الإخلاص","العصر","الفلق"],
["ثقافة إسلامية","ما أول سورة في ترتيب المصحف؟","الفاتحة","البقرة","العلق","الناس"],
["ثقافة إسلامية","كم عدد أجزاء القرآن الكريم؟","30","40","25","60"],
["ثقافة إسلامية","ما أول مسجد بُني في الإسلام؟","مسجد قباء","المسجد النبوي","المسجد الأقصى","مسجد القبلتين"],
["ثقافة إسلامية","في أي مدينة وُلد النبي محمد ﷺ؟","مكة المكرمة","المدينة المنورة","الطائف","القدس"],
["ثقافة إسلامية","إلى أي مدينة هاجر النبي ﷺ من مكة؟","المدينة المنورة","الطائف","الحبشة","دمشق"],
["ثقافة إسلامية","من أول الخلفاء الراشدين؟","أبو بكر الصديق","عمر بن الخطاب","عثمان بن عفان","علي بن أبي طالب"],
["ثقافة إسلامية","في أي شهر يصوم المسلمون؟","رمضان","شعبان","شوال","محرم"],
["ثقافة إسلامية","كم عدد أركان الإسلام؟","5","6","4","7"],
["ثقافة إسلامية","ما اسم أم النبي محمد ﷺ؟","آمنة بنت وهب","حليمة السعدية","خديجة بنت خويلد","فاطمة بنت أسد"],
["ثقافة إسلامية","ما اسم مرضعة النبي ﷺ؟","حليمة السعدية","آمنة بنت وهب","أم أيمن","سمية بنت خياط"],
["ثقافة إسلامية","في أي غار نزل الوحي على النبي ﷺ أول مرة؟","غار حراء","غار ثور","غار أحد","غار سلع"],
["ثقافة إسلامية","في أي غار اختبأ النبي ﷺ وأبو بكر في طريق الهجرة؟","غار ثور","غار حراء","غار أحد","غار عرفات"],
["ثقافة إسلامية","أي نبي ابتلعه الحوت؟","يونس عليه السلام","موسى عليه السلام","نوح عليه السلام","يوسف عليه السلام"],
["ثقافة إسلامية","أي نبي رفع قواعد الكعبة مع ابنه إسماعيل؟","إبراهيم عليه السلام","آدم عليه السلام","نوح عليه السلام","موسى عليه السلام"],
["ثقافة إسلامية","ما القبلة الأولى للمسلمين؟","المسجد الأقصى","المسجد الحرام","مسجد قباء","المسجد النبوي"],
["ثقافة إسلامية","كم عدد الصلوات المفروضة في اليوم والليلة؟","5","3","4","6"],
["ثقافة إسلامية","المسجد الحرام يقع في مكة المكرمة.","صح"]
]$j$::jsonb $$;

-- يضيف الحزمة إلى بنك المعلم، ويتخطى ما أضيف من قبل (نفس الدرس ونفس النص)
create or replace function public._add_starter_pack(p_owner uuid)
returns int language plpgsql volatile security definer set search_path = public as $$
declare e jsonb; i int := 0; added int := 0; qid uuid; tf boolean; opts text[]; k int; correct_at int;
begin
  for e in select x from jsonb_array_elements(public._starter_questions()) x loop
    i := i + 1;
    if exists (select 1 from public.questions where owner_id = p_owner and btrim(lesson) = e->>0 and text = e->>1) then continue; end if;
    tf := jsonb_array_length(e) = 3;
    insert into public.questions (owner_id, type, answer_format, text, lesson, difficulty, bloom, tags)
    values (p_owner, case when tf then 'true_false' else 'mcq' end::public.question_type, 'single', e->>1, e->>0,
            'easy', 'remember', array['جاهز'])
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

create or replace function public.add_starter_pack()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'FORBIDDEN'); end if;
  return jsonb_build_object('ok', true, 'added', public._add_starter_pack(auth.uid()));
end $$;

revoke execute on function public._typed_format(public.answer_format), public._practice_pool(uuid, text[]),
  public._starter_questions(), public._add_starter_pack(uuid), public.add_starter_pack() from public, anon, authenticated;
grant execute on function public._typed_format(public.answer_format) to authenticated;
grant execute on function public.add_starter_pack() to authenticated;
grant execute on function public.practice_start_many(text, text[], text, boolean), public.practice_lookup(text), public.practice_start(text, text, text, boolean) to anon, authenticated;
