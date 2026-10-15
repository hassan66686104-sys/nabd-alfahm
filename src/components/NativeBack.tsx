// زر رجوع لشاشة العرض داخل تطبيق iOS، حيث لا توجد نافذة يُغلقها المعلم
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { isNativeApp } from '@/lib/native';

export default function NativeBack() {
  const nav = useNavigate();
  if (!isNativeApp()) return null;
  return (
    <button onClick={() => nav(-1)} className="rounded-lg p-2 hover:bg-white/10" aria-label="رجوع">
      <ArrowRight className="h-6 w-6" />
    </button>
  );
}
