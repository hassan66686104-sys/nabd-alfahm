-- =====================================================================
-- نبض الفهم | الأسئلة الفورية: دعم أسئلة الرأي (نعم/لا) بلا إجابة صحيحة
-- answer_key = {"poll": true} مع خيارات لا يُحدد أي منها صحيحًا
-- =====================================================================

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
    if coalesce((snap->'answer_key'->>'poll')::boolean, false) then
      -- سؤال رأي (استطلاع فوري): لا توجد إجابة صحيحة
      if ncorrect <> 0 then return 'سؤال الرأي لا يحتوي إجابة صحيحة'; end if;
    elsif ncorrect <> 1 then return 'حدد إجابة صحيحة واحدة بالضبط'; end if;
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
    is_correct := null; ratio := null; needs_review := true;
  end if;
end $$;
