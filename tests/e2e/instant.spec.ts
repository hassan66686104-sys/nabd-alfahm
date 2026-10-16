// الأسئلة الفورية: معلم يطرح أسئلة نعم/لا وصح/خطأ، وطالبان يجيبان من هاتفين
import { test, expect, devices, type Browser } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SHOTS = process.env.E2E_SHOTS ?? 'test-results/screens';
mkdirSync(SHOTS, { recursive: true });

async function student(browser: Browser, code: string, name: string) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'ar' });
  const page = await ctx.newPage();
  await page.goto(`/join/${code}`);
  await page.getByLabel('اسمك').fill(name);
  await page.getByRole('button', { name: 'ادخل الحصة' }).click();
  await expect(page.getByText('أنت في الحصة!')).toBeVisible();
  return page;
}

test('الأسئلة الفورية: سؤال رأي بنعم/لا ثم سؤال صح/خطأ مع كشف الإجابة', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ar' });
  const t = await ctx.newPage();
  await t.goto('/signup');
  await t.getByLabel('الاسم').fill('أ. الحسن');
  await t.getByLabel('البريد الإلكتروني').fill(`instant${Date.now()}@test.local`);
  await t.getByLabel('كلمة المرور').fill('Passw0rd!x');
  await t.getByRole('button', { name: 'إنشاء الحساب' }).click();
  await expect(t.getByText('أهلًا أ. الحسن')).toBeVisible();

  // البطاقة في الصفحة الرئيسية للمعلم
  await t.getByTestId('instant-banner').click();
  await expect(t).toHaveURL(/\/t\/instant$/);
  await t.getByRole('button', { name: 'ابدأ جلسة الأسئلة الفورية' }).click();
  const code = (await t.getByTestId('session-code').first().innerText()).trim();
  expect(code).toMatch(/^[A-Z0-9]{6}$/);

  const s1 = await student(browser, code, 'منى');
  const s2 = await student(browser, code, 'يوسف');
  await expect(t.getByTestId('joined-count').first()).toHaveText('2');
  // قبل أول سؤال يرى المعلم من انضم بالاسم
  await expect(t.getByTestId('waiting-player')).toHaveCount(2);
  await expect(t.getByTestId('waiting-room').getByText('يوسف')).toBeVisible();

  // سؤال رأي شفهي بلا نص وبلا إجابة صحيحة
  await t.getByRole('button', { name: 'اطرح السؤال الآن' }).click();
  for (const [p, choice] of [[s1, 'نعم'], [s2, 'لا']] as const) {
    await expect(p.getByText('سؤال شفهي: استمع إلى المعلم ثم أجب')).toBeVisible();
    await p.getByRole('radio', { name: new RegExp(choice) }).click();
    await p.getByRole('button', { name: 'إرسال الإجابة' }).click();
  }
  await expect(t.getByTestId('instant-answered')).toHaveText('2');
  await expect(t.getByTestId('instant-count-0')).toHaveText('1');
  await expect(t.getByTestId('instant-count-1')).toHaveText('1');
  await t.getByRole('button', { name: 'أظهر النتيجة للطلاب' }).click();
  await expect(s1.getByText('شكرًا، سُجّلت إجابتك.')).toBeVisible();

  // سؤال صح/خطأ مكتوب بإجابة صحيحة
  await t.getByRole('radio', { name: 'صح / خطأ' }).click();
  await t.getByLabel('نص السؤال').fill('الماء يغلي عند 100 درجة مئوية');
  await t.getByRole('button', { name: 'صح', exact: true }).click();
  await t.getByRole('button', { name: 'اطرح السؤال الآن' }).click();
  for (const [p, choice] of [[s1, 'صح'], [s2, 'خطأ']] as const) {
    await expect(p.getByText('الماء يغلي عند 100 درجة مئوية')).toBeVisible();
    await p.getByRole('radio', { name: new RegExp(choice) }).click();
    await p.getByRole('button', { name: 'إرسال الإجابة' }).click();
  }
  await expect(t.getByTestId('instant-answered')).toHaveText('2');
  await t.screenshot({ path: `${SHOTS}/16-instant-teacher.png`, fullPage: true });
  await t.getByRole('button', { name: 'اكشف الإجابة الصحيحة' }).click();
  await expect(s1.getByText('إجابتك صحيحة، أحسنت!')).toBeVisible();
  await expect(s2.getByText(/إجابتك غير صحيحة/)).toBeVisible();
  await s1.screenshot({ path: `${SHOTS}/17-instant-student.png` });
  await expect(t.getByText('الأسئلة السابقة')).toBeVisible();

  // سؤال مفتوح: يكتب الطالب، وتظهر إجابته عند المعلم وعلى شاشة العرض فورًا دون اعتماد
  const present = await ctx.newPage();
  await t.getByRole('radio', { name: /يكتب الطالب/ }).click();
  await t.getByLabel('نص السؤال').fill('ما أجمل ما تعلمته اليوم؟');
  await t.getByRole('button', { name: 'اطرح السؤال الآن' }).click();
  const sessionId = await t.evaluate(() => localStorage.getItem('nabd.instant-session'));
  await present.goto(`/present/${sessionId}`);
  await expect(present.getByText('ما أجمل ما تعلمته اليوم؟')).toBeVisible();
  for (const [p, text] of [[s1, 'الصدق منجاة'], [s2, 'حب الوطن']] as const) {
    await expect(p.getByText('ما أجمل ما تعلمته اليوم؟')).toBeVisible();
    await p.getByLabel('إجابتك').fill(text);
    await p.getByRole('button', { name: 'إرسال الإجابة' }).click();
  }
  await expect(t.getByTestId('open-answers').getByText('الصدق منجاة')).toBeVisible();
  await expect(t.getByTestId('open-answers').getByText('حب الوطن')).toBeVisible();
  await expect(present.getByTestId('present-answer')).toHaveCount(2);
  await t.screenshot({ path: `${SHOTS}/50-instant-open-teacher.png`, fullPage: true });
  await present.screenshot({ path: `${SHOTS}/51-instant-open-screen.png`, fullPage: true });
  await present.close();

  // الإنهاء يحفظ تقريرًا
  await t.getByRole('button', { name: 'إنهاء وعرض التقرير' }).click();
  await t.getByRole('button', { name: 'إنهاء', exact: true }).click();
  await expect(t).toHaveURL(/\/t\/reports\//);
  await expect(t.getByText('الماء يغلي عند 100 درجة مئوية').first()).toBeVisible();
  await t.screenshot({ path: `${SHOTS}/18-instant-report.png`, fullPage: true });
});
