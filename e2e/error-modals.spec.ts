import { expect, test } from '@playwright/test';
import { mockSchool } from './ui-fixtures';

test('owner corrects an unactivated student email from the school record', async ({ page }) => {
  await mockSchool(page);
  // Legacy owners may own schools while the global ownerAccount flag is false.
  await page.addInitScript(() => {
    const raw = localStorage.getItem('fasoecole_auth');
    if (raw) {
      const session = JSON.parse(raw); session.user.ownerAccount = false;
      localStorage.setItem('fasoecole_auth', JSON.stringify(session));
    }
  });
  await page.route('**/api/users/me', route => route.fulfill({ json: {
    id: 7, firstName: 'Mariam', lastName: 'Test', email: 'demo@example.test',
    roles: ['SCHOOL_ADMIN'], approved: true, emailVerified: true, passwordSet: true, ownerAccount: false,
  } }));
  const student = { studentId: 1, userId: 20, firstName: 'Awa', lastName: 'Test',
    email: 'typo@example.test', phone: null, registrationNumber: 'MAT-1', birthDate: null, gender: null,
    parents: [], teacherNames: [], accountEmail: 'typo@example.test', passwordSet: false, emailVerified: false };
  await page.route('**/api/classes/11/roster', route => route.fulfill({ json: [student] }));
  let submitted: unknown;
  await page.route('**/api/classes/11/roster/students/1', route => {
    submitted = route.request().postDataJSON();
    return route.fulfill({ json: { ...student, email: 'correct@example.test', accountEmail: 'correct@example.test', invitationDeliveryStatus: 'SENT' } });
  });
  await page.goto('/proprietaire/classes');
  const row = page.locator('.class-roster__row');
  await row.getByRole('button', { name: 'Actions de la ligne', exact: true }).click();
  await row.getByRole('button', { name: 'Modifier : Awa Test', exact: true }).click();
  const form = page.locator('.class-roster__edit-form');
  await form.getByLabel('Courriel personnel', { exact: true }).fill('correct@example.test');
  await form.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  expect(submitted).toMatchObject({ email: 'correct@example.test' });
  await expect(row).toContainText('correct@example.test');
  await expect(page.getByRole('status').filter({ hasText: 'nouvelle invitation envoyée' })).toBeVisible();
});

test('profile email change waits for confirmation and keeps the current identifier', async ({ page }) => {
  await mockSchool(page);
  let submitted: unknown;
  await page.route('**/api/users/me/email-change', route => {
    submitted = route.request().postDataJSON();
    return route.fulfill({ json: { emailSent: true } });
  });
  await page.goto('/profil');
  await page.getByLabel('Nouveau courriel personnel', { exact: true }).fill('new@example.test');
  await page.getByLabel('Mot de passe actuel pour confirmer le changement', { exact: true }).fill('current-password');
  await page.getByRole('button', { name: 'Envoyer le lien de confirmation', exact: true }).click();
  expect(submitted).toEqual({ email: 'new@example.test', currentPassword: 'current-password' });
  await expect(page.locator('#profile-email')).toHaveValue('demo@example.test');
  await expect(page.getByRole('status').filter({ hasText: 'Votre courriel actuel reste utilisable' })).toBeVisible();
  await expect(page.locator('#profile-email-password')).toHaveValue('');
});

test('student activation assigns a single personal email', async ({ page }) => {
  await mockSchool(page);
  const student = { studentId: 1, userId: 20, firstName: 'Awa', lastName: 'Test',
    email: null, phone: null, registrationNumber: 'MAT-1',
    birthDate: null, gender: null, parents: [], teacherNames: [], accountEmail: null, passwordSet: false };
  await page.route('**/api/classes/11/roster', route => route.fulfill({ json: [student] }));
  let submitted: unknown;
  await page.route('**/api/classes/11/roster/students/1/account-invitation', route => {
    submitted = route.request().postDataJSON();
    return route.fulfill({ json: { student: { ...student, email: 'login@example.test', accountEmail: 'login@example.test' }, emailSent: true } });
  });
  await page.goto('/proprietaire/classes');
  const row = page.locator('.class-roster__row');
  await row.getByRole('button', { name: 'Actions de la ligne', exact: true }).click();
  await row.getByRole('button', { name: 'Accès de connexion : Awa Test', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Accès de connexion de l’élève', exact: true });
  const email = dialog.getByLabel('Courriel de connexion de l’élève', { exact: true });
  await expect(email).toHaveValue('');
  await email.fill('login@example.test');
  await dialog.getByRole('button', { name: 'Envoyer le lien d’activation', exact: true }).click();
  expect(submitted).toEqual({ email: 'login@example.test' });
  await expect(dialog).toHaveCount(0);
  await expect(row).toContainText('login@example.test');
});

test('an API error closes completely and a later profile update succeeds', async ({ page }) => {
  await mockSchool(page);
  let rejected = true;
  await page.route('**/api/users/me', async route => {
    if (route.request().method() !== 'PUT') return route.fallback();
    if (rejected) return route.fulfill({ status: 400, json: { message: 'Ce courriel est déjà utilisé.' } });
    return route.fulfill({ json: {
      id: 7, email: 'demo@example.test', ...route.request().postDataJSON(), roles: ['SCHOOL_ADMIN'],
      approved: true, emailVerified: true, passwordSet: true, ownerAccount: true,
    } });
  });
  await page.goto('/profil');
  await page.locator('#profile-first-name').fill('Mariam corrigée');
  await page.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).click();
  const modal = page.getByRole('alertdialog');
  await expect(modal).toBeVisible();
  await expect(modal).toContainText('Ce courriel est déjà utilisé.');
  await expect(modal).toContainText('support technique');
  const bounds = await modal.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
  await expect(page.locator('#profile-first-name')).toHaveValue('Mariam corrigée');
  rejected = false;
  await page.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Profil mis à jour.' })).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('student update errors are dismissible and link to the incident form without submitting it', async ({ page }) => {
  await mockSchool(page);
  let posts = 0;
  await page.route('**/api/support/**', route => {
    if (route.request().method() === 'POST') posts++;
    return route.fulfill({ json: route.request().url().includes('attention-count') ? 0 : [] });
  });
  await page.route('**/api/classes/11/roster/students/1', route => route.fulfill({ status: 400, json: {
    message: 'Ce compte possède plusieurs rôles. Son titulaire peut modifier son identité depuis Mon profil.',
  } }));
  await page.goto('/proprietaire/classes');
  const row = page.locator('.class-roster__row').filter({ hasText: 'Kaboré Awa' });
  await row.getByRole('button', { name: 'Actions de la ligne', exact: true }).click();
  await row.getByRole('button', { name: 'Modifier : Awa Kaboré', exact: true }).click();
  const form = page.locator('.class-roster__edit-form');
  await expect(form.getByLabel('Courriel personnel', { exact: true })).toHaveAttribute('readonly', '');
  await form.getByLabel('Prénom', { exact: true }).fill('Awa corrigée');
  await form.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  const modal = page.getByRole('alertdialog');
  await expect(modal).toBeVisible();
  await expect(modal).toContainText('Mon profil');
  await modal.getByRole('link', { name: 'Ouvrir un incident', exact: true }).click();
  await expect(page).toHaveURL(/\/proprietaire\/incidents\?nouveau=1/);
  await expect(page.getByLabel('Titre de l’incident', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Page concernée', { exact: true })).not.toBeEmpty();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect(posts).toBe(0);
});
