import { test, expect } from '@playwright/test';
import { mockSchool } from './ui-fixtures';

test('changes spaces from the profile menu and restores the choice after reload', async ({ page }) => {
  await mockSchool(page, 'proprietaire', ['TEACHER', 'PARENT']);
  await page.goto('/proprietaire');
  const profile = page.locator('[aria-controls="account-profile"]');
  await expect(profile).toContainText('Espace Propriétaire');
  await profile.click();
  const switcher = page.getByRole('group', { name: 'Changer d’espace' });
  await expect(switcher.getByRole('button')).toHaveCount(3);
  await switcher.getByRole('button', { name: 'Enseignant', exact: true }).click();
  await expect(page).toHaveURL(/\/enseignant$/);
  await expect(profile).toContainText('Espace Enseignant');
  await page.locator('summary').filter({ hasText: 'Enseignement' }).click();
  await expect(page.getByRole('link', { name: 'Mes classes', exact: true })).toBeVisible();
  await profile.click();
  await switcher.getByRole('button', { name: 'Parent', exact: true }).click();
  await expect(page).toHaveURL(/\/parent$/);
  await expect(profile).toContainText('Espace Parent');
  await page.locator('summary').filter({ hasText: 'Suivi de mes enfants' }).click();
  await expect(page.getByRole('link', { name: 'Mes enfants', exact: true })).toBeVisible();
  await page.reload();
  await expect(profile).toContainText('Espace Parent');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('fasoecole_auth')!).token)).toBe('ui-test-session');
});
