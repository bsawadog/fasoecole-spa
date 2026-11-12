import { test, expect } from '@playwright/test';
import { mockSchool } from './ui-fixtures';

test.use({ serviceWorkers: 'allow' });

test('admin keeps a stock creation encrypted offline and sends it once after reconnecting', async ({ page, context }) => {
  await mockSchool(page, 'admin', [], undefined, true);
  await context.route('**/api/me/offline-devices/*/key', route => route.fulfill({ json: { key: Buffer.alloc(32, 23).toString('base64') } }));
  const sent: { id: string | undefined; name: string }[] = [];
  await context.route('**/api/owner/resources/schools/1/stock', async route => {
    if (route.request().method() === 'POST') {
      sent.push({ id: route.request().headers()['x-offline-action-id'], name: route.request().postDataJSON().name });
      return route.fulfill({ json: { id: 2, ...route.request().postDataJSON(), quantity: 0, version: 0 } });
    }
    return route.fulfill({ json: { items: [] } });
  });
  await page.goto('/admin/stocks');
  await expect(page.getByRole('button', { name: 'Ajouter un article', exact: true })).toBeEnabled();
  await page.locator('button[aria-controls="account-profile"]').click();
  await page.locator('a[href="/profil"]').click();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  const toggle = page.getByRole('switch', { name: 'Mode hors connexion Internet sur cet appareil' });
  await toggle.check(); await expect(toggle).toBeEnabled();
  // Client navigation preserves the unlocked encryption key during the outage.
  await page.goBack();
  await expect(page.getByRole('button', { name: 'Ajouter un article', exact: true })).toBeEnabled();
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Ajouter un article', exact: true }).click();
  await page.locator('input[name="code"]').fill('CONF-1');
  await page.locator('input[name="name"]').fill('Article confidentiel hors ligne');
  await page.locator('input[name="location"]').fill('Magasin');
  await page.getByRole('button', { name: 'Enregistrer la fiche', exact: true }).click();
  await page.locator('.shell__outbox > summary').click();
  const outbox = page.getByRole('region', { name: 'File d’attente des actions' });
  await expect(outbox).toContainText('Article confidentiel hors ligne');
  await expect(outbox).toContainText('En attente de confirmation du serveur');
  await expect(page.locator('input[name="name"]')).toHaveCount(0);
  expect(sent).toHaveLength(0);
  const stored = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open('fasoecole-attendance-v1', 1); request.onsuccess = () => resolve(request.result); });
    return new Promise<string>(resolve => { const request = db.transaction('vaults').objectStore('vaults').getAll(); request.onsuccess = () => { resolve(JSON.stringify(request.result)); db.close(); }; });
  });
  expect(stored).not.toContain('Article confidentiel hors ligne');
  await context.setOffline(false);
  await expect(page.locator('.shell__outbox')).toHaveCount(0);
  expect(sent).toEqual([{ id: expect.any(String), name: 'Article confidentiel hors ligne' }]);
});
