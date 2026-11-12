import { test, expect } from '@playwright/test';

test.use({ serviceWorkers: 'allow' });

test('public home reloads offline with all its images and no asset 504', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await expect(page.locator('h1')).toContainText('Apprendre');
  await expect(page.locator('app-root')).toHaveAttribute('data-offline-ready', 'true');
  const errors: string[] = [];
  page.on('response', response => { if (response.status() === 504) errors.push(response.url()); });
  await context.setOffline(true);
  const response = await page.reload();
  expect(response?.status()).toBe(200);
  await expect(page.locator('h1')).toContainText('Apprendre');
  await expect.poll(() => page.locator('img').evaluateAll(images => images.filter(image => !image.complete || !image.naturalWidth).map(image => image.getAttribute('src')))).toEqual([]);
  expect(errors).toEqual([]);
});
