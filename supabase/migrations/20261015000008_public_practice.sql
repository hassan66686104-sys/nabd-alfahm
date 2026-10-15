-- =====================================================================
-- نبض الفهم | تحدي الكأس بدون رمز: يختار المعلم أن تكون دروسه متاحة لكل زائر،
-- فيدخل الطالب الموقع ويختار الدرس ويبدأ مباشرة دون أن يكتب أي رمز.
-- =====================================================================

alter table public.practice_links add column if not exists is_public boolean not null default false;

-- المعلمون الذين جعلوا تحدياتهم عامة (الرمز يُعاد ليستخدمه الطالب داخليًا دون أن يكتبه)
create or replace function public.practice_public()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('code', pl.code, 'teacher', coalesce(nullif(p.full_name, ''), 'المعلم')) order by pl.created_at), '[]')
  from (select * from public.practice_links where enabled and is_public order by created_at limit 50) pl
  join public.profiles p on p.id = pl.owner_id;
$$;

revoke execute on function public.practice_public() from public;
grant execute on function public.practice_public() to anon, authenticated;
