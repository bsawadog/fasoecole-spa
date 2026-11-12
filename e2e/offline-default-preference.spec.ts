import { test, expect } from '@playwright/test';
import { mockSchool, school } from './ui-fixtures';

test.use({ serviceWorkers: 'allow' });

test('offline mode starts enabled and an explicit opt-out survives reloading',async({page,context})=>{
  await mockSchool(page,'proprietaire',[],undefined,true);
  await context.route('**/api/me/offline-devices/*/key',route=>route.fulfill({json:{key:Buffer.alloc(32,23).toString('base64')}}));
  await context.route('**/api/teacher-work/classes/11/*',route=>route.fulfill({json:[]}));
  await context.route('**/api/owner/payroll/**',route=>route.fulfill({json:{school,employees:[],month:'2026-11',due:0,paid:0,remaining:0}}));
  await page.goto('/profil');
  const toggle=page.getByRole('switch',{name:'Mode hors connexion Internet sur cet appareil'});
  await expect(toggle).toBeChecked();await expect(toggle).toBeEnabled();
  await toggle.uncheck();await expect(toggle).not.toBeChecked();
  await expect.poll(()=>page.evaluate(()=>localStorage.getItem('fasoecole_offline_7'))).toBe('false');
  await page.reload();await expect(toggle).not.toBeChecked();await expect(toggle).toBeEnabled();
  await toggle.check();await expect(toggle).toBeChecked();await expect(toggle).toBeEnabled();
  await page.reload();await expect(toggle).toBeChecked();await expect(toggle).toBeEnabled();
});
