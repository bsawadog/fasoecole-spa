import { test, expect } from '@playwright/test';
import { mockSchool, school } from './ui-fixtures';

test.use({ serviceWorkers: 'allow' });
test('queues encrypted messages and attachments, unlocks after restart and retries a lost confirmation without duplicate delivery', async ({ page, context }) => {
  await mockSchool(page, 'enseignant', [], undefined, true);
  await context.route('**/api/me/offline-devices/*/key', route => route.fulfill({ json: { key: Buffer.alloc(32, 23).toString('base64') } }));
  await context.route('**/api/me/teacher/classes', route => route.fulfill({ json: [{ classId: 11, className: 'CM1', schoolId: 1, schoolName: school.name,
    academicYearId: 1, currentYear: true, subjects: [], studentCount: 1 }] }));
  await context.route('**/api/conversations/teacher/recipients?*', route => route.fulfill({ json: [{ userId: 8, fullName: 'Parent privé', role: 'PARENT' }] }));
  const attempts: string[] = [], delivered = new Set<string>();
  let loseFirst = true;
  await context.route('**/api/conversations/teacher/messages', async route => {
    const id = route.request().headers()['x-offline-message-id']; expect(id).toBeTruthy();
    attempts.push(id); delivered.add(id);
    expect(route.request().postData()).toContain('Message confidentiel');
    if (loseFirst) { loseFirst = false; await route.abort('failed'); return; }
    await route.fulfill({ status: 201, json: [] });
  });
  await page.goto('/profil');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.getByRole('switch', { name: 'Mode hors connexion Internet sur cet appareil' }).check();
  const navigate = async (url: string) => page.locator(`a[href="${url}"]`).first().evaluate((link: HTMLElement) => link.click());
  await navigate('/enseignant/messages');
  await expect(page.getByRole('region', { name: 'File d’attente des messages' })).toBeVisible();
  await expect(page.locator('app-message-outbox')).toContainText('Aucun message en attente d’envoi.');
  const compose = async (subject: string, file = false) => {
    await page.getByRole('button', { name: 'Nouvelle conversation', exact: true }).click();
    await page.getByRole('combobox', { name: 'Classe', exact: true }).click();
    await page.getByRole('option', { name: `CM1 · ${school.name}`, exact: true }).click();
    await page.getByRole('button', { name: 'Tous les parents (1)', exact: true }).click();
    await page.locator('input[name="subject"]').fill(subject);
    await page.locator('textarea[name="message"]').fill('Message confidentiel');
    if (file) await page.locator('input[type="file"]').setInputFiles({ name: 'cours.txt', mimeType: 'text/plain', buffer: Buffer.from('Pièce jointe privée') });
  };
  await compose('Devoir confidentiel', true);
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Envoyer', exact: true }).click();
  await expect(page.locator('app-message-outbox summary')).toContainText('1 message(s) en attente de connexion Internet');
  await expect(page.getByText('Votre message a été envoyé', { exact: false })).toHaveCount(0);
  await compose('Second devoir');
  await page.getByRole('button', { name: 'Envoyer', exact: true }).click();
  await expect(page.locator('app-message-outbox summary')).toContainText('2 message(s)');
  expect(attempts).toHaveLength(0);
  const encrypted = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open('fasoecole-attendance-v1', 1); request.onsuccess = () => resolve(request.result); });
    return new Promise<string>(resolve => { const request = db.transaction('vaults').objectStore('vaults').getAll(); request.onsuccess = () => { resolve(JSON.stringify(request.result)); db.close(); }; });
  });
  expect(encrypted).not.toContain('Message confidentiel'); expect(encrypted).not.toContain('Pièce jointe privée');
  await page.reload();
  await expect(page.getByText('Retrouvez Internet pour déverrouiller les données.', { exact: false })).toBeVisible();
  await context.setOffline(false);
  await expect.poll(() => attempts.length).toBeGreaterThanOrEqual(1);
  // Reopening offline locks the vault and informs the user before it is unlocked online.
  const lockedNotice = page.getByRole('alertdialog');
  if (await lockedNotice.isVisible()) await lockedNotice.getByRole('button', { name: 'Fermer', exact: true }).click();
  // The first receipt was lost; manual retry uses the original operation identifier.
  await page.locator('app-message-outbox summary').click();
  await page.getByRole('button', { name: 'Synchroniser les messages', exact: true }).click();
  await expect(page.locator('app-message-outbox summary')).toHaveCount(0);
  await expect(page.locator('app-message-outbox')).toContainText('Aucun message en attente d’envoi.');
  expect(attempts).toHaveLength(3); expect(delivered.size).toBe(2); expect(attempts[0]).toBe(attempts[1]);
});
