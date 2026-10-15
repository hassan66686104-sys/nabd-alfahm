// تشغيل الواجهة داخل تطبيق iOS (Capacitor): لا توجد نوافذ متعددة، فتُفتح شاشة العرض في الصفحة نفسها
import { Capacitor } from '@capacitor/core';

export const isNativeApp = () => Capacitor.isNativePlatform();

export function openPresent(id: string, nav: (to: string) => void, name = '_blank') {
  if (isNativeApp()) nav(`/present/${id}`);
  else window.open(`/present/${id}`, name, 'noopener');
}
