import { expect, test } from '@playwright/test';

// E2E test exercising the weekly review page. It seeds a full week of diary
// entries and ensures the UI reports the correct completion ratio, current
// streak and improvement suggestion.

/** Helper returning the Monday at the start of the given week. */
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

/**
 * Seed a full week's worth of entries for a habit using the provided
 * completion statuses.
 */
function seedWeek(
  habit: string,
  start: Date,
  statuses: boolean[],
): Record<string, unknown> {
  const entries: Record<string, unknown> = {};
  for (let i = 0; i < statuses.length; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    entries[formatYmd(day)] = {
      routineTicks: [{ text: habit, done: statuses[i] }],
    };
  }
  return entries;
}

test('weekly review shows habit stats, streaks and suggestions', async ({
  page,
}) => {
  const habit = 'Exercise';
  const start = startOfWeek(new Date());
  const statuses = [false, true, false, false, true, true, true]; // 7 days
  const entries = seedWeek(habit, start, statuses);

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
    page.getByText(`Focus more on ${habit} (only 4/7).`),
  ).toBeVisible();
});

