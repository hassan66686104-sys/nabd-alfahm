// تحدي الكأس بتحكم المعلم: سؤال واحد يظهر لكل الطلاب معًا، والمعلم يضغط «التالي» أو يختار السؤال
import { test, expect, devices, type Browser, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const PW = String(100000 + Math.floor(Math.random() * 900000));

const SHOTS = process.env.E2E_SHOTS ?? 'test-results/screens';
mkdirSync(SHOTS, { recursive: true });
const shot = (p: Page, name: string) => p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

const QS = ['عطارد أقرب الكواكب إلى الشمس', 'المريخ يسمى الكوكب الأحمر', 'المشتري أكبر الكواكب'];
const CSV = ['type,text,options,correct,lesson', ...QS.map((t) => `true_false,${t},صح|خطأ,1,الكواكب`)].join('\n');

async function student(browser: Browser, code: string, name: string) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'ar' });
  const page = await ctx.newPage();
  await page.goto(`/join/${code}`);
  await page.getByLabel('اسمك').fill(name);
  await page.getByRole('button', { name: 'ادخل الحصة' }).click();
  await expect(page.getByText('استعد لتحدي الكأس!')).toBeVisible();
  return page;
}

test('تحدي الكأس بتحكم المعلم: «التالي» يُظهر السؤال لكل الطلاب معًا', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ar' });
  const t = await ctx.newPage();
  await t.goto('/signup');
  await t.getByLabel('اسمك').fill('أ. سارة');
  await t.getByLabel('كلمة المرور').fill(PW);
  await t.getByRole('button', { name: 'إنشاء الحساب' }).click();
  await expect(t.getByText('أهلًا أ. سارة')).toBeVisible();

  await t.goto('/t/import');
  await t.getByPlaceholder('أو الصق محتوى CSV أو JSON هنا').fill(CSV);
  await t.getByRole('button', { name: 'تحليل النص الملصق' }).click();
  await t.getByRole('button', { name: 'استيراد 3 سؤال' }).click();
  await expect(t.getByRole('button', { name: 'الذهاب إلى بنك الأسئلة' })).toBeVisible();

  await t.goto('/t/challenge/new');
  await t.getByTestId('challenge-lessons').getByRole('button', { name: 'الكواكب' }).click();
  await t.getByTestId('challenge-pace').getByRole('radio', { name: /المعلم يتحكم في المسابقة/ }).click();
  await shot(t, '60-paced-new');
  await t.getByRole('button', { name: 'إنشاء التحدي والحصول على الرمز' }).click();
  await expect(t).toHaveURL(/\/t\/challenge\/[0-9a-f-]+$/);
  await expect(t.getByTestId('paced-note')).toBeVisible();
  const code = (await t.getByTestId('session-code').first().innerText()).trim();

  const s1 = await student(browser, code, 'منى');
  const s2 = await student(browser, code, 'يوسف');
  await expect(s1.getByTestId('paced-lobby')).toBeVisible();
  await expect(t.getByTestId('joined-count').first()).toHaveText('2');
  await t.getByRole('button', { name: 'ابدأ التحدي' }).click();

  // السؤال الأول فقط ظاهر للجميع
  const cur = t.getByTestId('paced-current-text');
  const q1 = (await cur.innerText()).trim();
  await expect(s1.getByText(q1)).toBeVisible();
  await expect(s2.getByText(q1)).toBeVisible();
  await expect(s1.getByText('السؤال 1 من 3')).toBeVisible();

  // منى تجيب فتنتظر المعلم، ويرى المعلم من أجاب
  await s1.getByRole('radio', { name: /صح/ }).click();
  await s1.getByRole('button', { name: 'إرسال الإجابة' }).click();
  await expect(s1.getByTestId('paced-waiting')).toBeVisible({ timeout: 15_000 });
  await expect(t.getByTestId('paced-answered')).toContainText('أجاب 1 من 2');
  await shot(t, '61-paced-teacher');
  await shot(s1, '62-paced-student-waiting');

  // «التالي»: يظهر السؤال الثاني للطالبين معًا، حتى ليوسف الذي لم يُجب عن الأول
  await t.getByTestId('paced-next').click();
  await expect(cur).not.toHaveText(q1);
  const q2 = (await cur.innerText()).trim();
  await expect(s1.getByText(q2)).toBeVisible();
  await expect(s2.getByText(q2)).toBeVisible();
  await expect(s2.getByText('السؤال 2 من 3')).toBeVisible();
  await shot(s2, '63-paced-student-question');

  // المعلم يختار السؤال بنفسه من القائمة
  await t.getByText(/أو اختر السؤال الذي ترسله/).click();
  await t.getByRole('button', { name: 'أرسله الآن' }).click();
  const q3 = QS.find((x) => x !== q1 && x !== q2)!;
  await expect(s1.getByText(q3)).toBeVisible();
  await expect(s2.getByText(q3)).toBeVisible();
  await expect(t.getByRole('button', { name: /انتهت الأسئلة/ })).toBeVisible();
  await t.getByRole('button', { name: /انتهت الأسئلة/ }).click();
  await t.getByRole('button', { name: 'إنهاء التحدي' }).last().click();
  await expect(s1.getByText(/فاز|الفائز|الكأس/).first()).toBeVisible();
  await shot(t, '64-paced-end');
});
