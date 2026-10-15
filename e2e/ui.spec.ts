import { expect, test } from '@playwright/test';
import { mockSchool, Profile } from './ui-fixtures';

test('public pages and login keep their layout', async ({ page }, testInfo) => {
  await page.route('**/api/**', route => route.fulfill({ json: [] }));
  for (const path of ['/', '/login', '/ajouter-etablissement', '/etablissements', '/services/frais-scolaires']) {
    await page.goto(path);
    await expect(page.getByRole('heading').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), path).toBe(true);
  }
  await page.goto('/login');
  await page.screenshot({ path: testInfo.outputPath('login.png'), fullPage: true });
});

test('module navigation keeps the document and clears the slow-navigation indicator', async ({ page }) => {
  await mockSchool(page);
  await page.goto('/proprietaire/gestion');
  await expect(page.locator('.owner-management__panel')).toBeVisible();
  await page.evaluate(() => { (window as Window & { moduleNavigationMarker?: string }).moduleNavigationMarker = 'same-document'; });
  // Delay the next lazy script to exercise actual router navigation, not page.goto.
  await page.route('**/*.js', async route => {
    await new Promise(resolve => setTimeout(resolve, 600));
    await route.continue();
  }, { times: 1 });
  await page.getByRole('button', { name: 'Ouvrir le menu des modules', exact: true }).click();
  await page.locator('#modules-menu a[href="/proprietaire/classes"]').click();
  await expect(page.getByRole('progressbar', { name: 'Ouverture du module' })).toBeVisible();
  await expect(page.locator('.class-roster h1')).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Ouverture du module' })).toHaveCount(0);
  await expect(page.locator('app-loading-state')).toHaveCount(0);
  expect(await page.evaluate(() => (window as Window & { moduleNavigationMarker?: string }).moduleNavigationMarker)).toBe('same-document');
  await page.locator('#modules-menu a[href="/proprietaire/enseignants"]').click();
  await expect(page.locator('.teacher-roster h1')).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Ouverture du module' })).toHaveCount(0);
  expect(await page.evaluate(() => (window as Window & { moduleNavigationMarker?: string }).moduleNavigationMarker)).toBe('same-document');
});

test('roster icons preserve student records and edit teacher information', async ({ page }) => {
  await mockSchool(page);
  const teacher = { id: 21, schoolId: 1, firstName: 'Issa', lastName: 'Diallo', email: 'issa@example.test',
    phone: null, specialty: 'Mathématiques', subjects: ['Mathématiques'], activeInClass: true, classCount: 1 };
  await page.route('**/api/teacher-work/classes/11/teachers', route => route.fulfill({ json: [teacher] }));
  let updated: unknown;
  await page.route('**/api/teachers/21', route => {
    const record = { id: 21, userId: 51, schoolId: 1, specialty: 'Mathématiques', hireDate: '2026-09-01' };
    if (route.request().method() === 'PUT') {
      updated = route.request().postDataJSON();
      return route.fulfill({ json: { ...record, ...(updated as object) } });
    }
    return route.fulfill({ json: record });
  });
  await page.goto('/proprietaire/classes');
  const studentActions = page.locator('.class-roster__actions').first();
  await expect(studentActions.locator('svg')).toHaveCount(3);
  await expect(studentActions.getByRole('button', { name: /^Supprimer/ })).toHaveCount(0);
  await studentActions.getByRole('button', { name: /^Transférer/ }).click();
  await expect(page.locator('.class-roster__transfer')).toBeVisible();
  await page.locator('.class-roster__transfer').getByRole('button', { name: /^(Annuler|Fermer)$/ }).click();
  await expect(studentActions.getByRole('link', { name: /^Voir la fiche/ })).toBeVisible();
  await page.goto('/proprietaire/enseignants');
  await page.getByRole('button', { name: 'Modifier : Issa Diallo', exact: true }).click();
  const editor = page.getByRole('form', { name: 'Modifier l’enseignant', exact: true });
  await expect(editor).toBeVisible();
  await expect(editor.getByRole('textbox', { name: 'Date d’embauche', exact: true })).toHaveValue('01/09/2026');
  await editor.getByRole('textbox', { name: 'Spécialité', exact: true }).fill('Sciences');
  await editor.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(editor).toHaveCount(0);
  expect(updated).toEqual({ specialty: 'Sciences', hireDate: '2026-09-01' });
  await expect(page.locator('.teacher-roster__table')).toContainText('Sciences');
});

const spaces: { profile: Profile; paths: string[] }[] = [
  { profile: 'proprietaire', paths: ['', 'gestion', 'classes', 'eleves', 'parents', 'enseignants', 'employes', 'tous-les-employes', 'frais', 'depenses', 'caisse', 'etats-financiers', 'notes', 'inscriptions', 'cloture', 'personnel', 'messages', 'demandes', 'creer-ecole', 'portail-parents', 'rendez-vous', 'calendrier', 'discipline', 'demandes-administratives', 'bibliotheque', 'suivi-devoirs', 'aide', 'export', 'incidents'] },
  { profile: 'admin', paths: ['', 'demandes', 'incidents', 'mes-rendez-vous'] },
  { profile: 'enseignant', paths: ['', 'classes', 'notes', 'messages', 'emploi', 'presences', 'signalements', 'devoirs', 'documents', 'annonces', 'rendez-vous', 'calendrier', 'discipline', 'bibliotheque', 'suivi-devoirs'] },
  { profile: 'etudiant', paths: ['', 'notes', 'messages', 'emploi-du-temps', 'rendez-vous', 'calendrier', 'discipline', 'demandes-administratives', 'bibliotheque', 'suivi-devoirs'] },
  { profile: 'parent', paths: ['', 'enfants', 'messages', 'notes', 'absences', 'frais', 'emploi', 'devoirs', 'annonces', 'documents', 'rendez-vous', 'calendrier', 'discipline', 'demandes-administratives', 'bibliotheque', 'suivi-devoirs'] },
];
for (const { profile, paths } of spaces) {
  test(`${profile}: every page renders on this viewport`, async ({ page }, testInfo) => {
    await mockSchool(page, profile);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const path of paths) {
      await page.goto(`/${profile}/${path}`);
      await expect(page.locator('.shell__page h1').first(), `${profile}/${path}`).toBeVisible();
      await expect(page.locator('app-loading-state')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${profile}/${path}`).toBe(true);
      expect(errors, `${profile}/${path}`).toEqual([]);
    }
    await page.goto('/profil');
    await expect(page.locator('.profile h1')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`${profile}-profile.png`), fullPage: true });
  });
}

test('enrollment starts at zero and updates the debt when receiving money', async ({ page }, testInfo) => {
  await mockSchool(page);
  await page.goto('/proprietaire/inscriptions');
  await page.getByRole('button', { name: /Nouvel élève/ }).click();
  await expect(page.locator('.enr__billing-summary')).toContainText('65');
  await expect(page.locator('.enr__billing-summary--paid')).toContainText('0 FCFA');
  await page.getByRole('checkbox', { name: 'Saisir un paiement pour Inscription', exact: true }).check();
  const amount = page.getByRole('spinbutton', { name: 'Montant reçu pour Inscription', exact: true });
  await expect(amount).toHaveValue(/0/);
  await amount.fill('4000');
  await amount.press('Tab');
  await expect(page.locator('.enr__billing-summary--paid')).toContainText(/4\s*000/);
  await expect(page.locator('.enr__billing-summary--balance')).toContainText(/61\s*000/);
  await expect(page.getByText('Paiement partiel', { exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Saisir un paiement pour Inscription', exact: true }).uncheck();
  await expect(page.locator('.enr__billing-summary--balance')).toContainText(/65\s*000/);
  await page.screenshot({ path: testInfo.outputPath('enrollment.png'), fullPage: true });
});

test('finance paginates long lists and preserves actions', async ({ page }, testInfo) => {
  await mockSchool(page);
  await page.goto('/proprietaire/frais');
  await page.getByRole('button', { name: 'Impayés & factures', exact: true }).click();
  await expect(page.locator('p-table tbody tr')).toHaveCount(15);
  await page.getByRole('button', { name: 'Page suivante', exact: true }).click();
  await expect(page.locator('p-table tbody tr')).toHaveCount(9);
  await page.screenshot({ path: testInfo.outputPath('finance.png'), fullPage: true });
});

test('navigation and printable pages remain usable', async ({ page }, testInfo) => {
  await mockSchool(page);
  await page.goto('/proprietaire');
  await page.getByRole('button', { name: 'Ouvrir le menu des modules', exact: true }).click();
  await expect(page.locator('#modules-menu')).toBeVisible();
  const inscriptions = page.locator('#modules-menu a[href="/proprietaire/inscriptions"]');
  const group = page.locator('#modules-menu details').filter({ has: page.locator('a[href="/proprietaire/inscriptions"]') });
  if (!await inscriptions.isVisible()) await group.locator('summary').click();
  await inscriptions.click();
  await expect(page.locator('.enr h1')).toHaveText('Inscriptions');
  await page.screenshot({ path: testInfo.outputPath('navigation.png'), fullPage: true });
  await page.getByRole('button', { name: 'Fermer le menu des modules', exact: true }).click();
  await expect(page.locator('#modules-menu')).toBeHidden();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.shell__topbar')).toBeHidden();
});

test('people search resets pagination and keeps dossier links', async ({ page }) => {
  await mockSchool(page);
  await page.goto('/proprietaire/eleves');
  await expect(page.locator('p-table tbody tr')).toHaveCount(15);
  await page.getByRole('button', { name: 'Page suivante', exact: true }).click();
  await expect(page.locator('p-table tbody tr')).toHaveCount(9);
  await page.getByRole('searchbox', { name: 'Rechercher', exact: true }).fill('Awa');
  await expect(page.locator('p-table tbody tr')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Voir la fiche', exact: true })).toHaveAttribute('href', '/proprietaire/eleves/1');
});

test('PrimeNG calendar and choices submit ISO dates and numeric IDs', async ({ page }, testInfo) => {
  await mockSchool(page);
  await page.route('**/api/owner/enrollment/schools/1/students', route => route.fulfill({ json: {
    student: { studentId: 100, firstName: 'Awa', lastName: 'Kaboré', registrationNumber: 'MAT-2026-100', parents: [], teacherNames: [] },
    schoolName: 'École La Réussite', className: 'CP1-A', yearLabel: '2026-2027', invoices: [],
  } }));
  await page.goto('/proprietaire/inscriptions');
  await page.getByRole('button', { name: /Nouvel élève/ }).click();
  await expect(page.locator('app-select-field[name="nsClass"] .p-select-label')).toContainText('CP1-A');
  await page.locator('input[name="nsFirstName"]').fill('Awa');
  await page.locator('input[name="nsLastName"]').fill('Kaboré');
  const guardian = page.getByRole('group', { name: 'Parent / tuteur', exact: true });
  await guardian.getByRole('textbox', { name: 'Prénom du parent', exact: true }).fill('Issa');
  await guardian.getByRole('textbox', { name: 'Nom', exact: true }).fill('Kaboré');
  await page.getByRole('combobox', { name: 'Genre', exact: true }).click();
  await page.getByRole('option', { name: 'Féminin', exact: true }).click();
  const birthday = page.locator('app-date-field[name="nsBirthDate"]');
  await birthday.locator('input').fill('15/03/2018');
  await birthday.locator('input').press('Tab');
  await birthday.locator('button').click();
  await expect(page.locator('.p-datepicker-panel')).toBeVisible();
  await expect(page.locator('.p-datepicker-panel')).toContainText('mars');
  await page.screenshot({ path: testInfo.outputPath('calendar.png'), fullPage: true });
  await page.keyboard.press('Escape');
  const request = page.waitForRequest(request => request.method() === 'POST' && request.url().includes('/enrollment/schools/1/students'), { timeout: 15_000 });
  await page.getByRole('button', { name: 'Inscrire l’élève', exact: true }).click();
  expect((await request).postDataJSON()).toMatchObject({ classId: 11, birthDate: '2018-03-15', gender: 'F' });
  await expect(page.locator('.enr__alert--success')).toContainText('est inscrit');
});

test('PrimeNG date input rejects an invalid date and recovers', async ({ page }) => {
  await mockSchool(page);
  await page.goto('/proprietaire/inscriptions');
  await page.getByRole('button', { name: /Nouvel élève/ }).click();
  const birthday = page.locator('app-date-field[name="nsBirthDate"]');
  await birthday.locator('input').fill('31/02/2026');
  await birthday.locator('input').press('Tab');
  await expect(birthday.locator('.form-validation-error')).toBeVisible();
  await birthday.locator('input').fill('28/02/2026');
  await birthday.locator('input').press('Tab');
  await expect(birthday.locator('.form-validation-error')).toHaveCount(0);
});
