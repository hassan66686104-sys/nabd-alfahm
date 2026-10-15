// التحدي الذاتي: الطالب يختار الدرس ويبدأ وحده أو مع زميل متصل، دون أن يبدأ المعلم شيئًا
import { test, expect, devices, type Browser, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SHOTS = process.env.E2E_SHOTS ?? 'test-results/screens';
mkdirSync(SHOTS, { recursive: true });
const shot = (p: Page, name: string) => p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

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
    await expect(p.getByText(/صحيحة! \+/)).toBeVisible();
  }
}

test('التحدي الذاتي: الطالب يختار الدرس ويلعب وحده أو مع زميله', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ar' });
  const t = await ctx.newPage();
  await t.goto('/signup');
  await t.getByLabel('الاسم').fill('أ. الحسن');
  await t.getByLabel('البريد الإلكتروني').fill(`practice${Date.now()}@test.local`);
  await t.getByLabel('كلمة المرور').fill('Passw0rd!x');
  await t.getByRole('button', { name: 'إنشاء الحساب' }).click();
  await expect(t.getByText('أهلًا أ. الحسن')).toBeVisible();
  await t.goto('/t/import');
  await t.getByPlaceholder('أو الصق محتوى CSV أو JSON هنا').fill(CSV);
  await t.getByRole('button', { name: 'تحليل النص الملصق' }).click();
  await t.getByRole('button', { name: 'استيراد 4 سؤال' }).click();
  await expect(t.getByRole('button', { name: 'الذهاب إلى بنك الأسئلة' })).toBeVisible();

  // المعلم يفعّل الرابط مرة واحدة فقط
  await t.goto('/t/challenge/new');
  await t.getByRole('button', { name: 'فعّل رابط التحديات' }).click();
  const code = (await t.getByTestId('practice-code').innerText()).trim();
  expect(code).toMatch(/^[A-Z2-9]{6}$/);
  await shot(t, '40-practice-teacher-link');

  // طالب يلعب وحده: من الصفحة الرئيسية يكتب الرمز ويختار الدرس
  const solo = await phone(browser);
  await solo.goto('/');
  await solo.getByTestId('landing-practice').click();
  await solo.getByLabel('رمز التحديات').fill(code);
  await solo.getByRole('button', { name: 'متابعة' }).click();
  await expect(solo.getByText('تحديات أ. الحسن')).toBeVisible();
  await solo.getByLabel('اسمك').fill('سلمى');
  await solo.getByRole('radio', { name: /الأخلاق/ }).click();
  await shot(solo, '41-practice-lessons');
  await solo.getByRole('button', { name: 'العب وحدك' }).click();
  await answerAll(solo);
  await expect(solo.getByTestId('game-winner')).toHaveText('سلمى', { timeout: 10000 });
  await expect(solo.getByRole('button', { name: 'تحدٍّ جديد' })).toBeVisible();

  // طالبة تنشئ غرفة، وزميلتها المتصلة تراها في القائمة وتنضم
  const host = await phone(browser);
  await host.goto(`/practice/${code}`);
  await host.getByLabel('اسمك').fill('ليان');
  await host.getByRole('radio', { name: /الأخلاق/ }).click();
  await host.getByRole('button', { name: 'تحدَّ زملاءك' }).click();
  await expect(host.getByTestId('room-code')).toBeVisible();

  const friend = await phone(browser);
  await friend.goto(`/practice/${code}`);
  await friend.getByLabel('اسمك').fill('ريم');
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

  // النتائج تصل إلى المعلم
  await t.goto('/t');
  await expect(t.getByText('تحدي ذاتي: الأخلاق').first()).toBeVisible();
});
