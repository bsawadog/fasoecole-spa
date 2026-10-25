import { test, expect } from '@playwright/test';
import { mockSchool } from './ui-fixtures';

test('workspace theme covers forms, collections and personal pages', async ({page}, testInfo) => {
  await mockSchool(page);
  for (const route of ['personnel','frais','notes','salaires','impots-taxes','patrimoine','stocks','rendez-vous','creer-ecole','incidents','/profil']) {
    const path = route.startsWith('/') ? route : `/proprietaire/${route}`;
    await page.goto(path);
    await expect(page.locator('.shell__page h1').first()).toBeVisible();
    expect(await page.locator('.shell__content').evaluate(node => getComputedStyle(node).backgroundImage)).toContain('linear-gradient');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const lightSurfaces = await page.locator('.shell__page *').evaluateAll(nodes => nodes.flatMap(node => {
      const box = node.getBoundingClientRect(), style = getComputedStyle(node);
      const rgb = style.backgroundColor.match(/^rgb\((\d+), (\d+), (\d+)\)$/);
      return box.width > 150 && box.height > 45 && rgb && rgb.slice(1).every(c => +c > 220)
        ? [{element:node.tagName,classes:node.className,background:style.backgroundColor}] : [];
    }));
    await testInfo.attach(`${route.replace('/','')}-surfaces`, {body:JSON.stringify(lightSurfaces), contentType:'application/json'});
    expect(lightSurfaces, `${route}: light panels`).toEqual([]);
    await page.screenshot({path:testInfo.outputPath(`${route.replace('/','')}.png`),fullPage:true});
  }
});
