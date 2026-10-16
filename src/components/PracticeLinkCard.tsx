// رابط التحديات الذاتية: يفعّله المعلم مرة واحدة، فيختار الطلاب الدرس ويلعبون دون تدخله
import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Copy, Users } from 'lucide-react';
import { Badge, Button, Card, Toggle } from './ui';
import { practice, type PracticeLink } from '@/lib/api';
import { toAppError } from '@/lib/errors';
import { practiceUrl } from '@/lib/supabase';

// اختيار عدد الدقائق بالأزرار أو بالكتابة (من 1 إلى 120)
export function MinutesStepper({ value, onChange, disabled, label = 'المدة بالدقائق' }: { value: number; onChange: (m: number) => void; disabled?: boolean; label?: string }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const set = (m: number) => { const v = Math.min(120, Math.max(1, Math.round(m))); if (v !== value) onChange(v); else setDraft(String(v)); };
  const btn = 'flex h-10 w-10 items-center justify-center rounded-xl border-2 border-brand-100 bg-white text-xl font-extrabold text-brand-800 hover:bg-brand-50 disabled:opacity-50';
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={label}>
      <button type="button" className={btn} disabled={disabled || value <= 1} onClick={() => set(value - 1)} aria-label="إنقاص دقيقة">−</button>
      <input type="number" min={1} max={120} value={draft} disabled={disabled} aria-label={label} data-testid="minutes-input"
        onChange={(e) => setDraft(e.target.value)} onBlur={() => { const n = Number(draft); if (n >= 1) set(n); else setDraft(String(value)); }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className="h-10 w-16 rounded-xl border-2 border-brand-100 text-center text-lg font-extrabold tabular-nums" />
      <button type="button" className={btn} disabled={disabled || value >= 120} onClick={() => set(value + 1)} aria-label="زيادة دقيقة">+</button>
      <span className="text-sm font-semibold text-brand-700">دقيقة</span>
    </div>
  );
}

export default function PracticeLinkCard() {
  const [link, setLink] = useState<PracticeLink | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { practice.myLink().then(setLink).catch((e) => { setLink(null); setError(toAppError(e).message); }); }, []);

  const act = async (fn: () => Promise<PracticeLink>) => {
    setBusy(true); setError(null);
    try { setLink(await fn()); } catch (e) { setError(toAppError(e).message); } finally { setBusy(false); }
  };
  const copy = async (url: string) => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* المتصفح يمنع النسخ */ }
  };

  if (link === undefined) return null;
  return (
    <Card className="space-y-3 border-2 border-gold-200" data-testid="practice-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-extrabold"><Users className="h-6 w-6 text-gold-500" />تحديات يبدؤها الطلاب بأنفسهم</h2>
        {link && <Badge tone={link.enabled ? 'green' : 'gray'}>{link.enabled ? 'مفعّل' : 'متوقف'}</Badge>}
      </div>
      <p className="text-brand-700">أعطِ طلابك هذا الرابط مرة واحدة: يختار الطالب الدرس من بنك أسئلتك، ويلعب وحده أو يتحدى زملاءه المتصلين، دون أن تبدأ أنت شيئًا. تصلك نتائجهم في التقارير.</p>
      {!link ? (
        <Button variant="gold" loading={busy} onClick={() => act(practice.createLink)}>فعّل رابط التحديات</Button>
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          <div className="rounded-2xl bg-white p-2 shadow-card"><QRCodeSVG value={practiceUrl(link.code)} size={110} level="M" marginSize={1} fgColor="#072a20" /></div>
          <div className="space-y-1">
            <div className="text-sm text-brand-600">رمز التحديات</div>
            <div dir="ltr" className="font-mono text-4xl font-extrabold tracking-[.2em]" data-testid="practice-code">{link.code}</div>
            <button onClick={() => copy(practiceUrl(link.code))} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 underline">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? 'تم النسخ' : 'نسخ الرابط'}
            </button>
          </div>
          <div className="min-w-[220px] flex-1"><Toggle checked={link.enabled} disabled={busy} onChange={(v) => act(() => practice.setEnabled(link.owner_id, v))} label="السماح للطلاب بالتحدي الآن" hint="أوقفه وقت الاختبارات مثلًا" />
            <Toggle checked={link.is_public} disabled={busy || !link.enabled} onChange={(v) => act(() => practice.setPublic(link.owner_id, v))} label="بدون رمز: لكل من يدخل الموقع" hint="يضغط الطالب «تحدي الكأس» في الصفحة الرئيسية، فيرى دروسك ويبدأ مباشرة" />
            <div className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div><div className="font-semibold">⏱️ مدة كل تحدٍّ</div><div className="text-sm text-brand-600">الوقت المتاح للطالب ليجيب عن أسئلة الدرس</div></div>
              <MinutesStepper value={link.minutes} disabled={busy} onChange={(m) => act(() => practice.setMinutes(link.owner_id, m))} />
            </div></div>
        </div>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </Card>
  );
}
