import { test, expect } from '@playwright/test';

// Verify that theme cycles through light -> dark -> paper -> light

test('cycles through available themes', async ({ page }) => {
  await page.goto('/');
  const button = page.getByRole('button', { name: 'Toggle theme' });
  const html = page.locator('html');

  await expect(html).toHaveAttribute('data-theme', 'light');
  await button.click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await button.click();
  await expect(html).toHaveAttribute('data-theme', 'paper');
  await button.click();
  await expect(html).toHaveAttribute('data-theme', 'light');
});
