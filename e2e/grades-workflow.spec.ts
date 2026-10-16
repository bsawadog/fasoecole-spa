import { test, expect } from '@playwright/test';
import { mockSchool } from './ui-fixtures';

test('separates evaluation creation from grade entry and bulletin preparation', async ({ page }) => {
  await mockSchool(page);
  const period = { id: 3, schoolId: 1, academicYearId: 1, academicYearLabel: '2026-2027', code: 'T1',
    name: 'Premier trimestre', startDate: '2026-10-01', endDate: '2026-12-31', passMark: 10,
    status: 'OPEN', publishedAt: null, evaluationCount: 1 };
  const evaluation = { id: 51, classSubjectTeacherId: 31, subjectId: 41, subjectName: 'Mathématiques',
    teacherName: 'Paul Ouédraogo', periodId: 3, title: 'Devoir 1', type: 'DEVOIR', evalDate: '2026-10-16',
    maxValue: 20, weight: 1, gradedCount: 0, studentCount: 1, averageOn20: null };
  let created = false;
  let saved: unknown;
  await page.route('**/api/owner/grades/**', async route => {
    const url = new URL(route.request().url());
    let json: unknown = [];
    if (url.pathname.endsWith('/periods')) json = [period];
    else if (url.pathname.endsWith('/summary')) json = { period, average: null, passRate: null, studentCount: 1, rankedCount: 0, classes: [] };
    else if (url.pathname.endsWith('/subjects')) json = [{ subjectId: 41, subjectName: 'Mathématiques', coefficient: 2,
      defaultCoefficient: 2, overridden: false, assignments: [{ classSubjectTeacherId: 31, teacherId: 8, teacherName: 'Paul Ouédraogo', active: true }] }];
    else if (url.pathname.endsWith('/evaluations')) {
      if (route.request().method() === 'POST') { created = true; json = evaluation; }
      else json = created ? [evaluation] : [];
    } else if (url.pathname.endsWith('/sheet')) json = { evaluation, period, className: 'CP1-A', rows: [{ studentId: 20, fullName: 'Awa Kaboré', registrationNumber: 'M-20', value: null }] };
    else if (url.pathname.endsWith('/grades')) { saved = route.request().postDataJSON(); json = { created: 1, updated: 0, deleted: 0, unchanged: 0 }; }
    else if (url.pathname.endsWith('/bulletins')) json = { schoolName: 'École La Réussite', className: 'CP1-A', periodName: 'Premier trimestre', published: false, bulletins: [] };
    return route.fulfill({ json });
  });
  await page.goto('/proprietaire/notes');
  const steps = page.getByRole('navigation', { name: 'Sections notes et bulletins' });
  await expect(steps.getByRole('button')).toHaveCount(5);
  await steps.getByRole('button', { name: 'Créer les évaluations', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nouvelle évaluation', exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Matière — enseignant', exact: true }).click();
  await page.getByRole('option', { name: 'Mathématiques — Paul Ouédraogo' }).click();
  await page.getByRole('textbox', { name: 'Intitulé', exact: true }).fill('Devoir 1');
  await page.getByRole('button', { name: 'Créer', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Évaluation créée');
  await page.getByRole('button', { name: 'Saisir les notes', exact: true }).click();
  await expect(steps.getByRole('button', { name: 'Entrer les notes', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('textbox', { name: 'Intitulé', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Modifier', exact: true })).toHaveCount(0);
  await page.getByRole('spinbutton', { name: 'Note de Awa Kaboré', exact: true }).fill('15');
  await page.getByRole('button', { name: 'Enregistrer les notes', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Notes enregistrées');
  expect(saved).toMatchObject({ grades: [{ studentId: 20, value: 15 }], reason: null });
  await steps.getByRole('button', { name: 'Bulletins', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Générer les bulletins', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Imprimer / PDF toute la classe', exact: true })).toBeVisible();
  await page.getByRole('navigation', { name: 'Outils complémentaires' }).getByRole('button', { name: 'Coefficients des matières' }).click();
  await expect(page.getByRole('spinbutton', { name: 'Coefficient Mathématiques', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
