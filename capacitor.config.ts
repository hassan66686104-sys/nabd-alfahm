import type { CapacitorConfig } from '@capacitor/cli';

// تطبيق iOS يحمل نسخة الويب نفسها داخل التطبيق (لا يفتح الموقع من الإنترنت)،
// ويتصل بقاعدة البيانات نفسها، فالمعلم والطالب يريان البيانات ذاتها من الموقع أو التطبيق.
const config: CapacitorConfig = {
  appId: 'app.nabdalfahm.teacher',
  appName: 'نبض الفهم',
  webDir: 'dist',
  ios: {
    contentInset: 'always',
    backgroundColor: '#5331c4',
    limitsNavigationsToAppBoundDomains: false,
  },
};

export default config;
