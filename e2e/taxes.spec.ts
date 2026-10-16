import { test,expect } from '@playwright/test';
import { mockSchool } from './ui-fixtures';

test('creates fiscal obligations, pays partially and imports payroll taxes without duplicates',async({page})=>{
  await mockSchool(page);
  const year=new Date().getFullYear(),today=new Date().toISOString().slice(0,10);
  const displayDate=today.split('-').reverse().join('/');
  const rows:any[]=[],payments:Record<number,any[]>={};
  const overview=()=>({year,rows,due:rows.reduce((s,r)=>s+r.obligation.amount,0),paid:rows.reduce((s,r)=>s+r.obligation.paid,0),remaining:rows.reduce((s,r)=>s+r.obligation.remaining,0),overdue:0});
  const make=(id:number,code:string,label:string,amount:number,origin='MANUAL')=>({id,code,periodStart:`${year}-01-01`,periodEnd:`${year}-12-31`,origin,declarationReference:'DECL-TEST',version:0,carryover:false,obligation:{id,source:'TAX',period:`${year}-01`,dueDate:today,label,supplier:'DGI',categoryId:1,categoryName:'Impôts',amount,paid:0,remaining:amount,status:'UNPAID',overdue:false,notes:null}});
  await page.route('**/api/owner/taxes/**',route=>{
    const request=route.request(),url=new URL(request.url()),path=url.pathname;
    if(path.endsWith('/payroll-preview'))return route.fulfill({json:{month:url.searchParams.get('month'),iuts:8000,tpa:1600,remunerations:4}});
    if(path.endsWith('/payroll-import')){if(!rows.some(r=>r.code==='IUTS'))rows.push(make(2,'IUTS','IUTS salaires',8000,'PAYROLL'),make(3,'TPA','TPA salaires',1600,'PAYROLL'));return route.fulfill({status:200,body:''});}
    if(/\/\d+\/payments$/.test(path)){
      const id=Number(path.split('/').at(-2)),value=request.postDataJSON(),row=rows.find(r=>r.id===id);row.obligation.paid+=value.amount;row.obligation.remaining-=value.amount;row.obligation.status=row.obligation.remaining===0?'PAID':'PARTIAL';
      (payments[id]??=[]).push({id:1,date:today,amount:value.amount,method:value.method,reference:value.reference});return route.fulfill({json:row.obligation});
    }
    if(/\/schools\/1\/\d+$/.test(path)){const id=Number(path.split('/').at(-1));return route.fulfill({json:{tax:rows.find(r=>r.id===id),payments:payments[id]??[],events:[{id:1,action:'CREATE',amount:100000,dueDate:today,reason:'Saisie manuelle',author:'Direction',createdAt:today+'T10:00:00'}]}});}
    if(request.method()==='POST'){const v=request.postDataJSON();rows.push({...make(1,v.code,v.label,v.amount),periodStart:v.periodStart,periodEnd:v.periodEnd});return route.fulfill({json:rows[0]});}
    return route.fulfill({json:overview()});
  });
  await page.goto('/proprietaire/impots-taxes');await expect(page.getByRole('heading',{name:'Impôts et taxes',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Ajouter un impôt ou une taxe',exact:true}).click();
  await page.getByLabel('Libellé',{exact:true}).fill('TVA déclarée');await page.getByRole('spinbutton',{name:'Montant dû (FCFA)',exact:true}).fill('100000');
  await page.getByLabel('Date limite de paiement',{exact:true}).fill(displayDate);
  await page.getByRole('button',{name:'Enregistrer l’obligation',exact:true}).click();await expect(page.getByRole('status')).toContainText('Obligation fiscale enregistrée');
  await page.getByRole('button',{name:'Consulter : TVA déclarée',exact:true}).click();await page.getByRole('button',{name:'Enregistrer un règlement',exact:true}).click();
  await page.getByRole('spinbutton',{name:'Montant du règlement (FCFA)',exact:true}).fill('40000');
  await page.getByLabel('Référence du reçu / quittance',{exact:true}).fill('QUITTANCE-1');await page.getByRole('button',{name:'Valider le règlement',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Règlement enregistré');await expect(page.getByRole('region',{name:'Fiche de l’obligation fiscale',exact:true})).toContainText('Partiellement réglé');
  await page.getByRole('button',{name:'Reprendre IUTS / TPA des salaires',exact:true}).click();await expect(page.getByRole('region',{name:'Reprise des montants des salaires',exact:true})).toContainText('8');
  await page.getByLabel('Date limite de paiement',{exact:true}).fill(displayDate);await page.getByLabel('Motif / référence du contrôle',{exact:true}).fill('Contrôle comptable');
  await page.getByRole('button',{name:'Reprendre / actualiser les montants',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('IUTS / TPA repris');
  await expect(page.getByRole('button',{name:'Consulter : IUTS salaires',exact:true})).toHaveCount(1);
  await expect(page.getByRole('button',{name:'Consulter : TPA salaires',exact:true})).toHaveCount(1);
  await page.getByRole('button',{name:'Consulter : IUTS salaires',exact:true}).click();await page.getByRole('button',{name:'Enregistrer un règlement',exact:true}).click();
  await page.getByRole('button',{name:'Valider le règlement',exact:true}).click();await expect(page.getByRole('region',{name:'Fiche de l’obligation fiscale',exact:true})).toContainText('Soldé');
  await page.emulateMedia({media:'print'});await expect(page.locator('.shell__sidebar')).toBeHidden();await expect(page.locator('.taxes > p-table')).toBeVisible();await expect(page.getByRole('button',{name:'Ajouter un impôt ou une taxe',exact:true})).toBeHidden();await page.emulateMedia({media:'screen'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test('staff with only tax permission can work without access to salaries or other finance modules',async({page})=>{
  await mockSchool(page,'proprietaire',[],['TAXES']);await page.route('**/api/owner/taxes/**',route=>route.fulfill({json:{year:2026,rows:[],due:0,paid:0,remaining:0,overdue:0}}));
  await page.goto('/proprietaire');await expect(page).toHaveURL(/\/proprietaire\/impots-taxes$/);await expect(page.locator('#modules-menu a[href="/proprietaire/impots-taxes"]')).toBeVisible();
  await expect(page.locator('#modules-menu a[href="/proprietaire/salaires"]')).toHaveCount(0);
  await page.goto('/proprietaire/salaires');await expect(page).toHaveURL(/\/proprietaire\/impots-taxes$/);
});
