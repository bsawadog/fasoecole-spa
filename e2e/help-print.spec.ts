import { test, expect } from '@playwright/test';
import { mockSchool } from './ui-fixtures';

test('prints every filtered answer without changing the screen accordion', async ({ page }) => {
  await mockSchool(page);
  await page.goto('/proprietaire/aide');
  const search = page.getByRole('searchbox', { name: 'Votre objectif' });
  await search.fill('taux horaire');
  await expect(page.locator('.help__item')).toHaveCount(1);
  await expect(page.locator('.help__answer')).toBeHidden();
  await page.evaluate(() => {
    window.print = () => { document.documentElement.dataset['printRequested'] = 'yes'; };
  });
  await page.getByRole('button', { name: 'Imprimer l’aide', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-print-requested', 'yes');
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.help__answer')).toBeVisible();
  await expect(page.locator('.help__answer')).toContainText('Au moins un créneau est obligatoire');
  await expect(page.locator('.help__filters')).toBeHidden();
  await expect(page.locator('.shell__sidebar')).toBeHidden();
  await expect(page.locator('.shell__topbar')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Imprimer l’aide', exact: true })).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
  await expect(page.locator('.help__answer')).toBeHidden();
  await page.getByRole('button', { name: 'Effacer les filtres' }).click();
  await page.emulateMedia({ media: 'print' });
  const answers = page.locator('.help__answer');
  expect(await answers.count()).toBeGreaterThan(25);
  expect(await answers.evaluateAll(nodes => nodes.every(node => getComputedStyle(node).display !== 'none'))).toBe(true);
});
