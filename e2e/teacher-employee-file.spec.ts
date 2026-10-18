import {test,expect} from '@playwright/test';
import {mockSchool} from './ui-fixtures';
test('teacher employment file is read only and contact requests preserve the file',async({page},info)=>{
 await mockSchool(page,'enseignant');const writes:string[]=[];let sent=0;
 page.on('request',request=>{if(request.url().includes('/api/')&&['POST','PUT','PATCH','DELETE'].includes(request.method()))writes.push(request.method()+' '+new URL(request.url()).pathname);});
 await page.route('**/api/conversations/unread-count',route=>route.fulfill({json:0}));
 await page.route('**/api/me/teacher/employee-files**',route=>{
  const url=new URL(route.request().url());
  if(url.pathname.endsWith('/requests')){
   sent++;expect(route.request().method()).toBe('POST');expect(route.request().postDataJSON()).toEqual({subject:'Correction de mon matricule',content:'Merci de remplacer EMP-11 par EMP-12.'});
   return sent===1?route.fulfill({status:503,json:{message:'Envoi temporairement indisponible.'}}):route.fulfill({status:201,json:{id:77,subject:'[Fiche employé] Correction de mon matricule'}});
  }
  if(url.pathname.endsWith('/employee-files'))return route.fulfill({json:[{teacherId:11,schoolId:1,schoolName:'Ecole A',employeeNumber:'EMP-11'}]});
  return route.fulfill({json:{teacherId:11,schoolId:1,schoolName:'Ecole A',hireDate:'2026-09-01',month:url.searchParams.get('month'),canRequest:true,administrationName:'Direction Ecole',detail:{teacher:{id:11,schoolId:1,userId:7,firstName:'Awa',lastName:'Traore',employeeNumber:'EMP-11',email:null,phone:'70000000',specialty:'Mathématiques',subjects:['Maths'],teachingSubjects:[{id:1,name:'Maths'}],classCount:1,activeInClass:true},rateType:'FIXED_MONTHLY',rate:80000,schedule:[{id:1,classId:11,className:'CP1',dayOfWeek:1,startTime:'08:00',endTime:'10:00',effectiveFrom:'2026-09-01',effectiveTo:null}],month:{plannedHours:8,workedHours:6,absenceHours:2,extraHours:1,amountDue:80000,paid:30000,remaining:40000,perClass:[],sessions:[{slotId:1,date:'2026-09-14',classId:11,className:'CP1',startTime:'08:00',endTime:'10:00',status:'ABSENT',hours:2}],extras:[],payments:[{id:1,date:'2026-09-30',amount:30000,reference:'PAIE-09'}]}}}});
 });
 await page.goto('/enseignant/ma-fiche');
 await expect(page.getByRole('heading',{name:'Ma fiche employé',exact:true})).toBeVisible();
 const readonly=page.locator('.employee-readonly');await expect(readonly).toContainText('EMP-11');await expect(readonly).toContainText('PAIE-09');
 await expect(readonly.locator('input,textarea,select,button')).toHaveCount(0);expect(writes).toHaveLength(0);
 await expect(readonly).toContainText(/80\s000 FCFA/);await expect(readonly).toContainText(/10\s000 FCFA/);
 await page.getByLabel('Mois de ma fiche employé').fill('2026-09');
 await page.getByLabel('Mois de ma fiche employé').dispatchEvent('change');
 await expect(page.getByRole('heading',{name:'Rémunération et pointages · 2026-09'})).toBeVisible();
 await page.getByLabel('Objet de la demande').fill('Correction de mon matricule');await page.getByLabel('Action souhaitée').fill('Merci de remplacer EMP-11 par EMP-12.');
 await page.getByRole('button',{name:'Envoyer ma demande à l’administration'}).click();
 await expect(page.getByRole('alert')).toContainText('Envoi temporairement indisponible');await expect(page.getByLabel('Action souhaitée')).toHaveValue('Merci de remplacer EMP-11 par EMP-12.');
 await page.getByRole('button',{name:'Envoyer ma demande à l’administration'}).click();
 await expect(page.getByRole('status')).toContainText('Votre demande a été envoyée');
 await expect(page.getByRole('link',{name:'Consulter mes messages et les réponses'})).toHaveAttribute('href','/enseignant/messages');
 await expect(readonly).toContainText('EMP-11');expect(writes).toEqual(['POST /api/me/teacher/employee-files/11/requests','POST /api/me/teacher/employee-files/11/requests']);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.locator('.employee-file').screenshot({path:'test-results/teacher-employee-file-'+info.project.name+'.png'});
});
test('teacher sees a clear empty state without an employment record',async({page})=>{
 await mockSchool(page,'enseignant');await page.route('**/api/me/teacher/employee-files',route=>route.fulfill({json:[]}));await page.goto('/enseignant/ma-fiche');
 await expect(page.getByText('Aucune fiche enseignant n’est rattachée à votre compte. Contactez votre établissement pour vérifier votre rattachement.',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Envoyer ma demande à l’administration'})).toHaveCount(0);
});
