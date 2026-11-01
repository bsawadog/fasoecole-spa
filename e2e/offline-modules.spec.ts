import { test, expect } from '@playwright/test';
import { mockSchool, school } from './ui-fixtures';

test.use({ serviceWorkers: 'allow' });

for (const profile of ['parent', 'etudiant', 'proprietaire'] as const) {
  test(`${profile} reads loaded modules offline without requests and cannot submit writes`, async ({ page, context }) => {
    await mockSchool(page, profile, [], undefined, true);
    await context.route('**/api/me/offline-devices/*/key', route => route.fulfill({ json: { key: Buffer.alloc(32, 23).toString('base64') } }));
    await context.route('**/api/me/students', route => route.fulfill({ json: [{
      studentId: 1, fullName: 'Awa confidentielle', registrationNumber: 'A-1', schoolId: 1, schoolName: school.name,
      classId: 11, className: 'CP1', levelName: 'CP1', academicYearLabel: '2026-2027',
    }] }));
    await context.route('**/api/me/students/1/learning', route => route.fulfill({ json: { lessons: [], support: [] } }));
    await context.route('**/api/me/parent-portal/students/1/posts?*', route => route.fulfill({ json: [{ id: 1, kind: 'DOCUMENT', classId: 11, className: 'CP1', studentId: 1,
      title: 'Cours confidentiel de calcul', content: 'Exercice privé chargé en ligne', createdAt: '2026-10-31T10:00:00Z', files: [{ id: 2, filename: 'cours.txt', sizeBytes: 32 }], mine: false, dueDate: null }] }));
    await context.route('**/api/me/parent-portal/students/1/posts/1/files/2', route => route.fulfill({ contentType: 'text/plain', body: 'Cours confidentiel téléchargé' }));
    const downloadFile = async () => {
      const downloading = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Télécharger cours.txt', exact: true }).click();
      const download = await downloading;
      const stream = await download.createReadStream();
      const chunks: Buffer[] = []; for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      expect(Buffer.concat(chunks).toString('utf8')).toBe('Cours confidentiel téléchargé');
    };
    await page.goto('/profil');
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    const toggle = page.getByRole('switch', { name: 'Mode hors connexion Internet sur cet appareil' });
    await toggle.check(); await expect(toggle).toBeEnabled();
    const target = profile === 'proprietaire' ? '/proprietaire/gestion' : `/${profile}/documents`;
    const navigate = async (href: string) => page.locator(`a[href="${href}"]`).first().evaluate((link: HTMLElement) => link.click());
    await navigate(target);
    if (profile === 'proprietaire') await expect(page.getByRole('textbox', { name: 'Nom de l’école', exact: true })).toHaveValue(school.name);
    else { await expect(page.getByRole('heading', { name: 'Cours confidentiel de calcul', exact: true })).toBeVisible(); await downloadFile(); }
    await page.locator('button[aria-controls="account-profile"]').click();
    await navigate('/profil'); await expect(toggle).toBeChecked();
    let requests = 0;
    page.on('request', request => { if (request.url().includes('/api/') && !request.url().includes('/changes')) requests++; });
    await context.setOffline(true); const before = requests;
    await navigate(target);
    if (profile === 'proprietaire') {
      await expect(page.getByRole('textbox', { name: 'Nom de l’école', exact: true })).toHaveValue(school.name);
      await page.getByRole('button', { name: 'Enregistrer les coordonnées', exact: true }).click();
      await expect(page.getByRole('alertdialog')).toContainText('Mode consultation hors connexion Internet');
    } else { await expect(page.getByRole('heading', { name: 'Cours confidentiel de calcul', exact: true })).toBeVisible(); await downloadFile(); }
    expect(requests).toBe(before);
    const ciphertext = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open('fasoecole-attendance-v1', 1); request.onsuccess = () => resolve(request.result); });
      return new Promise<string>(resolve => { const request = db.transaction('vaults').objectStore('vaults').getAll(); request.onsuccess = () => { resolve(JSON.stringify(request.result)); db.close(); }; });
    });
    expect(ciphertext).not.toContain('Awa confidentielle'); expect(ciphertext).not.toContain('Exercice privé');
  });
}
