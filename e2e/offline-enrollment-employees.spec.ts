import { test, expect } from '@playwright/test';
import { mockSchool, school } from './ui-fixtures';

test.use({ serviceWorkers: 'allow' });

for(const kind of ['student','teacher','staff'] as const) {
  test(`creates a pending ${kind} offline and sends it once on reconnecting`,async({page,context})=>{
    await mockSchool(page,'proprietaire',[],undefined,true);
    await context.route('**/api/me/offline-devices/*/key',route=>route.fulfill({json:{key:Buffer.alloc(32,23).toString('base64')}}));
    await context.route('**/api/teacher-work/classes/11/*',route=>route.fulfill({json:[]}));
    await context.route('**/api/owner/payroll/**',route=>route.fulfill({json:{school,employees:[],month:'2026-11',due:0,paid:0,remaining:0}}));
    const path=kind==='student'?'/owner/enrollment/schools/1/students':kind==='teacher'?'/teacher-work/schools/1/teachers':'/owner/staff/schools/1';
    const sent:{id:string|undefined;payload:{firstName:string}}[]=[];
    await context.route('**/api'+path,route=>{
      sent.push({id:route.request().headers()['x-offline-action-id'],payload:route.request().postDataJSON()});
      return route.fulfill({status:201,json:{id:99}});
    });
    await page.goto('/profil');
    await expect(page.getByText('Données prêtes hors connexion pour cet établissement. Vous pouvez ouvrir les modules préparés sans Internet.',{exact:true})).toBeVisible({timeout:90_000});
    await context.setOffline(true);
    const target=kind==='student'?'inscriptions':'employes';
    await page.locator(`a[href="/proprietaire/${target}"]`).first().evaluate((link:HTMLElement)=>link.click());
    await expect(page.getByRole('heading',{name:kind==='student'?'Inscriptions':'Créer un employé',exact:true})).toBeVisible();
    if(kind==='student') {
      await page.getByRole('button',{name:'+ Nouvel élève',exact:true}).click();
      await page.locator('input[name="nsFirstName"]').fill('Awa hors ligne');
      await page.locator('input[name="nsLastName"]').fill('Test');
      await page.getByRole('textbox',{name:'Prénom du parent',exact:true}).fill('Ali');
      await page.locator('.enr__guardian').getByRole('textbox',{name:'Nom',exact:true}).fill('Test');
      await page.getByRole('button',{name:'Inscrire l’élève',exact:true}).click();
    } else {
      if(kind==='staff') {
        await page.getByRole('combobox',{name:'Fonction',exact:true}).click();
        await page.getByRole('option',{name:'Comptable, secrétaire, gardien et autres',exact:true}).click();
        await page.getByRole('button',{name:'Créer un employé',exact:true}).click();
        await page.locator('input[name="jobTitle"]').fill('Gardien');
      }
      const firstName=page.locator('input[name="firstName"]');
      await firstName.click();await firstName.pressSequentially('Awa hors ligne');
      await page.locator('input[name="lastName"]').fill('Test');
      const salary=page.getByRole('spinbutton',{name:kind==='staff'?'Salaire mensuel (FCFA)':'Salaire mensuel fixe (FCFA)',exact:true});
      await salary.pressSequentially('75000');await salary.press('Tab');
      await expect(page.locator('input[name="firstName"]')).toHaveValue('Awa hors ligne');
      await page.getByRole('button',{name:kind==='staff'?'Créer l’employé':'Ajouter l’enseignant',exact:true}).click();
    }
    await page.locator('.shell__outbox > summary').click();
    const outbox=page.getByRole('region',{name:'File d’attente des actions'});
    await expect(outbox).toContainText('Awa hors ligne');await expect(outbox).toContainText('En attente de confirmation');
    expect(sent).toHaveLength(0);await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await context.setOffline(false);
    await expect(page.locator('.shell__outbox')).toHaveCount(0);
    expect(sent).toEqual([{id:expect.any(String),payload:expect.objectContaining({firstName:'Awa hors ligne'})}]);
  });
}
