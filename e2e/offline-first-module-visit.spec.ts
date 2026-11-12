import { test, expect } from '@playwright/test';
import { mockSchool, school } from './ui-fixtures';

test.use({ serviceWorkers: 'allow' });

for(const module of ['classes','enseignants'] as const) {
  test(`first visit to ${module} works offline after profile preparation without opening the module online`,async({page,context})=>{
    await mockSchool(page,'proprietaire',[],undefined,true);
    await context.route('**/api/me/offline-devices/*/key',route=>route.fulfill({json:{key:Buffer.alloc(32,23).toString('base64')}}));
    await context.route('**/api/teacher-work/classes/11/*',route=>route.fulfill({json:[{
      id:8,schoolId:1,firstName:'Issa',lastName:'Diallo',email:'issa@example.test',phone:null,
      specialty:'Calcul',subjects:['Calcul'],teachingSubjects:[],activeInClass:true,classCount:1,
    }]}));
    await context.route('**/api/owner/payroll/**',route=>route.fulfill({json:{school,employees:[],month:'2026-11',due:0,paid:0,remaining:0}}));
    await page.goto('/profil');
    const toggle=page.getByRole('switch',{name:'Mode hors connexion Internet sur cet appareil'});
    await expect(toggle).toBeChecked();await expect(toggle).toBeEnabled();
    await expect(page.getByText('Données prêtes hors connexion pour cet établissement. Vous pouvez ouvrir les modules préparés sans Internet.',{exact:true})).toBeVisible();
    const requests:string[]=[];
    page.on('request',request=>{if(/\/(classes\/11\/roster|teacher-work\/classes\/11\/teachers)/.test(request.url()))requests.push(request.url());});
    await context.setOffline(true);
    await page.locator(`a[href="/proprietaire/${module}"]`).first().evaluate((link:HTMLElement)=>link.click());
    await expect(page.locator('tbody')).toContainText(module==='classes'?'Awa':'Issa Diallo');
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    expect(requests).toEqual([]);
    await page.locator('button[aria-controls="account-profile"]').click();
    await page.locator('a[href="/profil"]').click();
    await page.getByText('Diagnostic hors connexion',{exact:true}).click();
    await page.getByRole('button',{name:'Préparer le diagnostic',exact:true}).click();
    const text=await page.getByRole('textbox',{name:'Diagnostic hors connexion',exact:true}).inputValue();
    const diagnostic=JSON.parse(text);
    expect(diagnostic.browserOnline).toBe(false);expect(diagnostic.modeEnabled).toBe(true);
    expect(diagnostic.vaultUnlocked).toBe(true);expect(diagnostic.copyCount).toBeGreaterThan(0);
    expect(diagnostic.events.some((event:{outcome:string})=>event.outcome==='offline-cache-hit')).toBe(true);
    expect(text).not.toContain('ui-test-session');expect(text).not.toContain('issa@example.test');
  });
}
