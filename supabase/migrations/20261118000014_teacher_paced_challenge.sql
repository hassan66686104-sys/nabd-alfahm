-- =====================================================================
-- نبض الفهم | «تحدي الكأس» بتحكم المعلم (game.paced = true)
-- • عند البدء يظهر السؤال الأول فقط، وبقية الأسئلة تنتظر المعلم.
-- • المعلم يضغط «التالي» (أو يختار سؤالًا بعينه) فيُغلق السؤال الحالي ويظهر الجديد لكل الطلاب معًا.
-- • من أجاب ينتظر السؤال التالي، ومن لم يُجب قبل الانتقال يفوته السؤال.
-- • التحدي العادي (يتقدم كل طالب بسرعته) يبقى كما هو دون أي تغيير.
-- لا أعمدة جديدة: الوضع يُحفظ في sessions.game، والسؤال الحالي هو السؤال المفتوح الوحيد.
-- =====================================================================

create or replace function public._game_paced(s public.sessions)
returns boolean language sql immutable as $$
  select coalesce((s.game->>'paced')::boolean, false) and not coalesce((s.game->>'practice')::boolean, false)
$$;

-- ---------- البدء: في وضع المعلم يُفتح السؤال الأول فقط ----------
alter function public.game_start(uuid) rename to _game_start_core;
create or replace function public.game_start(p_session uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare s public.sessions; first_id uuid;
begin
  if not public.is_session_owner(p_session) then raise exception 'NABD:NOT_FOUND'; end if;
  select * into s from public.sessions where id = p_session;
  perform public._game_start_core(p_session);
  if s.status = 'lobby' and public._game_paced(s) then
    select id into first_id from public.session_questions where session_id = s.id order by position, created_at, id limit 1;
    update public.session_questions set status = 'draft', opened_at = null
      where session_id = s.id and id <> first_id;
  end if;
end $$;

-- ---------- المعلم يرسل السؤال التالي (أو سؤالًا يختاره) لكل الطلاب ----------
create or replace function public.game_send_question(p_session uuid, p_sq uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare s public.sessions; nxt public.session_questions; sent int; total int;
begin
  if not public.is_session_owner(p_session) then raise exception 'NABD:NOT_FOUND'; end if;
  select * into s from public.sessions where id = p_session for update;
  if s.mode <> 'self' or not public._game_paced(s) then raise exception 'NABD:NOT_A_GAME'; end if;
  if s.status = 'live' and public._game_over(s) then
    perform public._game_finish(s.id);
    return jsonb_build_object('ok', false, 'error', 'GAME_OVER');
  end if;
  if s.status = 'lobby' then raise exception 'NABD:GAME_NOT_STARTED'; end if;
  if s.status <> 'live' then raise exception 'NABD:GAME_OVER'; end if;

  if p_sq is not null then
    select * into nxt from public.session_questions where id = p_sq and session_id = s.id and status = 'draft';
    if nxt.id is null then raise exception 'NABD:QUESTION_NOT_FOUND'; end if;
  else
    select * into nxt from public.session_questions where session_id = s.id and status = 'draft'
      order by position, created_at, id limit 1;
  end if;

  select count(*) into total from public.session_questions where session_id = s.id;
  if nxt.id is null then
    return jsonb_build_object('ok', true, 'done', true, 'sent', total, 'total', total);
  end if;

  update public.session_questions set status = 'closed', closed_at = now()
    where session_id = s.id and status = 'open';
  update public.session_questions set status = 'open', opened_at = now(), closed_at = null
    where id = nxt.id;
  select count(*) into sent from public.session_questions where session_id = s.id and status <> 'draft';
  return jsonb_build_object('ok', true, 'done', false, 'sq_id', nxt.id, 'sent', sent, 'total', total);
end $$;

-- ---------- حالة الطالب: «انتظر السؤال التالي» بدل «أنهيت كل الأسئلة» ----------
alter function public.game_state(uuid, text) rename to _game_state_bot;
create or replace function public.game_state(p_participant uuid, p_token text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare r jsonb; s public.sessions; sent int; total int; has_q boolean; waiting boolean;
begin
  r := public._game_state_bot(p_participant, p_token);
  if not coalesce((r->>'ok')::boolean, false) then return r; end if;
  select * into s from public.sessions where id = (r->'session'->>'id')::uuid;
  if not public._game_paced(s) then return r; end if;
  select count(*) filter (where status <> 'draft'), count(*) into sent, total
    from public.session_questions where session_id = s.id;
  has_q := jsonb_typeof(r->'question') = 'object';
  waiting := s.status = 'live' and not coalesce((r->'me'->>'out')::boolean, false) and not has_q;
  r := jsonb_set(r, '{me,finished}', 'false'::jsonb);
  r := jsonb_set(r, '{me,waiting}', to_jsonb(waiting));
  r := jsonb_set(r, '{session,paced}', jsonb_build_object('sent', sent, 'total', total));
  if has_q then r := jsonb_set(r, '{question,number}', to_jsonb(sent)); end if;
  return r;
end $$;

-- ---------- تبديل السؤال لا معنى له حين يتحكم المعلم ----------
alter function public.game_help(uuid, text, uuid, text) rename to _game_help_core;
create or replace function public.game_help(p_participant uuid, p_token text, p_sq uuid, p_kind text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare s public.sessions;
begin
  if p_kind = 'swap' then
    select ss.* into s from public.sessions ss join public.participants pp on pp.session_id = ss.id where pp.id = p_participant;
    if s.id is not null and public._game_paced(s) then return jsonb_build_object('ok', false, 'error', 'HELP_NOT_FOR_QUESTION'); end if;
  end if;
  return public._game_help_core(p_participant, p_token, p_sq, p_kind);
end $$;

revoke execute on function public._game_start_core(uuid), public._game_state_bot(uuid, text),
  public._game_help_core(uuid, text, uuid, text), public._game_paced(public.sessions) from public, anon, authenticated;
revoke execute on function public.game_start(uuid), public.game_send_question(uuid, uuid) from public, anon;
grant execute on function public.game_start(uuid), public.game_send_question(uuid, uuid) to authenticated;
revoke execute on function public.game_state(uuid, text), public.game_help(uuid, text, uuid, text) from public;
grant execute on function public.game_state(uuid, text), public.game_help(uuid, text, uuid, text) to anon, authenticated;
