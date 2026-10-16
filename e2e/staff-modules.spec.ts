import { test, expect } from '@playwright/test';
import { mockSchool } from './ui-fixtures';

test('personnel form offers seventeen independent module permissions', async ({ page }) => {
  await mockSchool(page);
  await page.goto('/proprietaire/personnel');
  await page.getByRole('button', { name: '+ Ajouter un membre', exact: true }).click();
  const permissions = page.locator('.stf__modules');
  await expect(permissions.getByRole('checkbox')).toHaveCount(17);
  await expect(permissions.getByRole('group', { name: 'Vie scolaire et familles', exact: true })).toBeVisible();
  await permissions.getByRole('checkbox', { name: /^Bibliothèque/ }).check();
  await expect(permissions.getByRole('checkbox', { name: /^Élèves & dossiers/ })).not.toBeChecked();
  await expect(permissions.getByRole('checkbox', { name: /^Messages/ })).not.toBeChecked();
  await expect(permissions.getByRole('checkbox', { name: /^Brouillard de caisse/ })).toBeVisible();
  await expect(permissions.getByRole('checkbox', { name: /^États financiers/ })).toBeVisible();
});

test('a librarian can open the library without access to student records or messages', async ({ page }) => {
  await mockSchool(page, 'proprietaire', [], ['LIBRARY']);
  await page.route('**/api/school-life/**', route => route.fulfill({ json: {
    students: [], events: [], observations: [], requests: [], books: [], loans: [], homeworks: [],
  } }));
  await page.goto('/proprietaire');
  await expect(page).toHaveURL(/\/proprietaire\/bibliotheque$/);
  await expect(page.locator('.life h1')).toHaveText('Bibliothèque');
  await expect(page.locator('#modules-menu a[href="/proprietaire/bibliotheque"]')).toBeVisible();
  await expect(page.locator('#modules-menu a[href="/proprietaire/classes"]')).toHaveCount(0);
  await expect(page.locator('a[href="/proprietaire/messages"]')).toHaveCount(0);
  await page.goto('/proprietaire/classes');
  await expect(page).toHaveURL(/\/proprietaire\/bibliotheque$/);
});
