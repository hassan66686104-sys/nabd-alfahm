import { Brand } from '@/components/Logo';
import { Card } from '@/components/ui';

export default function SetupNeeded() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-4 py-10">
      <Brand />
      <Card className="space-y-3">
        <h1 className="text-2xl font-extrabold">التطبيق يحتاج إلى ربطه بقاعدة البيانات</h1>
        <p className="text-brand-700">لم يُعثر على إعدادات Supabase. أنشئ ملف <code dir="ltr">.env</code> في جذر المشروع يحتوي على:</p>
        <pre dir="ltr" className="overflow-x-auto rounded-xl bg-brand-900 p-4 text-sm text-brand-50">{`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...`}</pre>
        <p className="text-brand-700">ثم طبّق ملفات قاعدة البيانات الموجودة في <code dir="ltr">supabase/migrations</code> وأعد تشغيل التطبيق. التفاصيل الكاملة في ملف <b>README.md</b>.</p>
        <p className="text-sm text-brand-600">تنبيه أمني: لا تضع مفتاح <code dir="ltr">service_role</code> في الواجهة أبدًا.</p>
      </Card>
    </div>
  );
}
