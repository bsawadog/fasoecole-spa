import {test,expect} from '@playwright/test';
import {mockSchool} from './ui-fixtures';
test('employee creation actions remain readable and usable',async({page},info)=>{
 await mockSchool(page);
 await page.route('**/api/subjects?*',route=>route.fulfill({json:[{id:1,name:'Mathématiques',schoolId:1}]}));
 await page.goto('/proprietaire/employes');
 const add=page.getByRole('button',{name:'Ajouter un créneau',exact:true});
 await expect(add).toBeVisible();
 await add.click();
 await expect(page.getByRole('group',{name:'Créneau 1',exact:true})).toBeVisible();
 for(const button of [add,page.getByRole('button',{name:'Choisir les matières et une classe'}),page.getByRole('button',{name:'Retirer le créneau 1'}),page.getByRole('button',{name:'Ajouter l’enseignant'})]){
  await expect(button).toBeVisible();
  const ratio=await button.evaluate(element=>{
   const style=getComputedStyle(element);
   const luminance=(color:string)=>{const c=(color.match(/[\d.]+/g)??[]).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4);});return .2126*c[0]+.7152*c[1]+.0722*c[2];};
   const fg=luminance(style.color),bg=luminance(style.backgroundColor);return(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05);
  });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
 }
 await add.focus();await expect(add).toBeFocused();
 await page.getByRole('button',{name:'Retirer le créneau 1'}).click();
 await expect(page.locator('.employee-slot')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
 await page.locator('.employees').screenshot({path:'test-results/employee-buttons-'+info.project.name+'.png'});
});
