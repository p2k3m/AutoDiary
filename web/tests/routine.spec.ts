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

test('weekly review reflects routine completion and streak', async ({ page }) => {
  // Calculate first three days of the current week (Monday as start).
  const today = new Date();
  const start = new Date(today);
  const diff = (today.getDay() + 6) % 7;
  start.setDate(today.getDate() - diff);
  const ymd = (d: Date) => d.toLocaleDateString('en-CA');
  const day1 = ymd(start);
  const day2 = ymd(new Date(start.getTime() + 24 * 60 * 60 * 1000));
  const day3 = ymd(new Date(start.getTime() + 2 * 24 * 60 * 60 * 1000));

  const entries: Record<string, unknown> = {
    [day1]: { routineTicks: [{ text: 'Exercise', done: false }] },
    [day2]: { routineTicks: [{ text: 'Exercise', done: true }] },
    [day3]: { routineTicks: [{ text: 'Exercise', done: true }] },
  };

  await page.route('**/entries/**', async (route) => {
    const url = new URL(route.request().url());
    const match = url.pathname.match(/entries\/(\d{4})\/(\d{2})\/(\d{2})\.json$/);
    if (match) {
      const key = `${match[1]}-${match[2]}-${match[3]}`;
      const body = entries[key];
      if (body) {
        await route.fulfill({ status: 200, body: JSON.stringify(body) });
      } else {
        await route.fulfill({ status: 404, body: '' });
      }
      return;
    }
    await route.continue();
  });

  await page.goto('/weekly');
  const item = page.getByRole('listitem').filter({ hasText: 'Exercise' });
  await expect(item.getByText('2/3')).toBeVisible();
  await expect(item.getByText('2d streak')).toBeVisible();
});
