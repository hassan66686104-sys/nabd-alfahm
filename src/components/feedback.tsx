import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, Info, WifiOff } from 'lucide-react';
import { Button, Modal, cx } from './ui';

type ToastKind = 'success' | 'error' | 'info';
interface Toast { id: number; kind: ToastKind; text: string }
interface ConfirmOpts { title: string; body?: ReactNode; confirmText?: string; danger?: boolean }

interface FeedbackCtx {
  toast: (text: string, kind?: ToastKind) => void;
  confirm: (o: ConfirmOpts) => Promise<boolean>;
}

const Ctx = createContext<FeedbackCtx | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pending, setPending] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);

  const toast = useCallback((text: string, kind: ToastKind = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3500);
  }, []);

  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setPending({ ...o, resolve })), []);
  const close = (v: boolean) => { pending?.resolve(v); setPending(null); };

  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={cx('pointer-events-auto flex max-w-md animate-pop items-center gap-2 rounded-xl px-4 py-3 text-white shadow-lg',
            t.kind === 'success' ? 'bg-brand-700' : t.kind === 'error' ? 'bg-red-700' : 'bg-brand-900')}>
            {t.kind === 'success' ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : t.kind === 'error' ? <AlertTriangle className="h-5 w-5 shrink-0" /> : <Info className="h-5 w-5 shrink-0" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
      <Modal
        open={!!pending}
        onClose={() => close(false)}
        title={pending?.title ?? ''}
        footer={<>
          <Button variant="outline" onClick={() => close(false)}>إلغاء</Button>
          <Button variant={pending?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>{pending?.confirmText ?? 'تأكيد'}</Button>
        </>}
      >
        <div className="text-brand-700">{pending?.body}</div>
      </Modal>
    </Ctx.Provider>
  );
}

export function useFeedback() {
  const c = useContext(Ctx);
  if (!c) throw new Error('FeedbackProvider missing');
  return c;
}

export function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}

export function OfflineBanner({ extra }: { extra?: string }) {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-center font-semibold text-brand-900" role="status">
      <WifiOff className="h-5 w-5" /> انقطع الاتصال بالإنترنت. {extra ?? 'سنعيد الاتصال تلقائيًا عند عودته.'}
    </div>
  );
}
