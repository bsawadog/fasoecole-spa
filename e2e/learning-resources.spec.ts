import {test, expect, Page} from '@playwright/test';
import {mockSchool} from './ui-fixtures';
const student={studentId:21,fullName:'Awa Kabore',schoolId:1,schoolName:'École',classId:11};
const post={id:31,kind:'HOMEWORK',classId:11,className:'CM1',studentId:null,title:'Fractions à la maison',content:'Faire les exercices 1 à 3.',dueDate:'2026-11-02',createdAt:'2026-10-18',files:[{id:41,filename:'exercices.pdf',sizeBytes:100}],mine:true};
const progress={postId:31,studentId:21,studentName:'Awa Kabore',title:post.title,content:post.content,dueOn:post.dueDate,status:'TO_DO',feedback:'',editable:true};
const overview=(homeworks:any[])=>({students:[],events:[],observations:[],requests:[],books:[],loans:[],homeworks});
async function familyMocks(page:Page){
 await page.route('**/api/me/students',r=>r.fulfill({json:[student]}));
 await page.route('**/api/me/parent-portal/students/21/posts?**',r=>r.fulfill({json:[{...post,kind:new URL(r.request().url()).searchParams.get('kind'),mine:false}]}));
 await page.route('**/api/school-life/students/21?**',r=>r.fulfill({json:overview([{...progress,status:'CORRECTED',feedback:'Très bon travail.',editable:false}])}));
 await page.route('**/api/me/parent-portal/students/21/posts/31/files/41',r=>r.fulfill({contentType:'application/octet-stream',body:'%PDF-1.4\n%%EOF'}));
}
for(const role of ['parent','etudiant'] as const)test(role+' receives homework, read-only feedback and PDF resources',async({page})=>{
 await mockSchool(page,role); await familyMocks(page);
 const writes:string[]=[];page.on('request',r=>{if(r.url().includes('/api/')&&['POST','PUT','DELETE'].includes(r.method()))writes.push(r.url());});
 await page.goto('/'+role+'/suivi-devoirs');
 await expect(page).toHaveURL(new RegExp('/'+role+'/devoirs$'),{timeout:120000});
 await expect(page.getByRole('heading',{name:'Devoirs de maison',exact:true})).toBeVisible();
 await expect(page.getByText('Très bon travail.',{exact:false})).toBeVisible();
 await expect(page.getByRole('button',{name:'Enregistrer le suivi',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Ouvrir exercices.pdf',exact:true}).click();
 const dialog=page.getByRole('dialog'); await expect(dialog).toBeVisible();
 await expect(dialog.locator('iframe')).toHaveAttribute('src',/^blob:/);
 const frame=dialog.locator('iframe');
 await expect.poll(async()=> (await frame.boundingBox())?.height ?? 0).toBeGreaterThan(page.viewportSize()!.height * .55);
 const originalHeight=(await frame.boundingBox())!.height;
 await dialog.locator('.p-dialog-maximize-button').click();
 await expect(dialog).toHaveClass(/p-dialog-maximized/);
 await expect.poll(async()=> (await frame.boundingBox())?.height ?? 0).toBeGreaterThan(originalHeight + 15);
 await expect.poll(async()=> (await dialog.boundingBox())?.height ?? 0).toBeGreaterThan(page.viewportSize()!.height * .98);
 await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible();
 await page.goto('/'+role+'/documents');
 await expect(page.getByRole('heading',{name:'Cours et ressources',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Ouvrir exercices.pdf',exact:true})).toBeVisible();
 await expect(page.getByRole('region',{name:'Suivi des devoirs'})).toHaveCount(0);
 expect(writes).toEqual([]); expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('teacher publishes and updates tracking in a single module, preserves failed corrections',async({page})=>{
 await mockSchool(page,'enseignant'); let published=false;let fail=true;let saves=0;
 await page.route('**/api/me/teacher/classes',r=>r.fulfill({json:[{classId:11,className:'CM1',schoolId:1,schoolName:'École',academicYearId:1,academicYearLabel:'2026-2027',currentYear:true,subjects:[]}]}));
 await page.route('**/api/me/teacher/classes/11/portal/posts**',r=>{
  if(r.request().method()==='POST'){published=true;expect(r.request().postData()).toContain('request');return r.fulfill({status:201,json:post});}
  return r.fulfill({json:published?[post]:[]});
 });
 await page.route('**/api/school-life/classes/11?**',r=>r.fulfill({json:overview(published?[progress]:[])}));
 await page.route('**/api/school-life/classes/11/homeworks/31/students/21',r=>{
  saves++;expect(r.request().postDataJSON()).toEqual({status:'CORRECTED',feedback:'Très bien.'});
  return fail?r.fulfill({status:503,json:{message:'Suivi indisponible'}}):r.fulfill({status:204});
 });
 await page.goto('/enseignant/suivi-devoirs');
 await expect(page.getByRole('heading',{name:'Devoirs de maison',exact:true})).toBeVisible();
 await page.getByRole('textbox',{name:'Titre',exact:true}).fill(post.title);
 await page.getByRole('textbox',{name:'Contenu / consignes',exact:true}).fill(post.content);
 const due=page.locator('app-date-field input');await due.fill('02/11/2026');await due.press('Tab');
 await page.getByRole('button',{name:'Publier',exact:true}).click();
 await expect(page.getByRole('heading',{name:post.title,exact:true})).toBeVisible();
 const status=page.getByRole('combobox',{name:'Statut',exact:true});await status.click();await page.getByRole('option',{name:'Corrigé',exact:true}).click();
 await page.getByRole('textbox',{name:'Retour de correction',exact:true}).fill('Très bien.');
 await page.getByRole('button',{name:'Enregistrer le suivi',exact:true}).click();
 await expect(page.getByRole('region',{name:'Suivi des devoirs'}).getByRole('alert')).toContainText('Suivi indisponible');
 await expect(page.getByRole('textbox',{name:'Retour de correction',exact:true})).toHaveValue('Très bien.');
 fail=false;await page.getByRole('button',{name:'Enregistrer le suivi',exact:true}).click();
 await expect(page.getByText('Suivi enregistré et disponible pour la famille.',{exact:true})).toBeVisible();expect(saves).toBe(2);
});
