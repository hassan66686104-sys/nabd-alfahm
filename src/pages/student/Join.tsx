import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Brand } from '@/components/Logo';
import { Button, Card, ErrorBox, Field, Input, cx } from '@/components/ui';
import { OfflineBanner } from '@/components/feedback';
import { student } from '@/lib/api';
import { messageFor, toAppError } from '@/lib/errors';
import { joinSchema, firstError } from '@/lib/schemas';
import { participantStore } from '@/hooks/useStudent';

interface Preview { title: string; code: string; anonymous: boolean; teams_enabled: boolean; teams: { id: string; name: string; color: string }[] }

export default function Join() {
  const params = useParams();
  const nav = useNavigate();
  const [code, setCode] = useState(params.code ?? '');
  const [name, setName] = useState('');
  const [team, setTeam] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const lookup = async (raw: string) => {
    const v = joinSchema.safeParse({ code: raw });
    if (!v.success) return setError(firstError(v.error));
    setBusy(true); setError(null);
    try {
      const r = await student.lookup(v.data.code);
      if (!r.ok) setError(messageFor(r.error));
      else {
        // إن كان الطالب قد انضم لنفس الحصة من هذا الجهاز نعيده مباشرة دون تكرار تسجيله
        const existing = participantStore.get();
        if (existing && existing.code === r.session.code) return nav('/play', { replace: true });
        setPreview(r.session);
      }
    } catch (e) { setError(toAppError(e).message); }
    finally { setBusy(false); }
  };

  useEffect(() => { if (params.code) void lookup(params.code); }, [params.code]); // eslint-disable-line react-hooks/exhaustive-deps

  const join = async (e: FormEvent) => {
    e.preventDefault();
    if (!preview || busy) return;
    if (!preview.anonymous && name.trim().length < 2) return setError(messageFor('NAME_REQUIRED'));
    setBusy(true); setError(null);
    try {
      const r = await student.join(preview.code, preview.anonymous ? null : name.trim(), team);
      if (!r.ok) return setError(messageFor(r.error));
      participantStore.clear();
      participantStore.set({ participant_id: r.participant_id, token: r.token, session_id: r.session_id, code: r.code, alias: r.alias, display_name: r.display_name });
      nav('/play', { replace: true });
    } catch (err) { setError(toAppError(err).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-dvh bg-gradient-to-b from-brand-700 to-brand-900">
      <OfflineBanner />
      <div className="mx-auto flex max-w-md flex-col gap-5 px-4 py-8">
        <div className="mx-auto rounded-2xl bg-white px-3 py-2"><Brand /></div>
        <Card className="space-y-4 p-6">
          {!preview ? (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void lookup(code); }}>
              <h1 className="text-2xl font-extrabold">الانضمام إلى حصة</h1>
              <Field label="رمز الحصة">
                <Input value={code} onChange={(e) => setCode(e.target.value)} dir="ltr" inputMode="text" autoCapitalize="characters" autoComplete="off"
                  className="text-center text-3xl font-extrabold uppercase tracking-[.35em]" maxLength={10} placeholder="ABC123" autoFocus />
              </Field>
              {error && <ErrorBox error={error} />}
              <Button type="submit" size="lg" className="w-full" loading={busy}>متابعة</Button>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={join}>
              <div>
                <div className="text-sm text-brand-600">ستنضم إلى</div>
                <h1 className="text-2xl font-extrabold">{preview.title}</h1>
              </div>
              {preview.anonymous ? (
                <p className="rounded-xl bg-brand-50 p-3 text-brand-700">هذه حصة مجهولة الهوية: لن يُطلب اسمك، وستحصل على اسم مستعار.</p>
              ) : (
                <Field label="اسمك" hint="يظهر للمعلم فقط">
                  <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="name" autoFocus className="text-lg" />
                </Field>
              )}
              {preview.teams_enabled && preview.teams.length > 0 && (
                <div>
                  <div className="mb-2 text-sm font-semibold">اختر فريقك (اختياري)</div>
                  <div className="grid grid-cols-2 gap-2">
                    {preview.teams.map((t) => (
                      <button key={t.id} type="button" onClick={() => setTeam(team === t.id ? null : t.id)}
                        className={cx('rounded-xl border-2 p-3 font-bold', team === t.id ? 'border-gold-400 bg-gold-50' : 'border-brand-100')}
                        style={{ color: t.color }}>{t.name}</button>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-brand-600">إن لم تختر، يوزعك التطبيق على الفريق الأقل عددًا.</p>
                </div>
              )}
              {error && <ErrorBox error={error} />}
              <Button type="submit" size="xl" className="w-full" loading={busy}>ادخل الحصة</Button>
              <button type="button" className="w-full text-sm text-brand-600 underline" onClick={() => { setPreview(null); setError(null); }}>رمز آخر</button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
