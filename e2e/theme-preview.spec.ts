import { test, expect } from '@playwright/test';
import { mockSchool } from './ui-fixtures';

test('trial theme keeps configuration and roster readable', async ({page}, testInfo) => {
  await mockSchool(page);
  for (const [route, root] of [['gestion', '.owner-management'], ['classes', '.class-roster']]) {
    await page.goto(`/proprietaire/${route}`);
    await expect(page.locator(`${root} h1`)).toBeVisible();
    expect(await page.locator('.shell__content').evaluate(node => getComputedStyle(node).backgroundImage)).toContain('linear-gradient');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({path:testInfo.outputPath(`${route}.png`),fullPage:true});
    if (route === 'classes') {
      await expect(page.locator('.class-roster__student').first()).toBeVisible();
      const picker = page.locator('.class-roster__class-picker [role="combobox"]');
      await picker.click();
      await expect(page.getByRole('listbox')).toBeVisible();
      await page.keyboard.press('Escape');
      await page.emulateMedia({media:'print'});
      expect(await page.locator(root).evaluate(node => getComputedStyle(node).backgroundColor)).toBe('rgb(255, 255, 255)');
      await page.emulateMedia({media:'screen'});
    }
  }
});
