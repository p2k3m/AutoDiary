import { test, expect, Page } from '@playwright/test';

async function todayYmd(page: Page) {
  return page.evaluate(() => new Date().toLocaleDateString('en-CA'));
}

async function nextYmd(page: Page, ymd: string) {
  return page.evaluate((d) => {
    const date = new Date(d);
    date.setDate(date.getDate() + 1);
    return date.toLocaleDateString('en-CA');
  }, ymd);
}

test('overflow textarea receives extra lines', async ({ page }) => {
  const today = await todayYmd(page);
  await page.goto(`/date/${today}`);
  const main = page.locator('textarea').first();
  const lines = Array.from({ length: 30 }, (_, i) => `line${i + 1}`).join('\n');
  await main.fill(lines);
  const overflow = page.locator('details textarea');
  await expect(overflow).toHaveValue('line29\nline30');
});

test('Next button moves to following day', async ({ page }) => {
  const today = await todayYmd(page);
  const next = await nextYmd(page, today);
  await page.goto(`/date/${today}`);
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page).toHaveURL(new RegExp(`/date/${next}$`));
});
