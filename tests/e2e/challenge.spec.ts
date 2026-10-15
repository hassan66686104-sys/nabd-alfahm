// تحدي الكأس: الطلاب يلعبون وحدهم، ينتقلون للسؤال التالي فور الإجابة، يرمون رقم الحظ، ويفوز أول من يصل للهدف
import { test, expect, devices, type Browser, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SHOTS = process.env.E2E_SHOTS ?? 'test-results/screens';
mkdirSync(SHOTS, { recursive: true });
const shot = (p: Page, name: string) => p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

const CSV = [
  'type,text,options,correct,lesson',
  ...['عطارد أقرب الكواكب إلى الشمس', 'المريخ يسمى الكوكب الأحمر', 'المشتري أكبر الكواكب', 'الأرض تدور حول الشمس', 'القمر يدور حول الأرض']
    .map((t) => `true_false,${t},صح|خطأ,1,الكواكب`),
].join('\n');

async function student(browser: Browser, code: string, name: string) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'ar' });
  const page = await ctx.newPage();
  await page.goto(`/join/${code}`);
  await page.getByLabel('اسمك').fill(name);
  await page.getByRole('button', { name: 'ادخل الحصة' }).click();
  await expect(page.getByText('استعد لتحدي الكأس!')).toBeVisible();
  return page;
}

async function answer(p: Page, n: number, choice: 'صح' | 'خطأ') {
  await expect(p.getByText(`السؤال ${n} من 5`)).toBeVisible();
  await p.getByRole('radio', { name: new RegExp(choice) }).click();
  await p.getByRole('button', { name: 'إرسال الإجابة' }).click();
}

test('تحدي الكأس: لعب ذاتي ورقم الحظ والفوز بالكأس', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ar' });
  const t = await ctx.newPage();
  await t.goto('/signup');
  await t.getByLabel('الاسم').fill('أ. الحسن');
  await t.getByLabel('البريد الإلكتروني').fill(`cup${Date.now()}@test.local`);
  await t.getByLabel('كلمة المرور').fill('Passw0rd!x');
  await t.getByRole('button', { name: 'إنشاء الحساب' }).click();
  await expect(t.getByText('أهلًا أ. الحسن')).toBeVisible();

  // أسئلة درس «الكواكب» في البنك
  await t.goto('/t/import');
  await t.getByPlaceholder('أو الصق محتوى CSV أو JSON هنا').fill(CSV);
  await t.getByRole('button', { name: 'تحليل النص الملصق' }).click();
  await t.getByRole('button', { name: 'استيراد 5 سؤال' }).click();
  await expect(t.getByRole('button', { name: 'الذهاب إلى بنك الأسئلة' })).toBeVisible();

  // إنشاء التحدي من الصفحة الرئيسية: يختار المعلم الدرس فقط
  await t.goto('/t');
  await t.getByTestId('challenge-banner').click();
  await expect(t).toHaveURL(/\/t\/challenge\/new$/);
  await t.getByLabel('اختر الدرس').selectOption('الكواكب');
  await expect(t.getByText('المشتري أكبر الكواكب')).toBeVisible();
  await t.getByLabel('النقاط المطلوبة للكأس').fill('50');
  await t.getByLabel('الجائزة (اختياري)').fill('كأس الفصل');
  await shot(t, '30-challenge-new');
  await t.getByRole('button', { name: 'إنشاء التحدي والحصول على الرمز' }).click();
  await expect(t).toHaveURL(/\/t\/challenge\/[0-9a-f-]+$/);
  const code = (await t.getByTestId('session-code').first().innerText()).trim();

  const s1 = await student(browser, code, 'منى');
  const s2 = await student(browser, code, 'يوسف');
  await expect(t.getByTestId('joined-count').first()).toHaveText('2');
  await t.getByRole('button', { name: 'ابدأ التحدي' }).click();

  // يوسف يخطئ فيرى الإجابة الصحيحة ثم ينتقل وحده للسؤال التالي
  await answer(s2, 1, 'خطأ');
  await expect(s2.getByText('إجابة غير صحيحة')).toBeVisible();
  await expect(s2.getByText('الإجابة الصحيحة: صح')).toBeVisible();
  await expect(s2.getByText('السؤال 2 من 5')).toBeVisible({ timeout: 8000 });

  // منى تجيب ثلاث إجابات صحيحة متتالية فتكسب رمية حظ
  for (let n = 1; n <= 3; n++) {
    await answer(s1, n, 'صح');
    await expect(s1.getByText(/صحيحة! \+10/)).toBeVisible();
  }
  await expect(s1.getByTestId('my-points')).toHaveText('30');
  await s1.getByRole('button', { name: 'ارمِ رقم الحظ' }).click();
  await expect(s1.getByTestId('roll-result')).toBeVisible();
  await shot(s1, '31-challenge-roll');
  const needsTarget = await s1.getByRole('button', { name: 'اختر الهدف' }).isVisible();
  if (needsTarget) {
    await s1.getByRole('button', { name: 'اختر الهدف' }).click();
    await s1.getByRole('button', { name: /يوسف/ }).click();
  } else {
    await s1.getByRole('button', { name: 'رائع!' }).click();
  }
  await expect(t.getByTestId('game-events')).toContainText('منى');

  // قد يصل رقم الحظ بمنى إلى الهدف قبل السؤال الخامس
  for (let n = 4; n <= 5; n++) {
    await expect(s1.getByTestId('game-winner').or(s1.getByText(`السؤال ${n} من 5`))).toBeVisible({ timeout: 10000 });
    if (await s1.getByTestId('game-winner').isVisible()) break;
    await answer(s1, n, 'صح');
  }
  await expect(s1.getByTestId('game-winner')).toHaveText('منى', { timeout: 10000 });
  await expect(s1.getByText('مبارك! أنت بطل التحدي 🎉')).toBeVisible();
  await expect(s2.getByTestId('game-winner')).toHaveText('منى', { timeout: 10000 });
  await expect(s2.getByText('كأس الفصل')).toBeVisible();
  await expect(t.getByTestId('game-winner')).toHaveText('منى', { timeout: 10000 });
  await shot(s1, '32-challenge-winner-student');
  await shot(t, '33-challenge-winner-teacher');
  // التحدي يدخل في تقارير الفهم
  await t.getByRole('button', { name: 'تقرير الفهم' }).click();
  await expect(t).toHaveURL(/\/t\/reports\/[0-9a-f-]+$/);
});
