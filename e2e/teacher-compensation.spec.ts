import { test, expect, Page } from '@playwright/test';
import { mockSchool } from './ui-fixtures';

async function select(page: Page, name: string, option: string) {
  await page.getByRole('combobox', { name, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

for (const hourly of [false, true]) {
  test(`creates a teacher with ${hourly ? 'an hourly rate and initial slots' : 'a fixed monthly salary'}`, async ({ page }) => {
    await mockSchool(page);
    await page.route('**/api/subjects?*', route => route.fulfill({ json: [{ id: 8, schoolId: 1, name: 'Mathématiques' }] }));
    let payload: Record<string, unknown> | undefined;
    await page.route('**/api/teacher-work/schools/1/teachers', route => {
      payload = route.request().postDataJSON();
      return route.fulfill({ json: { id: 9, employeeNumber: 'EMP-009', emailVerified: true } });
    });
    await page.goto('/proprietaire/employes');
    await page.getByRole('textbox', { name: 'Prénom', exact: true }).fill('Awa');
    await page.getByRole('textbox', { name: 'Nom', exact: true }).fill('Diallo');
    if (hourly) {
      await select(page, 'Mode de rémunération', 'Taux horaire avec créneaux');
      await page.getByRole('button', { name: 'Ajouter un créneau', exact: true }).click();
      await page.getByRole('spinbutton', { name: 'Taux horaire (FCFA / heure)', exact: true }).fill('2500');
      await select(page, 'Classe du créneau 1', 'CP1-A · 2026-2027');
      await select(page, 'Matière du créneau 1', 'Mathématiques');
      await expect(page.locator('.employee-slot')).toHaveCount(1);
    } else {
      await page.getByRole('spinbutton', { name: 'Salaire mensuel fixe (FCFA)', exact: true }).fill('95000');
    }
    await page.getByRole('button', { name: 'Ajouter l’enseignant', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Enseignant ajouté : EMP-009');
    expect(payload?.['rateType']).toBe(hourly ? 'HOURLY' : 'FIXED_MONTHLY');
    expect(payload?.['monthlySalary']).toBe(hourly ? null : 95000);
    expect(payload?.['hourlyRate']).toBe(hourly ? 2500 : null);
    const slots = payload?.['initialSlots'] as Record<string, unknown>[];
    expect(slots).toHaveLength(hourly ? 1 : 0);
    if (hourly) expect(slots[0]).toMatchObject({ classId: 11, subjectId: 8, dayOfWeek: 1, startTime: '08:00', endTime: '09:00' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });
}
