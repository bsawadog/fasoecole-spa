import { test, expect } from '@playwright/test';
import { mockSchool } from './ui-fixtures';

test('records multiple teaching subjects without requiring a class, then assigns both to one class', async ({ page }) => {
  await mockSchool(page);
  const subjects = [{ id: 8, schoolId: 1, name: 'Mathématiques' }, { id: 9, schoolId: 1, name: 'Français' }];
  const teacher = { id: 21, schoolId: 1, firstName: 'Awa', lastName: 'Diallo', email: 'awa@example.test',
    subjects: [], teachingSubjects: subjects.map(({ id, name }) => ({ id, name })), classCount: 0, activeInClass: null };
  await page.route('**/api/subjects?*', route => route.fulfill({ json: subjects }));
  let creation: Record<string, unknown> | undefined;
  let assignment: Record<string, unknown> | undefined;
  await page.route('**/api/teacher-work/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/assignments')) {
      assignment = route.request().postDataJSON();
      return route.fulfill({ json: { ...teacher, subjects: ['Mathématiques', 'Français'], classCount: 1 } });
    }
    if (url.pathname.endsWith('/candidates')) return route.fulfill({ json: [teacher] });
    if (route.request().method() === 'POST') {
      creation = route.request().postDataJSON();
      return route.fulfill({ json: teacher });
    }
    return route.fulfill({ json: assignment ? [{ ...teacher, subjects: ['Mathématiques', 'Français'], classCount: 1 }] : [] });
  });
  await page.goto('/proprietaire/employes');
  await page.getByRole('textbox', { name: 'Prénom', exact: true }).fill('Awa');
  await page.getByRole('textbox', { name: 'Nom', exact: true }).fill('Diallo');
  await page.getByRole('spinbutton', { name: 'Salaire mensuel fixe (FCFA)', exact: true }).fill('95000');
  await page.getByRole('button', { name: 'Choisir les matières et une classe', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Mathématiques', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Français', exact: true }).check();
  await page.getByRole('button', { name: 'Ajouter l’enseignant', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Enseignant ajouté');
  expect(creation).toMatchObject({ subjectIds: [8, 9], classId: null, initialSlots: [] });
  await page.goto('/proprietaire/enseignants');
  await expect(page.getByRole('button', { name: /Ajouter un enseignant/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Affecter un enseignant existant', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Mathématiques', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Français', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Affecter à cette classe', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Enseignant affecté à la classe');
  expect(assignment).toEqual({ teacherId: 21, subjectIds: [8, 9] });
  await expect(page.getByRole('cell', { name: 'Mathématiques, Français', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
