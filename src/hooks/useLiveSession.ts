// مزامنة لحظية لواجهة المعلم: Supabase Realtime مع احتياطي بالاستطلاع الدوري عند انقطاع القناة
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { getSession, listParticipants, listResponses, listSessionQuestions, listTeams, live } from '@/lib/api';
import { toAppError } from '@/lib/errors';
import type { Participant, ResponseRow, Session, SessionQuestion, Team } from '@/lib/types';

export type SyncState = 'connecting' | 'live' | 'polling' | 'offline';

function upsert<T extends { id: string }>(list: T[], row: T): T[] {
  const i = list.findIndex((x) => x.id === row.id);
  if (i === -1) return [...list, row];
  const copy = list.slice();
  copy[i] = { ...copy[i], ...row };
  return copy;
}

export function useLiveSession(sessionId: string | undefined) {
  const [session, setSession] = useState<Session | null>(null);
  const [sqs, setSqs] = useState<SessionQuestion[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sync, setSync] = useState<SyncState>('connecting');
  const [clockOffset, setClockOffset] = useState(0); // وقت الخادم - وقت الجهاز
  const channelRef = useRef<RealtimeChannel | null>(null);
  const loadingRef = useRef(false);

  const reload = useCallback(async () => {
    if (!sessionId || loadingRef.current) return;
    loadingRef.current = true;
    try {
      const [s, q, p, r, t] = await Promise.all([
        getSession(sessionId), listSessionQuestions(sessionId), listParticipants(sessionId), listResponses(sessionId), listTeams(sessionId),
      ]);
      setSession(s); setSqs(q); setParticipants(p); setResponses(r); setTeams(t);
      setError(null);
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [sessionId]);

  const reloadQuestions = useCallback(async () => {
    if (!sessionId) return;
    try {
      const [s, q] = await Promise.all([getSession(sessionId), listSessionQuestions(sessionId)]);
      setSession(s); setSqs(q);
    } catch (e) {
      setError(toAppError(e).message);
    }
  }, [sessionId]);

  // مزامنة الساعة مع الخادم لعرض المؤقت بدقة
  useEffect(() => {
    const t0 = Date.now();
    live.serverTime().then((iso) => {
      const rtt = Date.now() - t0;
      setClockOffset(new Date(iso).getTime() + rtt / 2 - Date.now());
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    void reload();
    const ch = supabase
      .channel(`teacher-live-${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'responses', filter: `session_id=eq.${sessionId}` }, (payload) => {
        if (payload.eventType === 'DELETE') setResponses((l) => l.filter((x) => x.id !== (payload.old as { id: string }).id));
        else setResponses((l) => upsert(l, payload.new as ResponseRow));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participants', filter: `session_id=eq.${sessionId}` }, (payload) => {
        if (payload.eventType === 'DELETE') setParticipants((l) => l.filter((x) => x.id !== (payload.old as { id: string }).id));
        else setParticipants((l) => upsert(l, payload.new as Participant));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session_questions', filter: `session_id=eq.${sessionId}` }, (payload) => {
        if (payload.eventType === 'DELETE') setSqs((l) => l.filter((x) => x.id !== (payload.old as { id: string }).id));
        else setSqs((l) => upsert(l, payload.new as SessionQuestion).sort((a, b) => a.position - b.position));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` }, (payload) => {
        setSession((cur) => (cur ? { ...cur, ...(payload.new as Session) } : (payload.new as Session)));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setSync('live');
          void reload(); // التقاط أي تغييرات فاتت أثناء الانقطاع
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setSync(navigator.onLine ? 'polling' : 'offline');
        }
      });
    channelRef.current = ch;
    return () => { void supabase.removeChannel(ch); channelRef.current = null; };
  }, [sessionId, reload]);

  // احتياطي: استطلاع كل 3 ثوانٍ إن لم تكن القناة متصلة، وكل 20 ثانية للتأكد
  useEffect(() => {
    if (!sessionId) return;
    const ms = sync === 'live' ? 20000 : 3000;
    const id = setInterval(() => { if (navigator.onLine) void reload(); }, ms);
    const onOnline = () => { setSync((s) => (s === 'offline' ? 'polling' : s)); void reload(); };
    const onOffline = () => setSync('offline');
    const onVisible = () => { if (document.visibilityState === 'visible') void reload(); };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [sessionId, sync, reload]);

  return { session, sqs, participants, responses, teams, error, loading, sync, clockOffset, reload, reloadQuestions, setResponses, setSession };
}

export function useNow(intervalMs = 250, offset = 0) {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offset), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, offset]);
  return now;
}
