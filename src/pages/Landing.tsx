// الصفحة الرئيسية: اختيار واحد فقط (معلم أو طالب)، ثم تظهر الخطوات المناسبة له
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, GraduationCap, Backpack, Trophy, LogIn, UserPlus, LayoutDashboard, RotateCcw } from 'lucide-react';
import { Brand, Credit, Logo } from '@/components/Logo';
import { FunBackdrop } from '@/components/fun';
import SoundToggle from '@/components/SoundToggle';
import { Button, Input, cx } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { participantStore } from '@/hooks/useStudent';

type Role = 'teacher' | 'student';

export default function Landing() {
  const { session } = useAuth();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const role = (params.get('as') as Role | null) ?? null;
  const choose = (r: Role | null) => setParams(r ? { as: r } : {}, { replace: false });
  const [code, setCode] = useState('');
  const resume = participantStore.get();

  return (
    <FunBackdrop>
      <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 py-6 sm:px-8">
        <header className="flex items-center justify-between">
          <div className="rounded-2xl bg-white/95 px-3 py-1.5 shadow-lg"><Brand compact /></div>
          <SoundToggle className="text-white" />
        </header>

        <main className="flex flex-1 flex-col items-center justify-center gap-8 py-10">
          <div className="text-center text-white">
            <Logo className="mx-auto mb-4 h-20 w-20 rounded-[1.6rem] shadow-2xl ring-4 ring-white/25 motion-safe:animate-bounceIn" />
            <h1 className="text-4xl font-black tracking-tight drop-shadow sm:text-6xl">نبض الفهم</h1>
            <p className="mt-2 text-lg font-bold text-gold-200 sm:text-xl">اسأل، شارك، افهم</p>
          </div>

          {!role ? (
            <div className="grid w-full max-w-3xl gap-4 sm:grid-cols-2" role="group" aria-label="من أنت؟">
              <RoleCard icon={<GraduationCap className="h-10 w-10" />} title="معلم" tone="from-brand-500 to-fuchsia-500" onClick={() => choose('teacher')} />
              <RoleCard icon={<Backpack className="h-10 w-10" />} title="طالب" tone="from-gold-400 to-coral-400" onClick={() => choose('student')} />
            </div>
          ) : (
            <div className="w-full max-w-md animate-bounceIn rounded-3xl bg-white p-6 shadow-2xl">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-2xl font-black">{role === 'teacher' ? 'أهلًا بك يا معلم' : 'أهلًا بك يا بطل'}</h2>
                <button type="button" onClick={() => choose(null)} className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-bold text-brand-600 hover:bg-brand-50">
                  <ArrowRight className="h-4 w-4" />رجوع
                </button>
              </div>

              {role === 'student' ? (
                <div className="space-y-3">
                  <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (code.trim().length >= 6) nav(`/join/${encodeURIComponent(code.trim())}`); }}>
                    <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="رمز الحصة" dir="ltr" autoFocus
                      className="h-14 text-center text-2xl font-black uppercase tracking-[.3em]" maxLength={8} aria-label="رمز الحصة" />
                    <Button type="submit" size="lg" className="h-14" disabled={code.trim().length < 6}>انضم</Button>
                  </form>
                  <Divider />
                  <Button size="lg" variant="gold" className="h-14 w-full text-lg" icon={<Trophy className="h-6 w-6" />} onClick={() => nav('/practice')} data-testid="landing-practice">تحدي الكأس</Button>
                  {resume && <Button variant="soft" className="w-full" icon={<RotateCcw className="h-5 w-5" />} onClick={() => nav('/play')}>العودة إلى حصتك ({resume.display_name})</Button>}
                </div>
              ) : session ? (
                <Button size="lg" className="h-14 w-full text-lg" icon={<LayoutDashboard className="h-6 w-6" />} onClick={() => nav('/t')}>الدخول إلى لوحتي</Button>
              ) : (
                <div className="space-y-3">
                  <Button size="lg" className="h-14 w-full text-lg" icon={<LogIn className="h-6 w-6" />} onClick={() => nav('/login')}>تسجيل الدخول</Button>
                  <Button size="lg" variant="outline" className="h-14 w-full text-lg" icon={<UserPlus className="h-6 w-6" />} onClick={() => nav('/signup')}>حساب جديد</Button>
                </div>
              )}
            </div>
          )}
        </main>

        <footer className="space-y-1 text-center text-sm text-white/80">
          <Credit light />
          <Link to="/privacy" className="underline-offset-4 hover:underline">سياسة الخصوصية</Link>
        </footer>
      </div>
    </FunBackdrop>
  );
}

function RoleCard({ icon, title, tone, onClick }: { icon: React.ReactNode; title: string; tone: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="group flex animate-bounceIn flex-col items-center gap-4 rounded-3xl bg-white p-8 text-center shadow-2xl transition duration-200 hover:-translate-y-1.5 hover:shadow-lift focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold-300">
      <span className={cx('flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br text-white shadow-lg transition group-hover:scale-110', tone)}>{icon}</span>
      <span className="text-3xl font-black text-brand-900">{title}</span>
    </button>
  );
}

function Divider() {
  return <div className="flex items-center gap-3 text-sm font-bold text-brand-300"><span className="h-px flex-1 bg-brand-100" />أو<span className="h-px flex-1 bg-brand-100" /></div>;
}
