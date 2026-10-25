import { test, expect } from '@playwright/test';

test('public pages expose their content and metadata without JavaScript',async({browser,baseURL})=>{
 const context=await browser.newContext({javaScriptEnabled:false});
 const page=await context.newPage();
 const paths=['/','/contact','/etablissements','/services/portail-parent','/services/suivi-scolaire','/services/frais-scolaires','/services/communication','/services/tableaux-de-bord'];
 const titles=new Set<string>();
 for(const path of paths){
  const response=await page.goto(baseURL+path);
  expect(response?.status()).toBe(200);
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang','fr');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content','index,follow');
  const canonical=await page.locator('link[rel="canonical"]').getAttribute('href');
  expect(canonical).toMatch(/^https:\/\/app(?:\.dev)?\.fasoecole\.com\//);
  expect(new URL(canonical!).pathname).toBe(path);
  expect(await page.locator('meta[name="description"]').getAttribute('content')).toBeTruthy();
  titles.add(await page.title());
 }
 expect(titles.size).toBe(paths.length);
 await context.close();
});

test('public metadata follows client navigation and account pages are excluded',async({page})=>{
 await page.route('**/api/**',r=>r.fulfill({json:[]}));
 await page.goto('/services/communication');
 await expect(page).toHaveTitle(/Communication entre écoles/);
 await page.locator('a[href="/"]').first().click();
 await expect(page).toHaveTitle(/Logiciel de gestion scolaire/);
 await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
 await page.goBack();
 await expect(page).toHaveTitle(/Communication entre écoles/);
 await page.goto('/login');
 await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content','noindex,follow');
 await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
});
