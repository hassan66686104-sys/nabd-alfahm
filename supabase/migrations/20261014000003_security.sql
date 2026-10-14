-- =====================================================================
-- نبض الفهم | الأمان: Row Level Security والصلاحيات والتخزين والمزامنة اللحظية
-- المبدأ: الطالب (anon) لا يقرأ أي جدول مباشرة سوى إشارات المزامنة،
-- ويتعامل فقط عبر دوال محددة تتحقق من رمز المشارك.
-- =====================================================================

alter table public.profiles enable row level security;
alter table public.subjects enable row level security;
alter table public.classes enable row level security;
alter table public.questions enable row level security;
alter table public.question_options enable row level security;
alter table public.sessions enable row level security;
alter table public.session_teams enable row level security;
alter table public.session_questions enable row level security;
alter table public.participants enable row level security;
alter table public.responses enable row level security;
alter table public.reports enable row level security;
alter table public.session_signals enable row level security;
alter table public.join_attempts enable row level security;

-- ملف المعلم
create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- البيانات المملوكة مباشرة للمعلم
create policy subjects_owner on public.subjects for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy classes_owner on public.classes for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy questions_owner on public.questions for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy options_owner on public.question_options for all to authenticated
  using (exists (select 1 from public.questions q where q.id = question_id and q.owner_id = auth.uid()))
  with check (exists (select 1 from public.questions q where q.id = question_id and q.owner_id = auth.uid()));
create policy sessions_owner on public.sessions for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy reports_owner on public.reports for all to authenticated
  using (owner_id = auth.uid() and public.is_session_owner(session_id))
  with check (owner_id = auth.uid() and public.is_session_owner(session_id));

-- بيانات الحصة: لمالك الحصة فقط
create policy teams_owner on public.session_teams for all to authenticated
  using (public.is_session_owner(session_id)) with check (public.is_session_owner(session_id));
create policy sq_owner on public.session_questions for all to authenticated
  using (public.is_session_owner(session_id)) with check (public.is_session_owner(session_id));
-- المشاركون والإجابات تُنشأ فقط عبر دوال الطالب؛ المعلم يقرأ ويعدّل ويحذف
create policy participants_select on public.participants for select to authenticated using (public.is_session_owner(session_id));
create policy participants_update on public.participants for update to authenticated
  using (public.is_session_owner(session_id)) with check (public.is_session_owner(session_id));
create policy participants_delete on public.participants for delete to authenticated using (public.is_session_owner(session_id));
create policy responses_select on public.responses for select to authenticated using (public.is_session_owner(session_id));
create policy responses_update on public.responses for update to authenticated
  using (public.is_session_owner(session_id)) with check (public.is_session_owner(session_id));
create policy responses_delete on public.responses for delete to authenticated using (public.is_session_owner(session_id));

-- إشارات المزامنة: رقم إصدار فقط، يقرؤها الجميع ليعرف الطالب متى يجلب حالته
create policy signals_read on public.session_signals for select to anon, authenticated using (true);

-- ---------- الصلاحيات على مستوى الجداول ----------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
grant select on public.session_signals to anon;
revoke insert, update, delete on public.session_signals from authenticated;
revoke all on public.join_attempts from authenticated;
revoke insert on public.participants, public.responses from authenticated;
-- يمنع المعلم من تعديل الحقول الحساسة مباشرة؛ التعديل عبر الدوال
revoke update on public.responses from authenticated;
grant update (approved, teacher_feedback) on public.responses to authenticated;
revoke update on public.participants from authenticated;
grant update (is_removed, display_name, team_id) on public.participants to authenticated;

-- ---------- صلاحيات الدوال ----------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke execute on function public._participant(uuid, text) from authenticated;
revoke execute on function public._too_many_failures(text) from authenticated;
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.bump_signal() from authenticated;
-- دوال الطالب فقط متاحة لغير المسجلين
grant execute on function public.session_lookup(text) to anon;
grant execute on function public.join_session(text, text, uuid) to anon;
grant execute on function public.student_state(uuid, text) to anon;
grant execute on function public.submit_response(uuid, text, uuid, jsonb, uuid) to anon;

alter default privileges in schema public revoke execute on functions from public, anon;

-- ---------- المزامنة اللحظية (Supabase Realtime) ----------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  alter publication supabase_realtime add table public.responses, public.participants, public.session_signals, public.session_questions, public.sessions;
end $$;

-- ---------- تخزين صور الأسئلة ----------
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage')
     and exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('question-images', 'question-images', true, 3145728, array['image/png','image/jpeg','image/webp','image/gif'])
    on conflict (id) do nothing;

    execute $p$create policy "question images upload own folder" on storage.objects for insert to authenticated
      with check (bucket_id = 'question-images' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
    execute $p$create policy "question images update own" on storage.objects for update to authenticated
      using (bucket_id = 'question-images' and owner = auth.uid())$p$;
    execute $p$create policy "question images delete own" on storage.objects for delete to authenticated
      using (bucket_id = 'question-images' and owner = auth.uid())$p$;
  end if;
end $$;
