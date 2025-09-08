import { test, expect } from '@playwright/test';

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const diff = (d.getDay() + 6) % 7; // Monday as start
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatYmd(d: Date): string {
  return d.toLocaleDateString('en-CA');
}

test('weekly review shows habit stats, streaks and suggestions', async ({ page }) => {
  const start = startOfWeek(new Date());
  const habit = 'Exercise';
  const statuses = [false, true, false, false, true, true, true];
  const entries: Record<string, unknown> = {};
  for (let i = 0; i < 7; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    entries[formatYmd(day)] = {
      routineTicks: [{ text: habit, done: statuses[i] }],
    };
  }

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

  await page.route('**/weekly/**', (route) =>
    route.fulfill({ status: 404, body: '' })
  );

  await page.goto('/weekly');

  const stats = page.locator('ul').first();
  const item = stats.getByRole('listitem').filter({ hasText: habit });
  await expect(item.getByText('4/7', { exact: true })).toBeVisible();
  await expect(item.getByText('3d streak')).toBeVisible();

  await expect(page.getByRole('heading', { name: 'How to improve' })).toBeVisible();
  await expect(
    page.getByText(`Focus more on ${habit} (only 4/7).`)
  ).toBeVisible();
});

