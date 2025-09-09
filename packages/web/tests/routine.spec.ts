import { test, expect, Page } from '@playwright/test';

async function ymd(page: Page, offset = 0) {
  return page.evaluate((o) => {
    const d = new Date();
    d.setDate(d.getDate() + o);
    return d.toLocaleDateString('en-CA');
  }, offset);
}

test('today entry allows adding, toggling and removing routine items', async ({ page }) => {
  const today = await ymd(page);
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

test('past entries allow toggling but not editing routine items', async ({ page }) => {
  const past = await ymd(page, -1);
  await page.route('**/entries/**', async (route) => {
    const url = new URL(route.request().url());
    const match = url.pathname.match(/entries\/(\d{4})\/(\d{2})\/(\d{2})\.json$/);
    if (match) {
      const key = `${match[1]}-${match[2]}-${match[3]}`;
      if (key === past) {
        await route.fulfill({
          status: 200,
          body: JSON.stringify({ routineTicks: [{ text: 'Exercise', done: false }] }),
        });
        return;
      }
    }
    await route.continue();
  });

  await page.goto(`/date/${past}`);
  const checkbox = page.locator('input[type="checkbox"]').first();
  await checkbox.check();
  await expect(checkbox).toBeChecked();
  await expect(page.getByRole('button', { name: '+' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '×' })).toHaveCount(0);
});

test('future entries allow toggling but not editing routine items', async ({ page }) => {
  const future = await ymd(page, 1);
  await page.route('**/entries/**', async (route) => {
    const url = new URL(route.request().url());
    const match = url.pathname.match(/entries\/(\d{4})\/(\d{2})\/(\d{2})\.json$/);
    if (match) {
      const key = `${match[1]}-${match[2]}-${match[3]}`;
      if (key === future) {
        await route.fulfill({
          status: 200,
          body: JSON.stringify({ routineTicks: [{ text: 'Exercise', done: false }] }),
        });
        return;
      }
    }
    await route.continue();
  });

  await page.goto(`/date/${future}`);
  const checkbox = page.locator('input[type="checkbox"]').first();
  await checkbox.check();
  await expect(checkbox).toBeChecked();
  await expect(page.getByRole('button', { name: '+' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '×' })).toHaveCount(0);
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
