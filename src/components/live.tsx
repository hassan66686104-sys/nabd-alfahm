// مكونات مشتركة بين لوحة المعلم المباشرة وشاشة العرض
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Copy, Crown, Flame, Radio, RefreshCw, Shield, WifiOff } from 'lucide-react';
import { Badge, cx } from './ui';
import type { DistributionItem } from '@/lib/stats';
import { computeLeaderboard } from '@/lib/stats';
import { wordFrequencies } from '@/lib/text';
import { joinUrl } from '@/lib/supabase';
import type { SyncState } from '@/hooks/useLiveSession';

export function DistributionChart({ data, showCorrect, height = 260, large }: { data: DistributionItem[]; showCorrect: boolean; height?: number; large?: boolean }) {
  const rows = data.map((d) => ({ name: d.label, full: d.text, count: d.count, correct: d.isCorrect }));
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div style={{ height }} dir="ltr" className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 28, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#d5ebdf" />
          <XAxis dataKey="name" tick={{ fontSize: large ? 28 : 16, fontWeight: 700, fill: '#0b3a2c', fontFamily: 'Cairo' }} axisLine={false} tickLine={false} reversed />
          <YAxis allowDecimals={false} domain={[0, max]} hide />
          <Tooltip cursor={{ fill: '#eef7f2' }} formatter={(v: number) => [`${v} طالب`, 'العدد']} labelFormatter={(_, p) => (p?.[0]?.payload?.full as string) ?? ''} contentStyle={{ direction: 'rtl', fontFamily: 'Cairo', borderRadius: 12 }} />
          <Bar dataKey="count" radius={[10, 10, 0, 0]} isAnimationActive={false}>
            {rows.map((r, i) => (
              <Cell key={i} fill={showCorrect ? (r.correct === true ? '#15803d' : r.correct === false ? '#b91c1c' : '#9ca3af') : i % 2 ? '#c9a227' : '#0f4d3a'} />
            ))}
            <LabelList dataKey="count" position="top" style={{ fontSize: large ? 26 : 15, fontWeight: 800, fill: '#072a20', fontFamily: 'Cairo' }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function WordCloud({ texts, large }: { texts: string[]; large?: boolean }) {
  const words = wordFrequencies(texts, large ? 40 : 30);
  if (words.length === 0) return <p className="py-6 text-center text-brand-500">ستظهر الكلمات المتكررة هنا.</p>;
  const max = words[0].count;
  const colors = ['#0f4d3a', '#a8851b', '#145f43', '#1f7754', '#846816', '#0b3a2c'];
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 py-4" aria-label="سحابة الكلمات">
      {words.map((w, i) => {
        const scale = 0.4 + 0.6 * (w.count / max);
        return (
          <span key={w.word} title={`${w.count}`} style={{ fontSize: `${(large ? 3.4 : 2) * scale}rem`, color: colors[i % colors.length], fontWeight: scale > 0.7 ? 800 : 600 }} className="leading-tight">
            {w.display}
          </span>
        );
      })}
    </div>
  );
}

export function JoinInfo({ code, count, compact, large }: { code: string; count: number; compact?: boolean; large?: boolean }) {
  const [copied, setCopied] = useState(false);
  const url = joinUrl(code);
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* المتصفح يمنع النسخ */ }
  };
  return (
    <div className={cx('flex items-center gap-4', compact ? 'flex-row' : 'flex-col text-center sm:flex-row sm:text-start')}>
      <div className="rounded-2xl bg-white p-2 shadow-card">
        <QRCodeSVG value={url} size={large ? 260 : compact ? 88 : 150} level="M" marginSize={1} fgColor="#072a20" />
      </div>
      <div className="space-y-1">
        <div className={cx('text-brand-600', large && 'text-2xl')}>ادخل إلى <span dir="ltr" className="font-bold">{url.replace(/^https?:\/\//, '').replace(/\/join\/.*/, '/join')}</span> واكتب الرمز</div>
        <div dir="ltr" data-testid="session-code" className={cx('font-mono font-extrabold tracking-[.2em] text-brand-900', large ? 'text-8xl' : compact ? 'text-3xl' : 'text-5xl')}>{code}</div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="green"><span className="h-2 w-2 animate-pulseDot rounded-full bg-green-600" /><span data-testid="joined-count">{count}</span> طالب منضم</Badge>
          {!large && <button onClick={copy} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 underline">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? 'تم النسخ' : 'نسخ رابط الانضمام'}</button>}
        </div>
      </div>
    </div>
  );
}

export function SyncBadge({ sync }: { sync: SyncState }) {
  if (sync === 'live') return <Badge tone="green"><Radio className="h-3.5 w-3.5" />مزامنة لحظية</Badge>;
  if (sync === 'polling') return <Badge tone="yellow"><RefreshCw className="h-3.5 w-3.5" />تحديث دوري</Badge>;
  if (sync === 'offline') return <Badge tone="red"><WifiOff className="h-3.5 w-3.5" />غير متصل</Badge>;
  return <Badge tone="gray">جارٍ الاتصال…</Badge>;
}

export function LeaderboardView({ data, showNames, large }: { data: ReturnType<typeof computeLeaderboard>; showNames: boolean; large?: boolean }) {
  const top = data.players.slice(0, large ? 10 : 15);
  return (
    <div className={cx('grid gap-4', data.teams.length ? 'lg:grid-cols-2' : '')}>
      {data.teams.length > 0 && (
        <div className="space-y-2">
          <h3 className={cx('font-extrabold', large ? 'text-3xl' : 'text-lg')}>ترتيب الفرق <span className="text-sm font-normal text-brand-600">(متوسط نقاط العضو)</span></h3>
          {data.teams.map((t, i) => (
            <div key={t.id} className={cx('flex items-center justify-between rounded-xl border-2 bg-white px-3 py-2', large && 'text-2xl')} style={{ borderColor: t.color }}>
              <span className="flex items-center gap-2 font-bold">{i === 0 && <Crown className="h-5 w-5 text-gold-400" />}{t.name}</span>
              <span className="font-extrabold">{t.average} <span className="text-sm font-normal text-brand-600">({t.points} · {t.members} عضو)</span></span>
            </div>
          ))}
        </div>
      )}
      <div className="space-y-2">
        <h3 className={cx('font-extrabold', large ? 'text-3xl' : 'text-lg')}>الترتيب</h3>
        {top.length === 0 && <p className="text-brand-600">يظهر الترتيب بعد كشف إجابة أول سؤال.</p>}
        {top.map((p, i) => (
          <div key={p.id} className={cx('flex items-center justify-between rounded-xl bg-white px-3 py-2 shadow-sm', large && 'text-2xl')}>
            <span className="flex items-center gap-2">
              <span className={cx('flex h-8 w-8 items-center justify-center rounded-lg font-bold', i === 0 ? 'bg-gold-400 text-brand-900' : 'bg-brand-50')}>{i + 1}</span>
              <span className="font-semibold">{showNames ? p.name : p.alias}</span>
              {p.streak >= 2 && <Badge tone="gold"><Flame className="h-3.5 w-3.5" />{p.streak}</Badge>}
              {data.hasSurvival && p.survivor && <Badge tone="green"><Shield className="h-3.5 w-3.5" />ناجٍ</Badge>}
            </span>
            <span className="font-extrabold">{p.points}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
