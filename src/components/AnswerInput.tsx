// مدخلات إجابة الطالب حسب صيغة السؤال
import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Check } from 'lucide-react';
import { cx, Input, OptionLetter, Select, Textarea } from './ui';
import { OPTION_LETTERS } from '@/lib/constants';
import { splitBlanks } from '@/lib/text';
import type { Answer, StudentQuestion } from '@/lib/types';

export function emptyAnswer(q: StudentQuestion): Answer {
  switch (q.answer_format) {
    case 'single': return {};
    case 'multi': return { option_ids: [] };
    case 'order': return { order: q.options.map((o) => o.id) };
    case 'match': return { pairs: {} };
    case 'blanks': return { blanks: Array.from({ length: q.blank_count }, () => '') };
    default: return { text: '' };
  }
}

export function answerComplete(q: StudentQuestion, a: Answer): boolean {
  switch (q.answer_format) {
    case 'single': return !!a.option_id;
    case 'multi': return (a.option_ids?.length ?? 0) > 0;
    case 'order': return (a.order?.length ?? 0) === q.options.length;
    case 'match': return q.options.every((o) => !!a.pairs?.[o.id]);
    case 'blanks': return (a.blanks ?? []).length > 0 && (a.blanks ?? []).every((b) => b.trim().length > 0);
    default: return (a.text ?? '').trim().length > 0;
  }
}

interface Props {
  q: StudentQuestion;
  value: Answer;
  onChange: (a: Answer) => void;
  disabled?: boolean;
}

export function AnswerInput({ q, value, onChange, disabled }: Props) {
  const correct = q.revealed ? q.correct : null;
  const mineSubmitted = q.my_response?.answer;

  if (q.answer_format === 'single' || q.answer_format === 'multi') {
    const multi = q.answer_format === 'multi';
    return (
      <div className="grid gap-3" role={multi ? 'group' : 'radiogroup'} aria-label="خيارات الإجابة">
        {q.options.map((o, i) => {
          const selected = multi ? value.option_ids?.includes(o.id) : value.option_id === o.id;
          const isRight = correct?.option_ids?.includes(o.id);
          const wasMine = multi ? mineSubmitted?.option_ids?.includes(o.id) : mineSubmitted?.option_id === o.id;
          const tone = correct ? (isRight ? 'green' : wasMine ? 'red' : 'brand') : selected ? 'gold' : 'brand';
          return (
            <button
              key={o.id}
              type="button"
              role={multi ? 'checkbox' : 'radio'}
              aria-checked={!!selected}
              disabled={disabled}
              onClick={() => {
                if (multi) {
                  const cur = new Set(value.option_ids ?? []);
                  if (cur.has(o.id)) cur.delete(o.id); else cur.add(o.id);
                  onChange({ option_ids: [...cur] });
                } else onChange({ option_id: o.id });
              }}
              className={cx(
                'flex min-h-[64px] items-center gap-3 rounded-2xl border-2 bg-white p-3 text-start text-lg font-semibold transition active:scale-[.99] disabled:cursor-default',
                correct && isRight ? 'border-green-600 bg-green-50' : correct && wasMine ? 'border-red-500 bg-red-50' : selected ? 'border-gold-400 bg-gold-50' : 'border-brand-100 hover:border-brand-300',
              )}
            >
              <OptionLetter letter={OPTION_LETTERS[i]} tone={tone as 'brand'} />
              <span className="flex-1">{o.text}</span>
              {selected && !correct && <Check className="h-6 w-6 text-gold-500" />}
            </button>
          );
        })}
        {multi && !disabled && <p className="text-sm text-brand-600">يمكنك اختيار أكثر من إجابة.</p>}
      </div>
    );
  }

  if (q.answer_format === 'order') return <OrderInput q={q} value={value} onChange={onChange} disabled={disabled} />;
  if (q.answer_format === 'match') return <MatchInput q={q} value={value} onChange={onChange} disabled={disabled} />;

  if (q.answer_format === 'blanks') {
    const parts = splitBlanks(q.text);
    return (
      <div className="space-y-3">
        {Array.from({ length: q.blank_count }).map((_, i) => (
          <label key={i} className="flex items-center gap-2">
            <span className="w-10 shrink-0 rounded-lg bg-gold-50 py-1 text-center font-bold text-gold-600">({i + 1})</span>
            <Input
              value={value.blanks?.[i] ?? ''}
              disabled={disabled}
              maxLength={300}
              aria-label={`الفراغ ${i + 1}: ${parts[i]?.slice(-30) ?? ''}`}
              onChange={(e) => {
                const b = [...(value.blanks ?? [])];
                b[i] = e.target.value;
                onChange({ blanks: b });
              }}
            />
          </label>
        ))}
        {correct?.blanks && correct.blanks.length > 0 && (
          <div className="rounded-xl bg-green-50 p-3 text-green-800">الإجابات النموذجية: {correct.blanks.map((b, i) => `(${i + 1}) ${b.join(' / ')}`).join('، ')}</div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {q.answer_format === 'short'
        ? <Input value={value.text ?? ''} onChange={(e) => onChange({ text: e.target.value })} disabled={disabled} maxLength={300} placeholder="اكتب إجابتك القصيرة" className="text-lg" aria-label="إجابتك" />
        : <Textarea value={value.text ?? ''} onChange={(e) => onChange({ text: e.target.value })} disabled={disabled} maxLength={1500} rows={5} placeholder="اكتب إجابتك هنا" className="text-lg" aria-label="إجابتك" />}
      {!disabled && <p className="text-xs text-brand-600">لا تكتب معلومات شخصية مثل رقم الهاتف أو البريد.</p>}
      {correct?.accepted && correct.accepted.length > 0 && <div className="rounded-xl bg-green-50 p-3 text-green-800">إجابة نموذجية: {correct.accepted.join(' / ')}</div>}
    </div>
  );
}

function OrderInput({ q, value, onChange, disabled }: Props) {
  const byId = useMemo(() => new Map(q.options.map((o) => [o.id, o.text])), [q.options]);
  const order = value.order?.length === q.options.length ? value.order : q.options.map((o) => o.id);
  const correctOrder = q.revealed ? q.correct?.order : undefined;
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    const n = [...order];
    [n[i], n[j]] = [n[j], n[i]];
    onChange({ order: n });
  };
  return (
    <div className="space-y-2">
      {!disabled && <p className="text-sm text-brand-600">استخدم الأسهم لترتيب العناصر من الأول (أعلى) إلى الأخير.</p>}
      <ol className="space-y-2">
        {order.map((id, i) => (
          <li key={id} className={cx('flex items-center gap-2 rounded-2xl border-2 bg-white p-2', correctOrder ? (correctOrder[i] === id ? 'border-green-500' : 'border-red-400') : 'border-brand-100')}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-700 font-bold text-white">{i + 1}</span>
            <span className="flex-1 text-lg font-semibold">{byId.get(id)}</span>
            {!disabled && <>
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded-lg p-2 text-brand-700 hover:bg-brand-50 disabled:opacity-30" aria-label={`نقل «${byId.get(id)}» للأعلى`}><ArrowUp className="h-6 w-6" /></button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === order.length - 1} className="rounded-lg p-2 text-brand-700 hover:bg-brand-50 disabled:opacity-30" aria-label={`نقل «${byId.get(id)}» للأسفل`}><ArrowDown className="h-6 w-6" /></button>
            </>}
          </li>
        ))}
      </ol>
      {correctOrder && <div className="rounded-xl bg-green-50 p-3 text-green-800">الترتيب الصحيح: {correctOrder.map((id) => byId.get(id)).join(' ← ')}</div>}
    </div>
  );
}

function MatchInput({ q, value, onChange, disabled }: Props) {
  const rights = q.right_items ?? [];
  const pairs = value.pairs ?? {};
  const correct = q.revealed ? q.correct?.pairs : undefined;
  const [used, setUsed] = useState<Set<string>>(new Set());
  useEffect(() => setUsed(new Set(Object.values(pairs))), [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-3">
      {q.options.map((o) => (
        <div key={o.id} className={cx('grid gap-2 rounded-2xl border-2 bg-white p-3 sm:grid-cols-2 sm:items-center', correct ? (correct[o.id] === pairs[o.id] ? 'border-green-500' : 'border-red-400') : 'border-brand-100')}>
          <div className="text-lg font-semibold">{o.text}</div>
          <Select value={pairs[o.id] ?? ''} disabled={disabled} onChange={(e) => onChange({ pairs: { ...pairs, [o.id]: e.target.value } })} aria-label={`ما يقابل ${o.text}`}>
            <option value="">— اختر ما يقابله —</option>
            {rights.map((r) => <option key={r} value={r}>{r}{used.has(r) && pairs[o.id] !== r ? ' (مستخدم)' : ''}</option>)}
          </Select>
          {correct && correct[o.id] !== pairs[o.id] && <div className="text-sm text-green-800 sm:col-span-2">الصحيح: {correct[o.id]}</div>}
        </div>
      ))}
    </div>
  );
}
