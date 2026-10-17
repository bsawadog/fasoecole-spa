import { test,expect } from '@playwright/test';
import { mockSchool } from './ui-fixtures';

test('opens module-specific steps and can return to the module or the whole guide',async({page})=>{
  await mockSchool(page);await page.goto('/proprietaire/gestion');
  const help=page.getByRole('button',{name:'Centre d’aide',exact:true});
  const helpImage=page.locator('.owner-management__header app-module-help img');
  await expect(helpImage).toBeVisible();await expect(helpImage).toHaveAttribute('src','assets/images/bouton_aide.png');
  await expect.poll(()=>helpImage.evaluate(image=>(image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator('.shell__topbar app-module-help')).toHaveCount(0);
  expect(await help.evaluate(button=>{
    const header=button.closest('header')!.getBoundingClientRect(),bounds=button.getBoundingClientRect();
    const badge=button.closest('header')!.querySelector('.owner-management__school-badge')!.getBoundingClientRect();
    const centered=Math.abs((bounds.top+bounds.bottom)/2-(header.top+header.bottom)/2)<=1;
    const separated=bounds.left>=badge.right||bounds.right<=badge.left||bounds.top>=badge.bottom||bounds.bottom<=badge.top;
    return {centered,separated,header:header.toJSON(),bounds:bounds.toJSON(),badge:badge.toJSON()};
  })).toMatchObject({centered:true,separated:true});
  await expect(help).toBeVisible();await help.click();await expect(page).toHaveURL(url=>url.pathname==='/proprietaire/aide'&&url.searchParams.get('module')==='proprietaire:gestion'&&url.hash==='#question-setup');
  await expect(page.locator('#question-setup')).toHaveAttribute('aria-expanded','true');await expect(page.locator('#answer-setup')).toContainText('année scolaire et les matières');
  await expect(page.locator('.help__item')).toHaveCount(2);await expect(page.getByRole('link',{name:'Revenir au module',exact:true})).toHaveAttribute('href','/proprietaire/gestion');
  await page.getByRole('button',{name:'Consulter toute l’aide',exact:true}).click();await expect(page).toHaveURL(/\/proprietaire\/aide$/);expect(await page.locator('.help__item').count()).toBeGreaterThan(25);
  await page.goto('/proprietaire/frais');await page.getByRole('button',{name:'Centre d’aide',exact:true}).click();
  await expect(page.locator('#answer-fees')).toBeVisible();await expect(page.locator('.help__item')).toHaveCount(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test('staff can read help for a delegated module without gaining access to other modules',async({page})=>{
  await mockSchool(page,'proprietaire',[],['FINANCE']);await page.goto('/proprietaire/frais');
  await page.getByRole('button',{name:'Centre d’aide',exact:true}).click();await expect(page.locator('#answer-fees')).toBeVisible();
  await page.getByRole('button',{name:'Consulter toute l’aide',exact:true}).click();await expect(page.locator('#question-permissions')).toHaveCount(0);await expect(page.locator('#question-payroll')).toHaveCount(0);
  await page.goto('/proprietaire/aide?module=proprietaire%3Asalaires#question-payroll');await expect(page.locator('#question-payroll')).toHaveCount(0);await expect(page.locator('#question-fees')).toBeVisible();
  await page.goto('/proprietaire/salaires');await expect(page).toHaveURL(/\/proprietaire\/frais$/);
});

for(const profile of ['parent','enseignant','etudiant'] as const){
  test(`${profile} receives help adapted to their own notes module`,async({page})=>{
    await mockSchool(page,profile);await page.goto(`/${profile}/notes`);
    const help=page.getByRole('button',{name:'Centre d’aide',exact:true});await expect(help).toBeVisible();await help.click();
    await expect(page).toHaveURL(url=>url.pathname==='/aide'&&url.searchParams.get('module')===`${profile}:notes`&&url.hash===`#question-${profile}-notes`);
    await expect(page.locator(`#answer-${profile}-notes`)).toBeVisible();await expect(page.locator('.help__item')).toHaveCount(1);
    await expect(page.getByRole('link',{name:'Revenir au module',exact:true})).toHaveAttribute('href',`/${profile}/notes`);
  });
}
