// حالة الطالب: الاستماع لإشارات الحصة + استطلاع احتياطي + إرسال آمن للإجابات مع إعادة المحاولة
import { uuid } from '@/lib/uuid';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { student } from '@/lib/api';
import { isNetworkError, messageFor, toAppError } from '@/lib/errors';
import type { Answer, StudentState } from '@/lib/types';

const KEY = 'nabd.participant';
const PENDING_KEY = 'nabd.pending';

export interface StoredParticipant { participant_id: string; token: string; session_id: string; code: string; alias: string; display_name: string; avatar?: string }

export const participantStore = {
  get(): StoredParticipant | null {
    try { return JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { return null; }
  },
  set(p: StoredParticipant) { localStorage.setItem(KEY, JSON.stringify(p)); },
  clear() { localStorage.removeItem(KEY); localStorage.removeItem(PENDING_KEY); },
};

interface Pending { sq_id: string; answer: Answer; request_id: string; attempt_key: string }

export type SubmitState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'queued' } // بانتظار عودة الاتصال
  | { kind: 'done'; status: 'accepted' | 'duplicate' | 'updated' }
  | { kind: 'error'; message: string };

export function useStudent(p: StoredParticipant | null) {
  const [state, setState] = useState<StudentState | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [transient, setTransient] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [clockOffset, setClockOffset] = useState(0);
  const [submit, setSubmit] = useState<SubmitState>({ kind: 'idle' });
  const inflight = useRef(false);
  const again = useRef(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  // في «تحدي الكأس» تتولى صفحة اللعبة التحديث، فيتوقف هذا الاستطلاع
  const selfMode = useRef(false);

  const refresh = useCallback(async () => {
    if (!p || selfMode.current) return;
    if (inflight.current) { again.current = true; return; }
    inflight.current = true;
    const t0 = Date.now();
    try {
      const r = await student.state(p.participant_id, p.token);
      if (!r.ok) {
        setFatal(messageFor(r.error));
        if (r.error === 'INVALID_PARTICIPANT' || r.error === 'REMOVED') participantStore.clear();
      } else {
        if (r.session.mode === 'self') selfMode.current = true;
        setState(r);
        setTransient(null);
        setClockOffset(new Date(r.server_time).getTime() + (Date.now() - t0) / 2 - Date.now());
      }
    } catch (e) {
      setTransient(isNetworkError(e) ? 'جارٍ إعادة الاتصال…' : toAppError(e).message);
    } finally {
      inflight.current = false;
      if (again.current) { again.current = false; void refresh(); }
    }
  }, [p]);

  // إشارات Realtime: تخبرنا بأن المعلم غيّر شيئًا، فنجلب الحالة
  useEffect(() => {
    if (!p) return;
    void refresh();
    const ch = supabase
      .channel(`student-${p.session_id}-${p.participant_id.slice(0, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session_signals', filter: `session_id=eq.${p.session_id}` }, () => void refresh())
      .subscribe((status) => {
        setLive(status === 'SUBSCRIBED');
        if (status === 'SUBSCRIBED') void refresh();
      });
    channelRef.current = ch;
    return () => { void supabase.removeChannel(ch); };
  }, [p, refresh]);

  // استطلاع احتياطي: سريع عند غياب القناة، وبطيء للتأكد عند وجودها
  useEffect(() => {
    if (!p || fatal || state?.session.mode === 'self') return;
    const id = setInterval(() => { if (navigator.onLine) void refresh(); }, live ? 8000 : 2500);
    const wake = () => void refresh();
    const vis = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('online', wake);
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(id); window.removeEventListener('online', wake); document.removeEventListener('visibilitychange', vis); };
  }, [p, live, fatal, refresh, state?.session.mode]);

  const send = useCallback(async (pending: Pending) => {
    if (!p) return;
    setSubmit({ kind: 'sending' });
    try {
      const r = await student.submit(p.participant_id, p.token, pending.sq_id, pending.answer, pending.request_id);
      localStorage.removeItem(PENDING_KEY);
      if (r.ok) setSubmit({ kind: 'done', status: r.status });
      else setSubmit({ kind: 'error', message: messageFor(r.error) });
      void refresh();
    } catch (e) {
      if (isNetworkError(e)) setSubmit({ kind: 'queued' });
      else { localStorage.removeItem(PENDING_KEY); setSubmit({ kind: 'error', message: toAppError(e).message }); }
    }
  }, [p, refresh]);

  // إعادة إرسال الإجابة المعلقة تلقائيًا عند عودة الاتصال (الخادم يتجاهل التكرار بنفس المعرف)
  useEffect(() => {
    if (submit.kind !== 'queued') return;
    let delay = 1500;
    let timer: ReturnType<typeof setTimeout>;
    const retry = () => {
      const raw = localStorage.getItem(PENDING_KEY);
      if (!raw) return;
      void send(JSON.parse(raw) as Pending);
    };
    const schedule = () => { timer = setTimeout(() => { retry(); delay = Math.min(delay * 2, 15000); }, delay); };
    schedule();
    window.addEventListener('online', retry);
    return () => { clearTimeout(timer); window.removeEventListener('online', retry); };
  }, [submit, send]);

  // استعادة إجابة معلقة بعد إعادة تحميل الصفحة
  useEffect(() => {
    const raw = localStorage.getItem(PENDING_KEY);
    if (raw && p) void send(JSON.parse(raw) as Pending);
  }, [p]); // eslint-disable-line react-hooks/exhaustive-deps

  const answer = useCallback((sqId: string, a: Answer, attemptKey: string) => {
    const raw = localStorage.getItem(PENDING_KEY);
    const existing = raw ? (JSON.parse(raw) as Pending) : null;
    // نفس المحاولة = نفس معرف الطلب، فلا تُسجل الإجابة مرتين مهما تكرر الضغط
    const pending: Pending = existing && existing.attempt_key === attemptKey && existing.sq_id === sqId
      ? { ...existing, answer: a }
      : { sq_id: sqId, answer: a, request_id: uuid(), attempt_key: attemptKey };
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    void send(pending);
  }, [send]);

  const resetSubmit = useCallback(() => setSubmit({ kind: 'idle' }), []);

  return { state, fatal, transient, live, clockOffset, submit, answer, resetSubmit, refresh };
}
