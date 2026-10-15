// متطلبات المتجر: صفحة الخصوصية، وحذف المعلم حسابه بنفسه مع بياناته
import { test, expect } from '@playwright/test';

test('سياسة الخصوصية وحذف الحساب من الإعدادات', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'سياسة الخصوصية' }).click();
  await expect(page.getByRole('heading', { name: 'سياسة الخصوصية' })).toBeVisible();
  await expect(page.getByText('لا نبيع البيانات')).toBeVisible();

  const email = `del${Date.now()}@test.local`;
  await page.goto('/signup');
  await page.getByLabel('الاسم').fill('معلم مؤقت');
  await page.getByLabel('البريد الإلكتروني').fill(email);
  await page.getByLabel('كلمة المرور').fill('Passw0rd!x');
  await page.getByRole('button', { name: 'إنشاء الحساب' }).click();
  await expect(page.getByText('أهلًا معلم مؤقت')).toBeVisible();

  await page.goto('/t/settings');
  const box = page.getByTestId('delete-account');
  const btn = box.getByRole('button', { name: 'حذف حسابي نهائيًا' });
  await expect(btn).toBeDisabled();
  await box.getByLabel('تأكيد حذف الحساب').fill('حذف');
  await btn.click();
  await page.getByRole('button', { name: 'احذف حسابي' }).click();
  await expect(page.getByText('حُذف حسابك وكل بياناته')).toBeVisible();

  // لا يمكن الدخول بالحساب المحذوف
  await page.goto('/login');
  await page.getByLabel('البريد الإلكتروني').fill(email);
  await page.getByLabel('كلمة المرور').fill('Passw0rd!x');
  await page.getByRole('button', { name: 'دخول' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});
