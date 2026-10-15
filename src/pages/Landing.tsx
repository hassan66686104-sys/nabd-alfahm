import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GraduationCap, Presentation, Smartphone, BarChart3, ShieldCheck } from 'lucide-react';
import { Brand, Credit, AUTHOR_CREDIT } from '@/components/Logo';
import { Button, Card, Input } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { participantStore } from '@/hooks/useStudent';

export default function Landing() {
  const { session } = useAuth();
  const nav = useNavigate();
  const [code, setCode] = useState('');
  const resume = participantStore.get();
  return (
    <div className="min-h-dvh bg-gradient-to-b from-brand-800 via-brand-700 to-ivory">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8 sm:py-14">
        <div className="flex items-center justify-between">
          <div className="rounded-2xl bg-white/95 px-3 py-2 shadow"><Brand /></div>
          {session && <Button variant="gold" onClick={() => nav('/t')}>لوحة المعلم</Button>}
        </div>
        <div className="text-center text-white">
          <h1 className="text-3xl font-extrabold leading-tight sm:text-5xl">بنك الأسئلة التفاعلي الذكي للمعلم</h1>
          <p className="mt-3 text-lg font-bold text-gold-300">{AUTHOR_CREDIT}</p>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-brand-50 sm:text-xl">اطرح سؤالًا قصيرًا، يجيب الطلاب من أجهزتهم، وترى فورًا مدى فهمهم لتتخذ قرارك التعليمي في الحال.</p>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <Card className="flex flex-col gap-4 p-6">
            <div className="flex items-center gap-3"><div className="rounded-2xl bg-gold-50 p-3 text-gold-500"><Smartphone className="h-7 w-7" /></div><h2 className="text-2xl font-extrabold">أنا طالب</h2></div>
            <p className="text-brand-600">أدخل رمز الحصة الظاهر على شاشة العرض. لا تحتاج إلى حساب.</p>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); nav(`/join/${encodeURIComponent(code.trim())}`); }}>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="رمز الحصة" dir="ltr" className="text-center text-2xl font-bold uppercase tracking-[.3em]" maxLength={8} aria-label="رمز الحصة" />
              <Button type="submit" size="lg" disabled={code.trim().length < 6}>انضم</Button>
            </form>
            {resume && <Button variant="soft" onClick={() => nav('/play')}>العودة إلى حصتك الحالية ({resume.display_name})</Button>}
          </Card>
          <Card className="flex flex-col gap-4 p-6">
            <div className="flex items-center gap-3"><div className="rounded-2xl bg-brand-50 p-3 text-brand-700"><GraduationCap className="h-7 w-7" /></div><h2 className="text-2xl font-extrabold">أنا معلم</h2></div>
            <p className="text-brand-600">أنشئ بنك أسئلتك، وابدأ حصة تفاعلية في أقل من دقيقة، وتابع مؤشرات الفهم لحظيًا.</p>
            <div className="mt-auto flex flex-wrap gap-2">
              {session ? <Button size="lg" onClick={() => nav('/t')}>الدخول إلى لوحتي</Button> : <>
                <Button size="lg" onClick={() => nav('/login')}>تسجيل الدخول</Button>
                <Button size="lg" variant="outline" onClick={() => nav('/signup')}>حساب جديد</Button>
              </>}
            </div>
          </Card>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { icon: Presentation, t: 'شاشة عرض للصف', d: 'سؤال بخط كبير ورمز QR ومؤشر مشاركة حي' },
            { icon: BarChart3, t: 'مؤشرات فهم فورية', d: 'أخضر وأصفر وأحمر مع اقتراح الإجراء المناسب' },
            { icon: ShieldCheck, t: 'خصوصية الطلاب', d: 'النتائج الفردية للمعلم فقط، وأسماء مستعارة اختيارية' },
          ].map((f) => (
            <div key={f.t} className="rounded-2xl bg-white/90 p-4 shadow-card">
              <f.icon className="mb-2 h-6 w-6 text-gold-500" />
              <div className="font-bold">{f.t}</div>
              <div className="text-sm text-brand-600">{f.d}</div>
            </div>
          ))}
        </div>
        <p className="text-center text-sm text-brand-700"><Link to="/join" className="underline">صفحة انضمام الطلاب</Link></p>
        <Credit className="text-base text-brand-800" />
      </div>
    </div>
  );
}
