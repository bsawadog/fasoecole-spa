import { test, expect } from '@playwright/test';
import { mockSchool } from './ui-fixtures';

test('module permission choices follow all six appearance themes', async ({page},testInfo) => {
  await mockSchool(page);
  for(const theme of ['night-violet','night-green','blue-black','light-gray','glossy-black','white']) {
    await page.goto('/profil');
    await page.evaluate(theme=>localStorage.setItem('fasoecole_theme_7',theme),theme);
    await page.reload();
    await page.goto('/proprietaire/personnel');
    await page.getByRole('button',{name:'+ Ajouter un membre',exact:true}).click();
    const permissions=page.locator('.stf__modules');
    await expect(permissions).toBeVisible();
    await expect(page.locator('body')).toHaveAttribute('data-app-theme',theme);
    const initial=await permissions.locator('.stf__module').first().evaluate(node=>({background:getComputedStyle(node).backgroundColor,color:getComputedStyle(node.querySelector('strong')!).color}));
    expect(initial.background).not.toBe(initial.color);
    // Resolve the actual palette tokens to colors, including light themes.
    expect(await permissions.evaluate(node=>{
      const expected=document.createElement('span');expected.style.background='var(--theme-inset)';node.appendChild(expected);
      const matches=getComputedStyle(expected).backgroundColor===getComputedStyle(node).backgroundColor;expected.remove();return matches;
    })).toBe(true);
    const choice=permissions.getByRole('checkbox').first();
    await choice.check(); await page.mouse.move(0,0);
    await expect(choice).toBeChecked();
    expect(await choice.evaluate(node=>{
      const label=node.closest('label')!, expected=document.createElement('span');expected.style.background='var(--theme-soft)';label.appendChild(expected);
      const matches=getComputedStyle(expected).backgroundColor===getComputedStyle(label).backgroundColor;expected.remove();return matches;
    })).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    if(theme === 'white' || theme === 'night-violet') await permissions.screenshot({path:testInfo.outputPath(`permissions-${theme}.png`)});
  }
});

test('personnel form offers twenty-one independent module permissions', async ({ page }) => {
  await mockSchool(page);
  await page.goto('/proprietaire/personnel');
  await page.getByRole('button', { name: '+ Ajouter un membre', exact: true }).click();
  const permissions = page.locator('.stf__modules');
  await expect(permissions.getByRole('checkbox')).toHaveCount(21);
  await expect(permissions.getByRole('group', { name: 'Vie scolaire et familles', exact: true })).toBeVisible();
  await permissions.getByRole('checkbox', { name: /^Bibliothèque/ }).check();
  await expect(permissions.getByRole('checkbox', { name: /^Élèves & dossiers/ })).not.toBeChecked();
  await expect(permissions.getByRole('checkbox', { name: /^Messages/ })).not.toBeChecked();
  await expect(permissions.getByRole('checkbox', { name: /^Brouillard de caisse/ })).toBeVisible();
  await expect(permissions.getByRole('checkbox', { name: /^États financiers/ })).toBeVisible();
  await expect(permissions.getByRole('checkbox', { name: /^Patrimoine et mobilier/ })).toBeVisible();
  await expect(permissions.getByRole('checkbox', { name: /^Stocks et fournitures/ })).toBeVisible();
  await expect(permissions.getByRole('checkbox', { name: /^Salaires/ })).toBeVisible();
  await expect(permissions.getByRole('checkbox', { name: /^Impôts et taxes/ })).toBeVisible();
});

test('a librarian can open the library without access to student records or messages', async ({ page }) => {
  await mockSchool(page, 'proprietaire', [], ['LIBRARY']);
  await page.route('**/api/school-life/**', route => route.fulfill({ json: {
    students: [], events: [], observations: [], requests: [], books: [], loans: [], homeworks: [],
  } }));
  await page.goto('/proprietaire');
  await expect(page).toHaveURL(/\/proprietaire\/bibliotheque$/);
  await expect(page.locator('.life h1')).toHaveText('Bibliothèque');
  await expect(page.locator('#modules-menu a[href="/proprietaire/bibliotheque"]')).toBeVisible();
  await expect(page.locator('#modules-menu a[href="/proprietaire/classes"]')).toHaveCount(0);
  await expect(page.locator('a[href="/proprietaire/messages"]')).toHaveCount(0);
  await page.goto('/proprietaire/classes');
  await expect(page).toHaveURL(/\/proprietaire\/bibliotheque$/);
});
