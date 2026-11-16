-- =====================================================================
-- نبض الفهم | حساب المعلم بكلمة مرور فقط (بلا بريد ولا اسم مستخدم)
-- ينشئ الحسابَ دالةٌ على الخادم (teacher-signup) بمفتاح الخدمة، فلا تُرسل رسالة تأكيد.
-- هذا الجدول يحد عدد الحسابات الجديدة من العنوان الواحد حتى لا تُجرَّب كلمات المرور عبر الإنشاء.
-- =====================================================================
create table if not exists public.teacher_signups (
  id bigserial primary key,
  ip text not null,
  created_at timestamptz not null default now()
);
create index if not exists teacher_signups_ip_idx on public.teacher_signups(ip, created_at desc);
alter table public.teacher_signups enable row level security;

-- خمس محاولات إنشاء في الساعة لكل عنوان
create or replace function public.teacher_signup_allowed(p_ip text)
returns boolean language plpgsql volatile security definer set search_path = public as $$
begin
  if (select count(*) from public.teacher_signups where ip = p_ip and created_at > now() - interval '1 hour') >= 5 then
    return false;
  end if;
  insert into public.teacher_signups(ip) values (p_ip);
  return true;
end $$;

revoke all on table public.teacher_signups from public, anon, authenticated;
revoke execute on function public.teacher_signup_allowed(text) from public, anon, authenticated;
grant execute on function public.teacher_signup_allowed(text) to service_role;
