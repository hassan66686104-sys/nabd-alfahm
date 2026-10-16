// سيناريو النجاح الكامل: معلم + ثلاثة طلاب على ثلاثة أجهزة (سياقات متصفح منفصلة)
import { test, expect, devices, type Browser, type Page } from '@playwright/test';
import { unzipSync, strFromU8 } from 'fflate';
import { readFileSync, mkdirSync } from 'node:fs';

const SHOTS = process.env.E2E_SHOTS ?? 'test-results/screens';
mkdirSync(SHOTS, { recursive: true });
const shot = (p: Page, name: string) => p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

const stamp = Date.now();
const teacher = { name: 'أ. فاطمة', email: `teacher${stamp}@test.local`, password: 'Passw0rd!x' };

async function createMcq(page: Page, text: string, options: string[], correct: number) {
  await page.goto('/t/bank/new');
  await page.getByPlaceholder('اكتب السؤال بوضوح…').fill(text);
  for (let i = 0; i < options.length; i++) await page.getByPlaceholder(`الخيار ${['أ', 'ب', 'ج', 'د'][i]}`).fill(options[i]);
  await page.getByRole('button', { name: `تحديد الخيار ${['أ', 'ب', 'ج', 'د'][correct]} كإجابة صحيحة` }).click();
  await page.getByLabel('الدرس').fill('القيم');
  await page.getByRole('button', { name: 'حفظ السؤال' }).click();
  await expect(page).toHaveURL(/\/t\/bank$/);
  await expect(page.getByText(text)).toBeVisible();
}

async function student(browser: Browser, code: string, name: string, device: keyof typeof devices, waiting = true) {
  const ctx = await browser.newContext({ ...devices[device], locale: 'ar' });
  const page = await ctx.newPage();
  await page.goto(`/join/${code}`);
  await page.getByLabel('اسمك').fill(name);
  await page.getByRole('button', { name: 'ادخل الحصة' }).click();
  if (waiting) await expect(page.getByText('أنت في الحصة!')).toBeVisible();
  else await expect(page).toHaveURL(/\/play$/);
  return page;
}

test('سيناريو الحصة الكامل من البداية إلى التقرير', async ({ browser }) => {
  const tctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ar', acceptDownloads: true });
  const t = await tctx.newPage();

  // 1. المعلم ينشئ حسابًا ويدخل
  await t.goto('/signup');
  await t.getByLabel('الاسم').fill(teacher.name);
  await t.getByLabel('البريد الإلكتروني').fill(teacher.email);
  await t.getByLabel('كلمة المرور').fill(teacher.password);
  await t.getByRole('button', { name: 'إنشاء الحساب' }).click();
  await expect(t.getByText(`أهلًا ${teacher.name}`)).toBeVisible();
  await shot(t, '01-teacher-dashboard');

  // تسجيل الخروج والدخول مجددًا
  await t.getByRole('button', { name: 'تسجيل الخروج' }).click();
  await t.goto('/login');
  await t.getByLabel('البريد الإلكتروني').fill(teacher.email);
  await t.getByLabel('كلمة المرور').fill(teacher.password);
  await t.getByRole('button', { name: 'دخول' }).click();
  await expect(t.getByText(`أهلًا ${teacher.name}`)).toBeVisible();

  // 2. إنشاء الأسئلة في البنك وتعديل أحدها
  await createMcq(t, 'ما القيمة التي تدل على قول الحق؟', ['الصدق', 'الكذب', 'الغش', 'الكسل'], 0);
  await createMcq(t, 'كم عدد أيام الأسبوع؟', ['5', '6', '7', '8'], 2);
  await t.getByText('كم عدد أيام الأسبوع؟').click();
  await expect(t).toHaveURL(/\/t\/bank\/[0-9a-f-]+$/);
  await t.getByPlaceholder('اكتب السؤال بوضوح…').fill('كم عدد أيام الأسبوع الواحد؟');
  await t.getByRole('button', { name: 'حفظ التعديلات' }).click();
  await expect(t.getByText('كم عدد أيام الأسبوع الواحد؟')).toBeVisible();
  // سؤال مفتوح لسحابة الكلمات
  await t.goto('/t/bank/new');
  await t.getByLabel('نوع السؤال').selectOption('open_ended');
  await t.getByPlaceholder('اكتب السؤال بوضوح…').fill('ما أهم قيمة تعلمتها من الدرس؟');
  await t.getByRole('button', { name: 'حفظ السؤال' }).click();
  await expect(t).toHaveURL(/\/t\/bank$/);
  await shot(t, '02-question-bank');

  // 3. حصة جديدة من البنك
  await t.goto('/t/sessions/new');
  await t.getByLabel('اسم الحصة').fill('حصة الصدق — تجربة');
  await t.getByRole('button', { name: 'من البنك' }).click();
  const dlg = t.getByRole('dialog');
  await dlg.getByText('ما القيمة التي تدل على قول الحق؟').click();
  await dlg.getByText('كم عدد أيام الأسبوع الواحد؟').click();
  await dlg.getByText('ما أهم قيمة تعلمتها من الدرس؟').click();
  await dlg.getByRole('button', { name: /إضافة/ }).click();
  await t.getByRole('button', { name: 'إنشاء الحصة والحصول على الرمز' }).click();
  await expect(t).toHaveURL(/\/t\/live\//);
  const code = (await t.getByTestId('session-code').first().innerText()).trim();
  expect(code).toMatch(/^[A-Z0-9]{6}$/);
  const sessionId = t.url().split('/').pop()!;
  await shot(t, '03-live-lobby');

  // 4-5. ثلاثة طلاب من ثلاثة أجهزة مختلفة
  const s1 = await student(browser, code, 'أحمد', 'iPhone 13');
  const s2 = await student(browser, code, 'سارة', 'Pixel 7');
  const s3 = await student(browser, code, 'خالد', 'iPad Mini');
  // عدد المنضمين يتحدث لدى المعلم دون تحديث الصفحة
  await expect(t.getByTestId('joined-count').first()).toHaveText('3');
  await shot(s1, '04-student-waiting-phone');

  // رمز خاطئ يعطي رسالة عربية واضحة
  const bad = await (await browser.newContext()).newPage();
  await bad.goto('/join/ZZZZZZ');
  await expect(bad.getByText('رمز الحصة غير صحيح')).toBeVisible();

  // شاشة العرض
  const present = await tctx.newPage();
  await present.goto(`/present/${sessionId}`);
  await expect(present.getByText('انضم إلى الحصة')).toBeVisible();
  await shot(present, '05-present-lobby');

  // 6. إرسال السؤال الأول
  await t.getByRole('button', { name: 'إرسال السؤال' }).click();
  for (const s of [s1, s2, s3]) await expect(s.getByText('ما القيمة التي تدل على قول الحق؟')).toBeVisible();
  await expect(present.getByText('ما القيمة التي تدل على قول الحق؟')).toBeVisible();

  await s1.getByRole('radio', { name: /الصدق/ }).click();
  await shot(s1, '06-student-question-phone');
  // ضغط مزدوج سريع: يجب ألا تُسجل الإجابة مرتين
  await s1.getByRole('button', { name: 'إرسال الإجابة' }).dblclick();
  await s2.getByRole('radio', { name: /الكذب/ }).click();
  await s2.getByRole('button', { name: 'إرسال الإجابة' }).click();
  await s3.getByRole('radio', { name: /الصدق/ }).click();
  await s3.getByRole('button', { name: 'إرسال الإجابة' }).click();
  for (const s of [s1, s2, s3]) await expect(s.getByText(/تم استلام إجابتك/)).toBeVisible();

  // 7-8. تظهر الإجابات والإحصاءات لدى المعلم دون تحديث
  await expect(t.getByText('أجاب 3 من 3')).toBeVisible();
  await expect(t.getByText('خاطئة: 1').first()).toBeVisible();
  await expect(t.getByText('67%').first()).toBeVisible();
  await expect(t.getByText('يحتاج إلى تعزيز').first()).toBeVisible();
  await expect(t.getByText('سارة').first()).toBeVisible(); // في قائمة من يحتاج دعمًا
  await shot(t, '07-teacher-live-insights');
  // شاشة العرض تخفي النتائج حتى الإغلاق (الإعداد الافتراضي)
  await expect(present.getByText('أجاب 3 من 3')).toBeVisible();

  // 9. إغلاق السؤال وكشف الإجابة
  await t.getByRole('button', { name: 'إغلاق السؤال' }).click();
  await expect(s1.getByText(/انتظر قرار المعلم/)).toBeVisible();
  await t.getByRole('button', { name: 'إظهار الإجابة الصحيحة' }).click();
  await expect(s1.getByText('إجابتك صحيحة، أحسنت!')).toBeVisible();
  await expect(s2.getByText(/إجابتك غير صحيحة/)).toBeVisible();
  await shot(s2, '08-student-revealed-phone');
  await shot(present, '09-present-revealed');

  // 10. السؤال التالي
  await t.getByRole('button', { name: 'السؤال التالي' }).click();
  for (const s of [s1, s2, s3]) await expect(s.getByText('كم عدد أيام الأسبوع الواحد؟')).toBeVisible();
  for (const [s, ans] of [[s1, '7'], [s2, '7'], [s3, '6']] as const) {
    await s.getByRole('radio', { name: new RegExp(`^.?\\s*${ans}$`) }).click();
    await s.getByRole('button', { name: 'إرسال الإجابة' }).click();
  }
  await expect(t.getByText('أجاب 3 من 3')).toBeVisible();

  // سؤال مفتوح وسحابة كلمات
  await t.getByRole('button', { name: 'السؤال التالي' }).click();
  for (const [s, txt] of [[s1, 'الصدق والأمانة'], [s2, 'الصدق'], [s3, 'الأمانة في العمل']] as const) {
    await expect(s.getByText('ما أهم قيمة تعلمتها من الدرس؟')).toBeVisible();
    await s.getByLabel('إجابتك').fill(txt);
    await s.getByRole('button', { name: 'إرسال الإجابة' }).click();
    await expect(s.getByText(/تم استلام إجابتك/)).toBeVisible();
  }
  await expect(t.getByText('أجاب 3 من 3')).toBeVisible();
  await t.getByRole('button', { name: /الإجابات \(3\)/ }).click();
  const approve = t.getByRole('button', { name: 'اعتماد للعرض', exact: true });
  for (let i = 0; i < 3; i++) {
    await approve.first().click();
    await expect(approve).toHaveCount(2 - i);
  }
  await expect(t.getByRole('button', { name: 'معتمدة للعرض ✓' })).toHaveCount(3);
  await expect(present.getByText('الصدق').first()).toBeVisible();
  await shot(present, '10-present-wordcloud');
  await t.getByRole('button', { name: 'سحابة كلمات' }).click();
  await shot(t, '11-teacher-open-answers');

  // 11. إنهاء الحصة
  await t.getByRole('button', { name: 'إنهاء الحصة' }).first().click();
  await t.getByRole('dialog').getByRole('button', { name: 'إنهاء الحصة' }).click();
  await expect(t).toHaveURL(new RegExp(`/t/reports/${sessionId}$`));
  for (const s of [s1, s2, s3]) await expect(s.getByText('انتهت الحصة')).toBeVisible();
  // الانضمام بعد الانتهاء مرفوض
  await bad.goto(`/join/${code}`);
  await expect(bad.getByText(/انتهت هذه الحصة/)).toBeVisible();

  // 12. التقرير محفوظ
  await expect(t.getByText('حصة الصدق — تجربة').first()).toBeVisible();
  await expect(t.getByText('نتائج الطلاب الفردية')).toBeVisible();
  await expect(t.getByRole('cell', { name: 'سارة' })).toBeVisible();
  await shot(t, '12-report');

  // 13. التصدير
  const [xl] = await Promise.all([t.waitForEvent('download'), t.getByRole('button', { name: 'Excel' }).click()]);
  const xlPath = `${SHOTS}/report.xlsx`;
  await xl.saveAs(xlPath);
  const files = unzipSync(new Uint8Array(readFileSync(xlPath)));
  const students = strFromU8(files['xl/worksheets/sheet3.xml']);
  expect(students).toContain('أحمد');
  expect(students).toContain('سارة');
  const [csv] = await Promise.all([t.waitForEvent('download'), t.getByRole('button', { name: 'CSV' }).click()]);
  await csv.saveAs(`${SHOTS}/report.csv`);
  expect(readFileSync(`${SHOTS}/report.csv`, 'utf8')).toContain('حصة الصدق — تجربة');

  // العودة لاحقًا: التقرير في قائمة تقاريري
  await t.goto('/t/reports');
  await t.getByText('حصة الصدق — تجربة').click();
  await expect(t).toHaveURL(new RegExp(`/t/reports/${sessionId}$`));
  await expect(t.getByText('الأسئلة الأكثر صعوبة')).toBeVisible();

  // عرض لوحة المعلم على الهاتف والآيباد
  for (const [dev, name] of [['iPhone 13', '13-teacher-phone'], ['iPad (gen 7)', '14-teacher-ipad']] as const) {
    const c = await browser.newContext({ ...devices[dev], storageState: await tctx.storageState(), locale: 'ar' });
    const p = await c.newPage();
    await p.goto('/t');
    await expect(p.getByText('حصة جديدة', { exact: true })).toBeVisible();
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await shot(p, name);
    await c.close();
  }
});

test('اختبر فهمهم الآن: من السؤال إلى الحصة بسرعة', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'ar' });
  const t = await ctx.newPage();
  await t.goto('/signup');
  await t.getByLabel('الاسم').fill('أ. يوسف');
  await t.getByLabel('البريد الإلكتروني').fill(`quick${Date.now()}@test.local`);
  await t.getByLabel('كلمة المرور').fill(teacher.password);
  await t.getByRole('button', { name: 'إنشاء الحساب' }).click();
  await expect(t.getByText('أهلًا أ. يوسف')).toBeVisible();
  const started = Date.now();
  await t.getByRole('link', { name: 'اختبر فهمهم', exact: true }).first().click();
  await t.getByRole('button', { name: /صح أو خطأ/ }).click();
  await t.getByLabel('السؤال', { exact: true }).fill('الصدق من الأخلاق الحميدة');
  await t.getByRole('button', { name: 'ابدأ الآن' }).click();
  await expect(t).toHaveURL(/\/t\/live\//);
  const code = (await t.getByTestId('session-code').first().innerText()).trim();
  expect(Date.now() - started).toBeLessThan(60_000);
  // السؤال أُرسل فورًا (بلا مؤقت)، لذا يظهر للطالب مباشرة بدل شاشة الانتظار
  const sp = await student(browser, code, 'منى', 'iPhone 13', false);
  await expect(sp.getByText('الصدق من الأخلاق الحميدة')).toBeVisible();
  await sp.getByRole('radio', { name: /صح/ }).click();
  await sp.getByRole('button', { name: 'إرسال الإجابة' }).click();
  await expect(t.getByText('أجاب 1 من 1')).toBeVisible();
});

test('حماية البيانات عبر الواجهة البرمجية: الطالب لا يرى الإجابات الصحيحة', async ({ request }) => {
  const url = process.env.E2E_SUPABASE_URL ?? 'http://localhost:54321';
  const key = process.env.E2E_ANON_KEY!;
  for (const table of ['question_options', 'questions', 'responses', 'session_questions', 'participants']) {
    const r = await request.get(`${url}/rest/v1/${table}?select=*`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    expect(r.status(), table).toBe(401);
  }
  const r = await request.post(`${url}/rest/v1/rpc/push_question`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, data: { p_sq: '00000000-0000-0000-0000-000000000000' } });
  expect([401, 403, 404]).toContain(r.status());
});
