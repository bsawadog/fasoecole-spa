import { test,expect } from '@playwright/test';
import { mockSchool,school } from './ui-fixtures';
test('adds a subject catalog, completes existing codes and preserves coefficients',async({page},info)=>{
 await mockSchool(page);const subjects:any[]=[{id:1,schoolId:1,name:'Français',code:null,category:null,coefficient:3}];let requests=0;
 await page.route('**/api/schools/1',r=>r.fulfill({json:{...school,type:'SECONDAIRE'}}));
 await page.route('**/api/subjects?**',r=>r.fulfill({json:subjects}));
 await page.route('**/api/subjects/catalog?**',r=>r.fulfill({json:[{id:'SECONDARY',label:'Secondaire général',subjects:[{code:'FRA',name:'Français',category:'Littéraire'},{code:'MAT',name:'Mathématiques',category:'Scientifique'}]}]}));
 await page.route('**/api/subjects/catalog/SECONDARY?**',r=>{
  expect(r.request().method()).toBe('POST');expect(new URL(r.request().url()).searchParams.get('schoolId')).toBe('1');requests++;
  subjects[0].code='FRA';subjects[0].category='Littéraire';if(subjects.length===1)subjects.push({id:2,schoolId:1,name:'Mathématiques',code:'MAT',category:'Scientifique',coefficient:1});
  return r.fulfill({json:{created:requests===1?1:0,completed:requests===1?1:0,conflicts:[]}});
 });
 await page.goto('/proprietaire/gestion');await expect(page.getByRole('heading',{name:'Configuration de l’école',exact:true})).toBeVisible({timeout:120000});
 await page.getByRole('button',{name:'Académique',exact:true}).click();await page.getByRole('button',{name:/^Matières/}).click();
 await page.getByRole('button',{name:'Afficher les catalogues',exact:true}).click();await page.getByText('Secondaire général · 2 matières',{exact:true}).click();
 await expect(page.getByRole('region',{name:'Catalogues de matières',exact:true})).toContainText('MAT');
 await page.getByRole('button',{name:'Ajouter : Secondaire général',exact:true}).click();
 await expect(page.locator('p-message[severity="success"]')).toContainText('1 matière(s) ajoutée(s), 1 matière(s) complétée(s).');
 await expect(page.locator('.owner-management')).toContainText('FRA · Littéraire · Coefficient 3');await expect(page.locator('.owner-management')).toContainText('MAT · Scientifique · Coefficient 1');
 await page.getByRole('button',{name:'Ajouter : Secondaire général',exact:true}).click();await expect(page.locator('p-message[severity="success"]')).toContainText('0 matière(s) ajoutée(s), 0 matière(s) complétée(s).');
 expect(subjects).toHaveLength(2);expect(subjects[0].coefficient).toBe(3);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:info.outputPath('subject-catalog.png'),fullPage:true});
});
