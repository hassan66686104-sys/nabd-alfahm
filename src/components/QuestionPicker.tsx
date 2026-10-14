import { useEffect, useState } from 'react';
import { Heart } from 'lucide-react';
import { Badge, Button, Input, Modal, Spinner, cx } from './ui';
import { listQuestions } from '@/lib/api';
import { toAppError } from '@/lib/errors';
import { bloomLabel, typeLabel } from '@/lib/constants';
import type { Question } from '@/lib/types';

export default function QuestionPicker({ open, onClose, onPick, exclude = [] }: { open: boolean; onClose: () => void; onPick: (qs: Question[]) => void; exclude?: string[] }) {
  const [search, setSearch] = useState('');
  const [fav, setFav] = useState(false);
  const [items, setItems] = useState<Question[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<Map<string, Question>>(new Map());

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      listQuestions({ search, favorites: fav, limit: 100 }).then(setItems).catch((e) => setError(toAppError(e).message));
    }, 250);
    return () => clearTimeout(t);
  }, [open, search, fav]);

  useEffect(() => { if (!open) setSel(new Map()); }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="اختر من بنك الأسئلة" wide
      footer={<>
        <Button variant="outline" onClick={onClose}>إلغاء</Button>
        <Button disabled={sel.size === 0} onClick={() => { onPick([...sel.values()]); onClose(); }}>إضافة {sel.size || ''}</Button>
      </>}>
      <div className="mb-3 flex gap-2">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث في الأسئلة أو الدروس…" autoFocus />
        <Button variant={fav ? 'gold' : 'outline'} onClick={() => setFav(!fav)} icon={<Heart className="h-5 w-5" />} aria-pressed={fav}>المفضلة</Button>
      </div>
      {error && <p className="text-red-700">{error}</p>}
      {!items ? <Spinner /> : items.length === 0 ? <p className="py-6 text-center text-brand-600">لا توجد أسئلة. أضف أسئلة إلى البنك أولًا.</p> : (
        <div className="grid gap-2">
          {items.filter((q) => !exclude.includes(q.id)).map((q) => {
            const on = sel.has(q.id);
            return (
              <button key={q.id} type="button" onClick={() => setSel((m) => { const n = new Map(m); if (n.has(q.id)) n.delete(q.id); else n.set(q.id, q); return n; })}
                className={cx('rounded-xl border-2 p-3 text-start', on ? 'border-gold-400 bg-gold-50' : 'border-brand-100 hover:border-brand-300')} aria-pressed={on}>
                <div className="line-clamp-2 font-semibold">{q.text}</div>
                <div className="mt-1 flex flex-wrap gap-1"><Badge>{typeLabel(q.type)}</Badge><Badge tone="gold">{bloomLabel(q.bloom)}</Badge>{q.lesson && <Badge tone="gray">{q.lesson}</Badge>}</div>
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
