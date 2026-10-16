import { test, expect } from '@playwright/test';
import { mockSchool } from './ui-fixtures';

test('replaces a parent with an existing account for the selected child', async ({ page }) => {
  await mockSchool(page);
  const previous = { parentId: 30, userId: 31, firstName: 'Ancien', lastName: 'Parent', email: 'ancien@test.bf', phone: null, relationship: 'Père' };
  const owner = { parentId: 40, userId: 7, firstName: 'Mariam', lastName: 'Ouédraogo', email: 'demo@example.test', phone: null, relationship: 'Père' };
  const student = { studentId: 20, userId: 21, firstName: 'Ali', lastName: 'Kaboré', registrationNumber: 'MAT-20',
    email: null, phone: null, birthDate: null, gender: null, parents: [previous], teacherNames: [] };
  await page.route('**/api/classes/11/roster', route => route.fulfill({ json: [student] }));
  let submitted: Record<string, unknown> | undefined;
  await page.route('**/api/classes/11/roster/parents/30', route => {
    submitted = route.request().postDataJSON();
    return route.fulfill({ json: { ...student, parents: [owner] } });
  });
  await page.goto('/proprietaire/classes');
  await page.getByRole('button', { name: 'Modifier le parent : Ancien Parent', exact: true }).click();
  const form = page.locator('form').filter({ has: page.locator('input[name="pEmail"]') });
  await form.getByLabel('Courriel (facultatif)', { exact: true }).fill('demo@example.test');
  await form.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByText('demo@example.test', { exact: true })).toBeVisible();
  expect(submitted?.['studentId']).toBe(20);
  expect(submitted?.['email']).toBe('demo@example.test');
  await expect(page.getByRole('button', { name: 'Ajouter un parent pour Ali Kaboré', exact: true })).toBeVisible();
});
