import { test,expect } from '@playwright/test';
import { mockSchool } from './ui-fixtures';

test('lists teachers and staff, edits employee information and grants or removes modules',async({page},info)=>{
  await mockSchool(page);
  const teacher={staff:{id:null as number|null,userId:40,firstName:'Awa',lastName:'Traoré',email:null as string|null,phone:null as string|null,jobTitle:'Enseignant',monthlySalary:null,modules:[] as string[],active:true,managedAccount:false,createdAt:'2026-10-01T08:00:00',emailVerified:false,invitationDeliveryStatus:null},teacher:{id:9,employeeNumber:'EMP-9',specialty:'Mathématiques',hireDate:'2026-09-01',rateType:'HOURLY',rate:2500,rateEffectiveFrom:'2026-09-01'},administrativeEmployment:false,owner:false,identityEditable:true,emailEditable:true,accountActive:true};
  const accountant={...teacher,staff:{...teacher.staff,id:3,userId:41,firstName:'Ali',lastName:'Sawadogo',jobTitle:'Comptable',modules:['PAYROLL','FINANCE']},teacher:null,administrativeEmployment:true};
  let lastUpdate:Record<string,unknown>|null=null;
  await page.route('**/api/owner/staff/schools/1/employees**',route=>{
    const req=route.request();
    if(req.method()==='PUT'){
      lastUpdate=req.postDataJSON();const input=lastUpdate as any;
      expect(input.profile.monthlySalary).toBeNull();expect(input.administrativeEmployment).toBe(false);
      Object.assign(teacher.staff,input.profile,{id:7});Object.assign(teacher.teacher,{employeeNumber:input.employeeNumber,specialty:input.specialty,hireDate:input.hireDate});
      return route.fulfill({json:teacher});
    }
    return route.fulfill({json:[teacher,accountant]});
  });
  await page.goto('/proprietaire/personnel');
  await expect(page.locator('.stf__table tbody tr')).toHaveCount(2);
  const row=page.locator('.stf__table tbody tr').filter({hasText:'Traoré Awa'});
  await expect(row).toContainText('Aucun accès aux modules de gestion');await expect(row).toContainText('EMP-9');
  await row.getByRole('button',{name:'Modifier',exact:true}).click();
  const form=page.getByRole('form',{name:'Modifier les informations et accès',exact:true});
  await form.getByLabel('Prénom',{exact:true}).fill('Awa corrigée');
  await form.getByLabel('Courriel (facultatif)',{exact:true}).fill('awa.nouveau@test.invalid');
  await form.getByLabel('Téléphone (facultatif)',{exact:true}).fill('+22670000000');
  await form.getByLabel('Spécialité',{exact:true}).fill('Sciences');
  await form.getByRole('checkbox',{name:/^Notes & bulletins/}).check();
  await form.getByRole('checkbox',{name:/^Bibliothèque/}).check();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await form.getByRole('button',{name:'Enregistrer',exact:true}).click();
  await expect(page.locator('p-message[role="status"]')).toContainText('Informations et accès');
  await expect(page.locator('.stf__table tbody tr')).toHaveCount(2);
  const updated=page.locator('.stf__table tbody tr').filter({hasText:'Traoré Awa corrigée'});
  await expect(updated).toContainText('awa.nouveau@test.invalid');await expect(updated).toContainText('Bibliothèque');
  expect((lastUpdate as any)?.profile.modules).toEqual(['GRADES','LIBRARY']);
  await updated.getByRole('button',{name:'Retirer les accès',exact:true}).click();
  await page.getByRole('button',{name:'Retirer les accès',exact:true}).last().click();
  await expect(page.locator('p-message[role="status"]')).toContainText('fiche de l’employé est conservée');
  await expect(updated).toContainText('Aucun accès aux modules de gestion');
  await page.getByRole('combobox',{name:'Filtrer les accès',exact:true}).selectOption('WITHOUT_ACCESS');
  await expect(page.locator('.stf__table tbody tr')).toHaveCount(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.locator('.stf__card').screenshot({path:`test-results/employee-access-${info.project.name}.png`});
});
