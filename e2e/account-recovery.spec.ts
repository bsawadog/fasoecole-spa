import { expect, test } from '@playwright/test';
import { mockSchool, school } from './ui-fixtures';

const request = { id: 51, schoolId: 1, schoolName: school.name, studentId: 1, firstName: 'Awa', lastName: 'Test',
  registrationNumber: '001', newEmail: 'new@example.test', reason: 'Courriel et mot de passe perdus', status: 'PENDING',
  createdAt: '2026-10-21T10:00:00', decidedAt: null, completedAt: null, decidedBy: null,
  verificationNote: null, deliveryStatus: null, oldNotificationStatus: null, expiresAt: null, sendCount: 0,
  affectedSchools: [school.name], history: [] };

test('an unauthenticated learner submits a recovery request without changing credentials', async ({ page }) => {
  let submitted: unknown;
  await page.route('**/api/**', async route => {
    if (route.request().url().includes('/schools/registration-options')) return route.fulfill({ json: [school] });
    if (route.request().url().endsWith('/auth/account-recovery')) {
      submitted = route.request().postDataJSON();
      return route.fulfill({ status: 202, json: { message: 'Demande reçue. Votre école vérifiera votre identité avant de vous envoyer un lien. Aucun identifiant n’a été modifié.' } });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto('/login');
  await page.getByRole('button', { name: 'Courriel et mot de passe oubliés ? Récupérer mon compte', exact: true }).click();
  await page.getByRole('combobox', { name: 'Établissement', exact: true }).click();
  await page.getByRole('option', { name: school.name, exact: true }).click();
  await page.getByLabel('Matricule dans cet établissement', { exact: true }).fill('001');
  await page.getByLabel('Prénom', { exact: true }).fill('Awa');
  await page.getByLabel('Nom', { exact: true }).fill('Test');
  await page.getByLabel('Nouvelle adresse courriel accessible', { exact: true }).fill('new@example.test');
  await page.getByLabel('Motif de la récupération (10 caractères minimum)', { exact: true }).fill('Courriel et mot de passe perdus');
  await page.getByRole('button', { name: 'Envoyer ma demande de récupération', exact: true }).click();
  expect(submitted).toMatchObject({ schoolId: 1, registrationNumber: '001', newEmail: 'new@example.test' });
  await expect(page.getByRole('status')).toContainText('Aucun identifiant n’a été modifié');
  expect(await page.evaluate(() => localStorage.getItem('fasoecole_auth'))).toBeNull();
});

for (const support of [false, true]) {
  test(`${support ? 'platform support' : 'school owner'} verifies identity before authorizing a recovery`, async ({ page }) => {
    await mockSchool(page, support ? 'admin' : 'proprietaire');
    let submitted: unknown;
    await page.route('**/api/account-recovery**', route => {
      if (route.request().method() === 'GET') {
        if (support) expect(new URL(route.request().url()).searchParams.has('schoolId')).toBe(false);
        return route.fulfill({ json: [{ ...request, status: support ? 'SUPPORT_REQUIRED' : 'PENDING' }] });
      }
      submitted = route.request().postDataJSON();
      return route.fulfill({ json: { ...request, status: 'APPROVED', deliveryStatus: 'SENT', oldNotificationStatus: 'SENT',
        decidedAt: '2026-10-21T10:10:00', expiresAt: '2026-10-21T11:10:00', decidedBy: 7, sendCount: 1 } });
    });
    await page.goto(support ? '/admin/demandes' : '/proprietaire/demandes');
    const queue = page.locator('app-account-recovery-queue');
    const approve = queue.getByRole('button', { name: 'Autoriser et envoyer le lien', exact: true });
    await expect(approve).toBeDisabled();
    await queue.getByLabel('Vérifications effectuées ou motif du refus', { exact: true }).fill('Responsable légal contacté aux coordonnées enregistrées.');
    await expect(approve).toBeDisabled();
    await queue.getByRole('checkbox').check();
    await approve.click();
    expect(submitted).toMatchObject({ approve: true, identityVerified: true });
    await expect(queue.getByRole('status')).toContainText('Le compte reste inchangé jusqu’à sa confirmation');
    await expect(queue.getByRole('button', { name: 'Renvoyer un nouveau lien', exact: true })).toBeVisible();
  });
}

test('the emailed recovery link confirms the new address and chosen password without auto-login', async ({ page }) => {
  let submitted: unknown;
  await page.route('**/api/**', route => {
    if (route.request().url().endsWith('/auth/account-recovery/complete')) {
      submitted = route.request().postDataJSON(); return route.fulfill({ status: 204 });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto('/login?recover=temporary-proof');
  await expect(page.getByRole('heading', { name: 'Confirmer la récupération', exact: true })).toBeVisible();
  await page.getByLabel('Nouveau mot de passe', { exact: true }).fill('my-new-password');
  await page.getByLabel('Confirmer le mot de passe', { exact: true }).fill('my-new-password');
  await page.getByRole('button', { name: 'Confirmer mon adresse et récupérer mon compte', exact: true }).click();
  expect(submitted).toEqual({ token: 'temporary-proof', newPassword: 'my-new-password' });
  await expect(page.getByRole('status')).toContainText('Vos dossiers sont conservés');
  await expect(page.getByRole('heading', { name: 'Connectez-vous', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('fasoecole_auth'))).toBeNull();
});
