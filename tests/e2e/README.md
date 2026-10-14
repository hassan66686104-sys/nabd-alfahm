# اختبارات المتصفح (E2E)

## على مشروع Supabase حقيقي (يُفضّل مشروع اختبار منفصل)
```bash
npm run build && npm run preview &        # بعد ضبط .env لمشروع الاختبار
E2E_BASE_URL=http://localhost:4173 E2E_SUPABASE_URL=https://xxx.supabase.co E2E_ANON_KEY=... npm run test:e2e
```
يتطلب تعطيل «Confirm email» في مشروع الاختبار حتى يدخل المعلم التجريبي مباشرة.

## بيئة محلية بدون Docker (ما استُخدم أثناء التطوير)
`stack/start.sh` يشغّل: PostgreSQL محلي + GoTrue (خادم المصادقة الرسمي لـ Supabase) + PostgREST + بوابة بسيطة على المنفذ 54321 تحاكي Kong.
لا تتضمن Supabase Realtime؛ فيعمل التطبيق بالاحتياطي الدوري.

```bash
# PostgreSQL 15+ على المنفذ 54329 مع wal_level=logical
# ملفات تنفيذية: https://github.com/supabase/auth/releases (auth + migrations) و https://github.com/PostgREST/postgrest/releases
STACK_BIN=/path/to/bin bash tests/e2e/stack/start.sh
printf "VITE_SUPABASE_URL=http://localhost:54321\nVITE_SUPABASE_ANON_KEY=$(node tests/e2e/stack/jwt.mjs anon)\n" > .env.local
npm run build && npx vite preview --port 4173 &
E2E_ANON_KEY=$(node tests/e2e/stack/jwt.mjs anon) npm run test:e2e
```
المفاتيح في `stack/jwt.mjs` للاختبار المحلي فقط.
