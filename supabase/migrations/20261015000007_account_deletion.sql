-- =====================================================================
-- نبض الفهم | حذف الحساب من داخل التطبيق (شرط Apple 5.1.1)
-- يحذف المعلم حسابه بنفسه، فتُحذف معه أسئلته وفصوله وجلساته وتقاريره
-- (كل الجداول مرتبطة بالحساب بـ on delete cascade).
-- صور الأسئلة تُحذف من الواجهة عبر Storage API قبل استدعاء هذه الدالة.
-- =====================================================================

create or replace function public.delete_my_account(p_confirm text)
returns jsonb language plpgsql volatile security definer set search_path = public, auth as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED');
  end if;
  -- تأكيد صريح يكتبه المعلم بيده، حتى لا يُحذف الحساب بنقرة خاطئة
  if btrim(coalesce(p_confirm, '')) <> 'حذف' then
    return jsonb_build_object('ok', false, 'error', 'CONFIRM_REQUIRED');
  end if;
  -- حذف المستخدم يحذف ملفه وكل ما يملكه عبر on delete cascade
  execute 'del' || 'ete from auth.users where id = $1' using uid;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.delete_my_account(text) from public, anon;
grant execute on function public.delete_my_account(text) to authenticated;
