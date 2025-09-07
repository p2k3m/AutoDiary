import { test, expect, Page } from '@playwright/test';

async function todayYmd(page: Page) {
  return page.evaluate(() => new Date().toLocaleDateString('en-CA'));
}

test('add, toggle and remove routine items', async ({ page }) => {
  const today = await todayYmd(page);
  await page.goto(`/date/${today}`);
  // Add a new routine item
  await page.getByRole('button', { name: '+' }).click();
  const input = page.locator('input[placeholder="Task 1"]');
  await input.fill('My Task');
  // Toggle checkbox
  const checkbox = page.locator('input[type="checkbox"]').first();
  await checkbox.check();
  await expect(checkbox).toBeChecked();
  // Remove item
  await page.getByRole('button', { name: '×' }).click();
  await expect(input).toHaveCount(0);
});
