// رابط التحديات الذاتية: يفعّله المعلم مرة واحدة، فيختار الطلاب الدرس ويلعبون دون تدخله
import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Copy, Users } from 'lucide-react';
import { Badge, Button, Card, Toggle } from './ui';
import { practice, type PracticeLink } from '@/lib/api';
import { toAppError } from '@/lib/errors';
import { practiceUrl } from '@/lib/supabase';

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
          <div className="min-w-[220px] flex-1"><Toggle checked={link.enabled} disabled={busy} onChange={(v) => act(() => practice.setEnabled(link.owner_id, v))} label="السماح للطلاب بالتحدي الآن" hint="أوقفه وقت الاختبارات مثلًا" /></div>
        </div>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </Card>
  );
}
