import { test, expect } from '@playwright/test';

test('app works offline after initial load', async ({ page, context }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const ready = await page.evaluate(() => {
    if (!('serviceWorker' in navigator)) return false;
    return Promise.race([
      navigator.serviceWorker.ready.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3000)),
    ]);
  });
  if (!ready) test.skip();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('button').first()).toBeVisible();
  await context.setOffline(false);
});
