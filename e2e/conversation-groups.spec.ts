import { test, expect } from '@playwright/test';
import { mockSchool, school } from './ui-fixtures';

for (const profile of ['enseignant', 'parent', 'etudiant', 'proprietaire'] as const) {
  test(`${profile}: conversations collapse by month and recipient and older messages stay accessible`, async ({ page }) => {
    await mockSchool(page, profile);
    const summary = (id: number, date: string, name: string) => ({ id, schoolId: 1, schoolName: school.name,
      subject: id === 1 ? 'Réunion scolaire' : `Échange ${id}`, lastMessageAt: date, createdAt: date, unread: id === 30,
      recipientNames: ['Mariam Ouédraogo', ...(profile === 'proprietaire' ? [school.name] : []), name], recipientCount: 1 });
    const rows = [summary(30, '2026-10-31T12:00:00', 'Ali'),
      ...Array.from({ length: 11 }, (_, index) => summary(index + 1, `2026-10-${String(index + 1).padStart(2,'0')}T12:00:00`, 'Awa')),
      summary(50, '2026-09-12T12:00:00', 'Fatou')];
    await page.route('**/api/conversations**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/conversations') return route.fulfill({ json: rows });
      const found = /^\/api\/conversations\/(\d+)$/.exec(url.pathname);
      if (found) return route.fulfill({ json: { conversation: rows.find(item => item.id === Number(found[1])),
        messages: Array.from({ length: 40 }, (_, index) => ({ id: index + 1, senderName: 'Ali', mine: false,
          sentAt: index < 10 ? '2026-10-20T12:00:00' : '2026-10-31T12:00:00', content: index < 10 ? `Ancien texte ${index + 1}` : `Texte récent ${index + 1}`, attachments: [] })) } });
      return route.fallback();
    });
    await page.goto(`/${profile}/messages`);
    const browser = page.locator('app-conversation-browser');
    await expect(browser.locator('summary.month').first()).toContainText('octobre 2026');
    await expect(browser.locator('summary.month').last()).toContainText('septembre 2026');
    await expect(browser.getByRole('button', { name: 'Échange 50', exact: false })).not.toBeVisible();
    await expect(browser.locator('summary').filter({ hasText: 'Mariam Ouédraogo' })).toHaveCount(0);
    await expect(browser.locator('.contact > summary').filter({ hasText: school.name })).toHaveCount(0);
    await browser.locator('.contact > summary').filter({ hasText: 'Awa' }).click();
    const awa = browser.locator('details.contact').filter({ has: page.locator('summary .contact-name', { hasText: 'Awa' }) });
    await expect(awa.locator('button.ss__conv')).toHaveCount(10);
    await awa.getByRole('button', { name: 'Afficher davantage de conversations' }).click();
    await expect(awa.locator('button.ss__conv')).toHaveCount(11);
    await browser.getByRole('searchbox').fill('reunion scolaire');
    await expect(browser.locator('button.ss__conv')).toHaveCount(1);
    await browser.getByRole('button', { name: 'Réunion scolaire', exact: false }).click();
    const thread = page.locator('app-conversation-thread');
    await expect(thread.locator('article')).toHaveCount(30);
    await expect(thread.getByText('Ancien texte 1', { exact: true })).toHaveCount(0);
    await thread.getByRole('button', { name: 'Afficher les messages précédents', exact: false }).click();
    await thread.locator('summary').filter({ hasText: '20 octobre 2026' }).click();
    await expect(thread.getByText('Ancien texte 1', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });
}
