// التحدي الذاتي: الطالب يختار الدرس ويبدأ وحده أو مع زميل متصل، دون أن يبدأ المعلم شيئًا
import { test, expect, devices, type Browser, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SHOTS = process.env.E2E_SHOTS ?? 'test-results/screens';
mkdirSync(SHOTS, { recursive: true });
// ننتظر انتهاء حركات الظهور قبل التصوير
const shot = async (p: Page, name: string) => { await p.waitForTimeout(800); await p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); };

const CSV = [
  'type,text,options,correct,lesson',
  ...['الصلاة عماد الدين', 'الصدق من الأخلاق الحميدة', 'بر الوالدين واجب', 'الأمانة من صفات المؤمن']
    .map((t) => `true_false,${t},صح|خطأ,1,الأخلاق`),
].join('\n');

async function phone(browser: Browser) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'ar' });
  return ctx.newPage();
}

async function answerAll(p: Page) {
  for (let n = 1; n <= 4; n++) {
    await expect(p.getByText(`السؤال ${n} من 4`)).toBeVisible({ timeout: 10000 });
    await p.getByRole('radio', { name: /صح/ }).click();
    await p.getByRole('button', { name: 'إرسال الإجابة' }).click();
    // بعد آخر إجابة قد ينتهي التحدي فورًا فتظهر منصة الفائز بدل رسالة الإجابة
    const feedback = p.getByText(/صحيحة! \+/);
    await expect(n < 4 ? feedback : feedback.or(p.getByTestId('game-winner'))).toBeVisible();
  }
}

test('التحدي الذاتي: الطالب يختار الدرس ويلعب وحده أو مع زميله', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ar' });
  const t = await ctx.newPage();
  await t.goto('/signup');
  const tname = `أ. الحسن ${Date.now() % 100000}`;
  await t.getByLabel('الاسم').fill(tname);
  await t.getByLabel('البريد الإلكتروني').fill(`practice${Date.now()}@test.local`);
  await t.getByLabel('كلمة المرور').fill('Passw0rd!x');
  await t.getByRole('button', { name: 'إنشاء الحساب' }).click();
  await expect(t.getByText(`أهلًا ${tname}`)).toBeVisible();
  await t.goto('/t/import');
  await t.getByPlaceholder('أو الصق محتوى CSV أو JSON هنا').fill(CSV);
  await t.getByRole('button', { name: 'تحليل النص الملصق' }).click();
  await t.getByRole('button', { name: 'استيراد 4 سؤال' }).click();
  await expect(t.getByRole('button', { name: 'الذهاب إلى بنك الأسئلة' })).toBeVisible();
  // المعلم يضيف الألغاز والأسئلة العامة الجاهزة بضغطة واحدة
  await t.goto('/t/bank');
  await t.getByTestId('starter-pack').click();
  await expect(t.getByText(/أضيف \d+ سؤالًا جاهزًا/)).toBeVisible();

  // المعلم يفعّل الرابط مرة واحدة فقط
  await t.goto('/t/challenge/new');
  await t.getByRole('button', { name: 'فعّل رابط التحديات' }).click();
  const code = (await t.getByTestId('practice-code').innerText()).trim();
  expect(code).toMatch(/^[A-Z2-9]{6}$/);
  await shot(t, '40-practice-teacher-link');

  await expect(t.getByRole('switch', { name: /بدون رمز/ })).toBeChecked();

  // طالب يلعب وحده بدون أي رمز: من الصفحة الرئيسية يضغط على الدرس فيبدأ التحدي فورًا
  // الطالب الأول على لابتوب: الصفحات تملأ عرض الشاشة
  const solo = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ar' })).newPage();
  await solo.goto('/');
  await solo.getByRole('button', { name: 'طالب', exact: true }).click();
  await solo.getByTestId('landing-practice').click();
  // إن وُجد أكثر من معلم أتاح تحدياته يختار الطالب معلمه أولًا
  const mine = solo.getByRole('button', { name: tname });
  await expect(solo.getByText(`تحديات ${tname}`).or(mine)).toBeVisible();
  if (await mine.isVisible()) await mine.click();
  await expect(solo.getByText(`تحديات ${tname}`)).toBeVisible();
  await expect(solo.getByLabel('رمز التحديات')).toHaveCount(0);
  await solo.getByPlaceholder('اكتب اسمك').fill('سلمى');
  // الطالبة تختار شخصيتها: سيارة سباق
  await solo.getByRole('tab', { name: 'سيارات ومركبات' }).click();
  await solo.getByRole('radio', { name: 'سيارة سباق' }).click();
  await shot(solo, '41-practice-lessons');
  await solo.getByTestId('lesson').filter({ hasText: 'الأخلاق' }).click();
  await expect(solo.getByText('السؤال 1 من 4')).toBeVisible();
  // تُقاس البطاقة بعد انتهاء حركة ظهورها
  await expect.poll(async () => (await solo.getByTestId('game-question').boundingBox())?.width ?? 0).toBeGreaterThan(800);
  await expect(solo.getByTestId('hearts')).toHaveAttribute('aria-label', 'القلوب 3');
  await expect(solo.getByRole('img', { name: 'سيارة سباق' }).first()).toBeVisible();
  await expect(solo.getByTestId('helps')).toBeVisible();
  // المتجر يفتح ويعرض الأسعار، ولا يسمح بالشراء دون نقاط كافية
  await solo.getByRole('button', { name: 'المتجر' }).click();
  await expect(solo.getByTestId('shop').getByRole('button', { name: /قلب إضافي/ })).toBeDisabled();
  await shot(solo, '45-shop');
  await solo.keyboard.press('Escape');
  await expect(solo.getByTestId('shop')).toBeHidden();
  await shot(solo, '44-laptop-student-game');
  await answerAll(solo);
  await expect(solo.getByTestId('game-winner')).toHaveText('سلمى', { timeout: 10000 });
  await expect(solo.getByRole('button', { name: 'تحدٍّ جديد' })).toBeVisible();

  // طالبة تنشئ غرفة، وزميلتها المتصلة تراها في القائمة وتنضم
  const host = await phone(browser);
  await host.goto(`/practice/${code}`);
  await host.getByPlaceholder('اكتب اسمك').fill('ليان');
  await host.getByRole('radio', { name: 'مع زملائي' }).click();
  await host.getByTestId('lesson').filter({ hasText: 'الأخلاق' }).click();
  await expect(host.getByTestId('room-code')).toBeVisible();

  const friend = await phone(browser);
  await friend.goto(`/practice/${code}`);
  await friend.getByPlaceholder('اكتب اسمك').fill('ريم');
  await expect(friend.getByText('ليان · الأخلاق')).toBeVisible();
  await friend.getByRole('button', { name: 'انضم' }).click();
  await expect(friend.getByText('بانتظار ليان ليبدأ التحدي')).toBeVisible();
  await expect(host.getByRole('button', { name: /ابدأ التحدي الآن \(2/ })).toBeVisible({ timeout: 10000 });
  await shot(host, '42-practice-room');
  await host.getByRole('button', { name: /ابدأ التحدي الآن/ }).click();

  await answerAll(host);
  await expect(host.getByText('أنهيت كل الأسئلة!')).toBeVisible();
  await answerAll(friend);
  await expect(friend.getByTestId('game-winner')).toBeVisible({ timeout: 10000 });
  await expect(host.getByTestId('game-winner')).toBeVisible({ timeout: 10000 });
  await shot(friend, '43-practice-friends-end');

  // لم يحضر أحد: صاحبة الغرفة تنافس الكمبيوتر
  const lone = await phone(browser);
  await lone.goto(`/practice/${code}`);
  await lone.getByPlaceholder('اكتب اسمك').fill('هند');
  await expect(lone.getByRole('radio', { name: 'ضد الكمبيوتر' })).toBeVisible();
  await lone.getByRole('radio', { name: 'مع زملائي' }).click();
  await lone.getByTestId('lesson').filter({ hasText: 'الأخلاق' }).click();
  await expect(lone.getByTestId('room-code')).toBeVisible();
  await lone.getByTestId('vs-computer').click();
  await expect(lone.getByText('السؤال 1 من 4')).toBeVisible({ timeout: 10000 });
  await expect(lone.getByText('الكمبيوتر').first()).toBeVisible();
  await shot(lone, '48-vs-computer');
  await answerAll(lone);
  // التعادل لصالح الطالب، وكل إجاباتها صحيحة فهي الفائزة
  await expect(lone.getByTestId('game-winner')).toHaveText('هند', { timeout: 10000 });

  // النتائج تصل إلى المعلم
  await t.goto('/t');
  await expect(t.getByText('تحدي ذاتي: الأخلاق').first()).toBeVisible();

  // منافسة بأكثر من درس: الطالب يحدد الألغاز والمعلومات العامة ثم يبدأ
  const multi = await phone(browser);
  await multi.goto(`/practice/${code}`);
  // الأسئلة مقسمة: دروس المنهج، والأسئلة العامة (ألغاز، رياضة، تاريخ...)
  await expect(multi.getByTestId('lesson').filter({ hasText: 'الأخلاق' })).toBeVisible();
  await multi.getByTestId('tab-general').click();
  for (const c of ['ألغاز', 'رياضة', 'تاريخ', 'دين', 'لغة عربية']) await expect(multi.getByTestId('lesson').filter({ hasText: c })).toBeVisible();
  await expect(multi.getByTestId('lesson').filter({ hasText: 'الأخلاق' })).toHaveCount(0);
  await shot(multi, '47-sections');
  // الاسم إجباري: لا يبدأ التحدي قبل كتابته
  await multi.getByTestId('lesson').filter({ hasText: 'ألغاز' }).click();
  await expect(multi.getByText('اكتب اسمك أولًا (حرفان على الأقل)')).toBeVisible();
  await expect(multi).toHaveURL(/\/practice\//);
  await multi.getByPlaceholder('اكتب اسمك').fill('نورة');
  await multi.getByTestId('multi-lessons').click();
  await expect(multi.getByTestId('start-many')).toBeDisabled();
  await multi.getByTestId('lesson').filter({ hasText: 'ألغاز' }).click();
  await multi.getByTestId('lesson').filter({ hasText: 'معلومات عامة' }).click();
  await shot(multi, '46-multi-lessons');
  await multi.getByTestId('start-many').click();
  await expect(multi.getByText(/السؤال 1 من \d+/)).toBeVisible({ timeout: 10000 });
  await expect(multi.getByText('تحدي ذاتي: ألغاز + معلومات عامة')).toBeVisible();
  await shot(multi, '47-riddle-game');
  // زر الرئيسية موجود داخل اللعبة ويعيد إلى الصفحة الرئيسية
  await multi.getByTestId('home-button').click();
  await expect(multi).toHaveURL(/\/$/);
});
