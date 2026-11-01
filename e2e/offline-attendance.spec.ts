import { test, expect } from '@playwright/test';
import { mockSchool, school, year } from './ui-fixtures';
test.use({ serviceWorkers: 'allow' });

test('encrypted attendance survives offline navigation and restart, unlocks online and retries the same operation', async ({ page, context }) => {
  await mockSchool(page, 'enseignant');
  // Service-worker network requests need context routes, not page-only routes.
  await page.unroute('**/api/**');
  await context.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    const data = path.endsWith('/academic-years/context-schools') ? [school]
      : path.endsWith('/academic-years') ? [year]
      : path.endsWith('/changes') ? { revision: 1 }
      : path.endsWith('/unread-count') ? 0
      : path.endsWith('/users/me') ? { id: 7, email: 'demo@example.test', firstName: 'Mariam', lastName: 'Ouédraogo', approved: true, emailVerified: true, mustChangePassword: false, passwordSet: true, roles: ['TEACHER'] }
      : [];
    return route.fulfill({ json: data });
  });
  let connected = true, deliveries = 0, dropResponse = true;
  const operations: string[] = [], receipts = new Map<string, string>();
  let rows = [1, 2].map(studentId => ({ studentId, fullName: studentId === 1 ? 'Awa confidentielle' : 'Ali confidentiel', registrationNumber: `E${studentId}`, status: null as string | null, justification: null as string | null, version: null as number | null }));
  await context.route('**/api/me/offline-devices/*/key', route => connected
    ? route.fulfill({ json: { key: Buffer.alloc(32, 42).toString('base64') } }) : route.abort('internetdisconnected'));
  await context.route('**/api/me/teacher/classes/11/students', route => connected
    ? route.fulfill({ json: rows.map(row => ({ studentId: row.studentId, fullName: row.fullName, registrationNumber: row.registrationNumber, gender: 'F', birthDate: '2017-01-01' })) })
    : route.abort('internetdisconnected'));
  await context.route('**/api/me/teacher/schedule', route => connected
    ? route.fulfill({ json: [{ id: 1, classId: 11, dayOfWeek: 1, startTime: '08:00', endTime: '09:00', className: 'CP1', schoolName: 'École', subjects: 'Mathématiques', teacherName: 'Issa' }] })
    : route.abort('internetdisconnected'));
  await context.route('**/api/me/teacher/classes', route => connected ? route.fulfill({ json: [{
    classId: 11, className: 'CP1', schoolId: 1, schoolName: 'École', academicYearId: 1, academicYearLabel: '2026-2027', currentYear: true, subjects: [],
  }] }) : route.abort('internetdisconnected'));
  await context.route('**/api/me/teacher/classes/11/attendance**', async route => {
    if (!connected) return route.abort('internetdisconnected');
    if (route.request().method() === 'GET') return route.fulfill({ json: rows });
    const payload = route.request().postDataJSON(); operations.push(payload.operationId);
    if (!receipts.has(payload.operationId)) {
      for (const entry of payload.entries) {
        const row = rows.find(item => item.studentId === entry.studentId)!;
        expect(entry.expectedStatus).toBe(row.status); expect(entry.expectedVersion).toBe(row.version);
      }
      deliveries++; receipts.set(payload.operationId, JSON.stringify(payload));
      rows = rows.map(row => { const entry = payload.entries.find((item: any) => item.studentId === row.studentId); return entry ? { ...row, status: entry.status, justification: entry.justification, version: row.version === null ? 0 : row.version + 1 } : row; });
    } else expect(JSON.stringify(payload)).toBe(receipts.get(payload.operationId));
    if (dropResponse) return route.abort('failed');
    return route.fulfill({ json: rows });
  });
  await page.goto('/profil');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  const toggle = page.getByRole('switch', { name: 'Mode hors connexion Internet sur cet appareil' });
  await toggle.check(); await expect(toggle).toBeEnabled();
  await page.locator('a[href="/enseignant/classes"]').first().evaluate((link: HTMLElement) => link.click());
  await expect(page).toHaveURL(/\/enseignant\/classes$/);
  await expect(page.getByRole('region', { name: 'Élèves de CP1' }).getByText('Awa confidentielle', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Mon emploi du temps' }).getByText('Mathématiques', { exact: false }).first()).toBeVisible();
  await page.locator('a[href="/enseignant/documents"]').first().evaluate((link: HTMLElement) => link.click());
  await expect(page.getByText('Aucune publication disponible.', { exact: true })).toBeVisible();
  await page.locator('a[href="/enseignant/presences"]').first().evaluate((link: HTMLElement) => link.click());
  await expect(page).toHaveURL(/\/enseignant\/presences$/);
  await expect(page.getByText('Awa confidentielle', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Activer sur cet appareil personnel' })).toHaveCount(0);
  // Make sure the encrypted snapshot transaction and the app-shell installation have finished.
  await expect.poll(() => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('fasoecole-attendance-v1', 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    return new Promise<number>(resolve => { const transaction = db.transaction('vaults'); const request = transaction.objectStore('vaults').count(); request.onsuccess = () => { resolve(request.result); db.close(); }; });
  })).toBe(1);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  connected = false; await context.setOffline(true);
  const select = page.getByRole('combobox', { name: 'Présence de Awa confidentielle' });
  await select.click(); await page.getByRole('option', { name: 'Absent', exact: true }).click();
  await page.getByRole('button', { name: 'Enregistrer l’appel de la classe', exact: true }).click();
  await expect(page.getByText(/1 envoi\(s\) en attente/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Synchroniser', exact: true })).not.toBeVisible();
  await page.locator('app-offline-attendance summary').click();
  await expect(page.getByRole('button', { name: 'Synchroniser', exact: true })).toBeVisible();
  await page.locator('app-offline-attendance summary').click();
  const ali = page.getByRole('combobox', { name: 'Présence de Ali confidentiel' });
  await expect(ali).toBeEnabled(); await ali.click(); await page.getByRole('option', { name: 'Absent', exact: true }).click();
  await page.locator('tbody tr').filter({ hasText: 'Ali confidentiel' }).getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByText(/2 envoi\(s\) en attente/)).toBeVisible();
  await expect(select).toBeEnabled(); await select.click(); await page.getByRole('option', { name: 'En retard', exact: true }).click();
  await page.locator('tbody tr').filter({ hasText: 'Awa confidentielle' }).getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByText(/3 envoi\(s\) en attente/)).toBeVisible();
  // Router navigation keeps the unlocked session; a full document reload must still lock it.
  await page.locator('a[href="/enseignant/documents"]').first().evaluate((link: HTMLElement) => link.click());
  await expect(page).toHaveURL(/\/enseignant\/documents$/);
  await expect(page.getByText('Aucune publication disponible.', { exact: true })).toBeVisible();
  await page.locator('a[href="/enseignant/classes"]').first().evaluate((link: HTMLElement) => link.click());
  await expect(page).toHaveURL(/\/enseignant\/classes$/);
  const roster = page.getByRole('region', { name: 'Élèves de CP1' });
  await expect(roster.getByText('Awa confidentielle', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Mon emploi du temps' }).getByText('Mathématiques', { exact: false }).first()).toBeVisible();
  await roster.getByRole('searchbox', { name: 'Rechercher un élève' }).fill('Ali');
  await expect(roster.getByText('Awa confidentielle', { exact: true })).toHaveCount(0);
  await expect(roster.getByText('Ali confidentiel', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Signalements des parents', exact: false })).toBeVisible();
  await page.locator('a[href="/enseignant/presences"]').first().evaluate((link: HTMLElement) => link.click());
  await expect(page).toHaveURL(/\/enseignant\/presences$/);
  await expect(select).toContainText('En retard');
  await expect(ali).toContainText('Absent');
  await expect(page.getByText(/3 envoi\(s\) en attente/)).toBeVisible();
  const persisted = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open('fasoecole-attendance-v1', 1); request.onsuccess = () => resolve(request.result); });
    return new Promise<string>(resolve => { const request = db.transaction('vaults').objectStore('vaults').getAll(); request.onsuccess = () => { resolve(JSON.stringify(request.result)); db.close(); }; });
  });
  expect(persisted).not.toContain('Awa'); expect(persisted).not.toContain('LATE');
  expect(persisted).not.toContain(Buffer.alloc(32, 42).toString('base64'));
  await page.reload();
  await page.locator('app-offline-attendance summary').click();
  await expect(page.getByText('Reconnectez-vous avec Internet pour retrouver vos saisies locales. Elles restent chiffrées.')).toBeVisible();
  await expect(page.getByText('Awa confidentielle', { exact: true })).toHaveCount(0);
  connected = true; await context.setOffline(false);
  await expect(page.getByText(/3 envoi\(s\) en attente/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Synchroniser', exact: true })).toBeEnabled();
  dropResponse = false;
  await context.setOffline(true);
  await context.setOffline(false); // Synchronize automatically when Internet returns, without a click.
  await expect(page.getByRole('region', { name: 'Présences hors connexion Internet' })).toHaveCount(0);
  expect(deliveries).toBe(3); expect(operations.length).toBeGreaterThanOrEqual(4);
  expect(new Set(operations).size).toBe(3);
  await expect(page.getByRole('combobox', { name: 'Présence de Awa confidentielle' })).toContainText('En retard');
  await expect(page.getByRole('combobox', { name: 'Présence de Ali confidentiel' })).toContainText('Absent');
  await page.goto('/profil'); await expect(toggle).toBeChecked(); await expect(toggle).toBeEnabled();
  await toggle.uncheck(); await expect(toggle).not.toBeChecked();
});
