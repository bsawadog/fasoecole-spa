import { test, expect } from '@playwright/test';
import { mockSchool, school } from './ui-fixtures';

test.use({ serviceWorkers: 'allow' });

for (const module of ['classes', 'enseignants'] as const) {
  for (const failure of ['offline', 'gateway-504'] as const) {
    test(`admin reads ${module} from encrypted storage after ${failure}`, async ({ page, context }) => {
      await page.clock.install();
      await mockSchool(page, 'admin', [], undefined, true);
      await context.route('**/api/me/offline-devices/*/key', route => route.fulfill({ json: { key: Buffer.alloc(32, 23).toString('base64') } }));
      const teacher = { id: 8, schoolId: 1, firstName: 'Issa', lastName: 'Diallo', email: 'issa@example.test',
        phone: null, specialty: 'Calcul', subjects: ['Calcul'], teachingSubjects: [], activeInClass: true, classCount: 1 };
      await context.route('**/api/teacher-work/classes/11/*', route => route.fulfill({ json: [teacher] }));
      await context.route('**/api/owner/payroll/**', route => route.fulfill({ json: { school, employees: [], month: '2026-11', due: 0, paid: 0, remaining: 0 } }));
      let gateway = false, gatewayRequests = 0;
      await context.route('**/api/**', route => {
        if (gateway) { gatewayRequests++; return route.fulfill({ status: 504, body: '' }); }
        return route.fallback();
      });
      await page.goto(`/admin/${module}`);
      const name = module === 'classes' ? 'Awa' : 'Issa Diallo';
      const rows = page.locator('tbody');
      await expect(rows).toContainText(name);
      const openProfile = async () => {
        await page.locator('button[aria-controls="account-profile"]').click();
        await page.locator('a[href="/profil"]').click();
      };
      await openProfile();
      await page.evaluate(async () => { await navigator.serviceWorker.ready; });
      const toggle = page.getByRole('switch', { name: 'Mode hors connexion Internet sur cet appareil' });
      await toggle.check(); await expect(toggle).toBeEnabled();
      // Revisit while unlocked so that the loaded rows are persisted, then leave the module.
      await page.goBack(); await expect(rows).toContainText(name);
      await openProfile();
      if (failure === 'offline') await context.setOffline(true);
      else gateway = true;
      // Expire the memory cache: the test must read the persisted copy, not a recent response.
      await page.clock.fastForward(65_000);
      await page.goBack();
      await expect(page.getByRole('heading', { name: module === 'classes' ? 'Élèves par classe' : 'Enseignants par classe', exact: true })).toBeVisible();
      await expect(rows).toContainText(name);
      await expect(page.getByRole('alertdialog')).toHaveCount(0);
      if (failure === 'gateway-504') expect(gatewayRequests).toBeGreaterThan(0);
    });
  }
}
