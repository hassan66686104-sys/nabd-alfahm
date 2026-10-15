import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Brand, Credit } from '@/components/Logo';
import { Button, Card, ErrorBox, Field, Input } from '@/components/ui';
import { useFeedback } from '@/components/feedback';
import { auth } from '@/lib/api';
import { authSchema, firstError } from '@/lib/schemas';
import { toAppError } from '@/lib/errors';
import { useAuth } from '@/hooks/useAuth';

function Shell({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-brand-50 to-ivory px-4 py-10">
      <div className="w-full max-w-md space-y-5">
        <Link to="/" className="flex justify-center"><Brand /></Link>
        <Card className="space-y-4 p-6">
          <h1 className="text-2xl font-extrabold">{title}</h1>
          {children}
        </Card>
        {footer && <div className="text-center text-brand-700">{footer}</div>}
        <p className="text-center text-sm"><Link to="/privacy" className="text-brand-600 underline">سياسة الخصوصية</Link></p>
        <Credit />
      </div>
    </div>
  );
}

export function Login() {
  const { session } = useAuth();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const next = params.get('next')?.startsWith('/') ? params.get('next')! : '/t';
  if (session) return <Navigate to={next} replace />;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = authSchema.safeParse({ email, password });
    if (!v.success) return setError(firstError(v.error));
    setBusy(true); setError(null);
    try { await auth.signIn(email.trim(), password); nav(next, { replace: true }); }
    catch (err) { setError(toAppError(err).message); }
    finally { setBusy(false); }
  };
  return (
    <Shell title="دخول المعلم" footer={<>ليس لديك حساب؟ <Link className="font-bold underline" to="/signup">أنشئ حسابًا</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="البريد الإلكتروني"><Input type="email" dir="ltr" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
        <Field label="كلمة المرور"><Input type="password" dir="ltr" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
        {error && <ErrorBox error={error} />}
        <Button type="submit" size="lg" className="w-full" loading={busy}>دخول</Button>
        <Link to="/reset" className="block text-center text-sm text-brand-600 underline">نسيت كلمة المرور؟</Link>
      </form>
    </Shell>
  );
}

export function Signup() {
  const { session } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  if (session) return <Navigate to="/t" replace />;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = authSchema.safeParse({ email, password, full_name: name });
    if (!v.success) return setError(firstError(v.error));
    if (name.trim().length < 2) return setError('اكتب اسمك');
    setBusy(true); setError(null);
    try {
      const r = await auth.signUp(email.trim(), password, name.trim());
      if (r.needsConfirmation) setSent(true);
      else nav('/t', { replace: true });
    } catch (err) { setError(toAppError(err).message); }
    finally { setBusy(false); }
  };
  if (sent) return (
    <Shell title="تحقق من بريدك">
      <p className="text-brand-700">أرسلنا رابط تأكيد إلى <b dir="ltr">{email}</b>. افتح الرابط لتفعيل حسابك ثم سجّل الدخول.</p>
      <Button onClick={() => nav('/login')} className="w-full">الذهاب إلى تسجيل الدخول</Button>
    </Shell>
  );
  return (
    <Shell title="حساب معلم جديد" footer={<>لديك حساب؟ <Link className="font-bold underline" to="/login">سجّل الدخول</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="الاسم"><Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required /></Field>
        <Field label="البريد الإلكتروني"><Input type="email" dir="ltr" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
        <Field label="كلمة المرور" hint="8 أحرف على الأقل"><Input type="password" dir="ltr" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
        {error && <ErrorBox error={error} />}
        <Button type="submit" size="lg" className="w-full" loading={busy}>إنشاء الحساب</Button>
      </form>
    </Shell>
  );
}

export function ResetPassword() {
  const { recovery, session } = useAuth();
  const { toast } = useFeedback();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  if (recovery && session) {
    return (
      <Shell title="كلمة مرور جديدة">
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault();
          if (password.length < 8) return setError('كلمة المرور 8 أحرف على الأقل');
          setBusy(true);
          try { await auth.updatePassword(password); toast('تم تغيير كلمة المرور'); nav('/t'); }
          catch (err) { setError(toAppError(err).message); } finally { setBusy(false); }
        }}>
          <Field label="كلمة المرور الجديدة"><Input type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></Field>
          {error && <ErrorBox error={error} />}
          <Button type="submit" className="w-full" loading={busy}>حفظ</Button>
        </form>
      </Shell>
    );
  }
  return (
    <Shell title="استعادة كلمة المرور" footer={<Link className="underline" to="/login">العودة لتسجيل الدخول</Link>}>
      {sent ? <p className="text-brand-700">إن كان البريد مسجلًا فستصلك رسالة تحتوي على رابط لتعيين كلمة مرور جديدة.</p> : (
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault();
          const v = authSchema.shape.email.safeParse(email);
          if (!v.success) return setError(firstError(v.error));
          setBusy(true); setError(null);
          try { await auth.requestReset(email.trim()); setSent(true); }
          catch (err) { setError(toAppError(err).message); } finally { setBusy(false); }
        }}>
          <Field label="البريد الإلكتروني"><Input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          {error && <ErrorBox error={error} />}
          <Button type="submit" className="w-full" loading={busy}>إرسال رابط الاستعادة</Button>
        </form>
      )}
    </Shell>
  );
}
