import {test,expect} from '@playwright/test';
import {mockSchool} from './ui-fixtures';
test('teacher call defaults to present, preserves recorded statuses and saves the full class',async({page})=>{
 await mockSchool(page,'enseignant');let batches=0;let fail=true;
 let rows=[{studentId:1,fullName:'Awa Kabore',registrationNumber:'E1',status:null as string|null,justification:null as string|null},{studentId:2,fullName:'Issa Diallo',registrationNumber:'E2',status:'ABSENT',justification:'Malade'},{studentId:3,fullName:'Ali Traore',registrationNumber:'E3',status:'EXCUSED',justification:'Motif'},{studentId:4,fullName:'Fati Sawadogo',registrationNumber:'E4',status:null as string|null,justification:null as string|null}];
 await page.route('**/api/me/teacher/classes',route=>route.fulfill({json:[{classId:11,className:'CP1',levelName:'CP',schoolId:1,schoolName:'Ecole',academicYearId:1,academicYearLabel:'2026-2027',currentYear:true,studentCount:4,subjects:[]}]}));
 await page.route('**/api/me/teacher/classes/11/attendance**',route=>{
  if(route.request().method()==='GET')return route.fulfill({json:rows});
  batches++;const payload=route.request().postDataJSON();
  expect(payload.entries.map((entry:any)=>[entry.studentId,entry.status,entry.expectedStatus])).toEqual([[1,'LATE',null],[4,'PRESENT',null]]);
  if(fail)return route.fulfill({status:503,json:{message:'Appel indisponible, réessayez.'}});
  rows=rows.map(row=>{const entry=payload.entries.find((entry:any)=>entry.studentId===row.studentId);return entry?{...row,status:entry.status,justification:entry.justification}:row;});return route.fulfill({json:rows});
 });
 await page.goto('/enseignant/presences');
 await expect(page.getByRole('heading',{name:'Présences et retards',exact:true})).toBeVisible();
 const awa=page.getByRole('combobox',{name:'Présence de Awa Kabore',exact:true});
 await expect(awa).toContainText('Présent');
 await expect(page.getByRole('combobox',{name:'Présence de Issa Diallo',exact:true})).toContainText('Absent');
 await expect(page.getByRole('combobox',{name:'Présence de Ali Traore',exact:true})).toContainText('Absence excusée');expect(batches).toBe(0);
 await awa.click();await page.getByRole('option',{name:'En retard',exact:true}).click();
 await page.getByPlaceholder('Nom ou matricule').fill('Awa');
 await page.getByRole('button',{name:'Enregistrer l’appel de la classe',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Appel indisponible');await expect(awa).toContainText('En retard');
 fail=false;await page.getByRole('button',{name:'Enregistrer l’appel de la classe',exact:true}).click();
 await expect(page.getByText('Appel enregistré pour toute la classe.',{exact:true})).toBeVisible();expect(batches).toBe(2);
 await page.getByPlaceholder('Nom ou matricule').fill('');
 await expect(page.getByRole('combobox',{name:'Présence de Issa Diallo',exact:true})).toContainText('Absent');
 await page.reload();await expect(page.getByRole('combobox',{name:'Présence de Awa Kabore',exact:true})).toContainText('En retard');
 await expect(page.getByRole('combobox',{name:'Présence de Fati Sawadogo',exact:true})).toContainText('Présent');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('teacher home links to all fourteen available modules',async({page})=>{
 await mockSchool(page,'enseignant');await page.goto('/enseignant');
 const home=page.locator('.dashboard-home');
 for(const route of ['classes','ma-fiche','notes','emploi','presences','signalements','devoirs','documents','annonces','rendez-vous','messages','calendrier','discipline','bibliotheque'])await expect(home.locator('a[href="/enseignant/'+route+'"]')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
