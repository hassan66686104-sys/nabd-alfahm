// متابعة «تحدي الكأس» من جهة المعلم وشاشة العرض: تحديث دوري سريع للترتيب والأحداث
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { game, getSession, listParticipants, listSessionQuestions, listTeams, live, type GameEventRow, type GamePlayerRow } from '@/lib/api';
import { toAppError } from '@/lib/errors';
import type { GameBoardRow, GameEvent, GameTeamRow, Participant, Session, Team } from '@/lib/types';

export function useChallenge(sessionId: string | undefined) {
  const [session, setSession] = useState<Session | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<GamePlayerRow[]>([]);
  const [events, setEvents] = useState<GameEventRow[]>([]);
  const [questionCount, setQuestionCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [clockOffset, setClockOffset] = useState(0);
  const busy = useRef(false);

  const reload = useCallback(async () => {
    if (!sessionId || busy.current) return;
    busy.current = true;
    try {
      const [s, p, t, g, e] = await Promise.all([getSession(sessionId), listParticipants(sessionId), listTeams(sessionId), game.players(sessionId), game.events(sessionId)]);
      setSession(s); setParticipants(p); setTeams(t); setPlayers(g); setEvents(e);
      setError(null);
    } catch (err) {
      setError(toAppError(err).message);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    void reload();
    listSessionQuestions(sessionId).then((q) => setQuestionCount(q.length)).catch(() => {});
    const t0 = Date.now();
    live.serverTime().then((st) => setClockOffset(new Date(st).getTime() + (Date.now() - t0) / 2 - Date.now())).catch(() => {});
  }, [sessionId, reload]);

  const ended = session?.status === 'ended';
  useEffect(() => {
    if (!sessionId || ended) return;
    const id = setInterval(() => { if (navigator.onLine && document.visibilityState === 'visible') void reload(); }, 2500);
    return () => clearInterval(id);
  }, [sessionId, ended, reload]);

  const view = useMemo(() => {
    const showNames = !!session && !session.hide_names && !session.anonymous;
    const byId = new Map(participants.map((p) => [p.id, p]));
    const teamById = new Map(teams.map((t) => [t.id, t]));
    const name = (id: string | null) => {
      const p = id ? byId.get(id) : undefined;
      return p ? (showNames ? p.display_name : p.alias) : null;
    };
    const nowMs = Date.now() + clockOffset;
    const rows: GameBoardRow[] = players
      .filter((g) => byId.get(g.participant_id) && !byId.get(g.participant_id)!.is_removed)
      .map((g) => {
        const p = byId.get(g.participant_id)!;
        const t = p.team_id ? teamById.get(p.team_id) : undefined;
        return {
          id: g.participant_id, name: name(g.participant_id) ?? '', points: g.points, answered: g.answered, correct: g.correct,
          team: t?.name ?? null, team_id: t?.id ?? null, color: t?.color ?? null,
          shield: !!g.shield_until && new Date(g.shield_until).getTime() > nowMs,
          frozen: !!g.frozen_until && new Date(g.frozen_until).getTime() > nowMs,
          avatar: p.avatar ?? null, out: !!g.out_at, hearts: g.hearts,
        };
      })
      .sort((a, b) => b.points - a.points);
    const teamRows: GameTeamRow[] = teams.map((t) => ({ id: t.id, name: t.name, color: t.color, points: rows.filter((r) => r.team_id === t.id).reduce((s, r) => s + r.points, 0) }));
    const feed: GameEvent[] = events.map((e) => ({ id: e.id, kind: e.kind, amount: e.amount, actor: name(e.actor_id), target: name(e.target_id), team: e.team_id ? teamById.get(e.team_id)?.name ?? null : null, at: e.created_at }));
    const winner = session?.winner_id ? { id: session.winner_id, name: name(session.winner_id) ?? '', avatar: byId.get(session.winner_id)?.avatar ?? null } : null;
    // غرفة الانتظار: كل من انضم بترتيب دخوله (المعلم يرى الاسم الحقيقي، وشاشة العرض تحترم إخفاء الأسماء)
    const present = participants.filter((p) => !p.is_removed).sort((a, b) => a.joined_at.localeCompare(b.joined_at));
    const waiting = present.map((p) => {
      const t = p.team_id ? teamById.get(p.team_id) : undefined;
      return { id: p.id, name: p.display_name, shown: name(p.id) ?? p.alias, avatar: p.avatar ?? null, team: t?.name ?? null, color: t?.color ?? null };
    });
    return { rows, teamRows, feed, winner, waiting, joined: present.length };
  }, [session, participants, teams, players, events, clockOffset]);

  return { session, setSession, questionCount, error, loading, clockOffset, reload, ...view };
}
