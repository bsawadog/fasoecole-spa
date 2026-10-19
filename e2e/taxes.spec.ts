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
  await page.getByRole('button',{name:'Enregistrer l’obligation',exact:true}).click();await expect(page.locator('p-message[severity="success"]')).toContainText('Obligation fiscale enregistrée');
  await page.getByRole('button',{name:'Consulter : TVA déclarée',exact:true}).click();await page.getByRole('button',{name:'Enregistrer un règlement',exact:true}).click();
  await page.getByRole('spinbutton',{name:'Montant du règlement (FCFA)',exact:true}).fill('40000');
  await page.getByLabel('Référence du reçu / quittance',{exact:true}).fill('QUITTANCE-1');await page.getByRole('button',{name:'Valider le règlement',exact:true}).click();
  await expect(page.locator('p-message[severity="success"]')).toContainText('Règlement enregistré');await expect(page.getByRole('region',{name:'Fiche de l’obligation fiscale',exact:true})).toContainText('Partiellement réglé');
  await page.getByRole('button',{name:'Reprendre IUTS / TPA des salaires',exact:true}).click();await expect(page.getByRole('region',{name:'Reprise des montants des salaires',exact:true})).toContainText('8');
  await page.getByLabel('Date limite de paiement',{exact:true}).fill(displayDate);await page.getByLabel('Motif / référence du contrôle',{exact:true}).fill('Contrôle comptable');
  await page.getByRole('button',{name:'Reprendre / actualiser les montants',exact:true}).click();
  await expect(page.locator('p-message[severity="success"]')).toContainText('IUTS / TPA repris');
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

test('filters the tax register by month, quarter and full year',async({page},info)=>{
 await mockSchool(page);const year=new Date().getFullYear();
 const rows=[1,4].map(month=>({id:month,code:'IUTS',periodStart:year+'-'+String(month).padStart(2,'0')+'-01',periodEnd:year+'-'+String(month).padStart(2,'0')+'-28',origin:'PAYROLL',declarationReference:null,version:0,carryover:false,obligation:{id:month,source:'TAX',period:year+'-01',dueDate:year+'-12-01',label:'IUTS période '+month,supplier:'DGI',categoryId:1,categoryName:'Impôts',amount:month*1000,paid:0,remaining:month*1000,status:'UNPAID',overdue:false,notes:null}}));
 await page.route('**/api/owner/taxes/**',r=>r.fulfill({json:{year,rows,due:5000,paid:0,remaining:5000,overdue:0,supplierVat:[{key:'payable:1',date:year+'-01-15',estimatedDate:false,label:'Fournitures',supplier:'Librairie',invoiceNumber:'F001',supplierIfu:'IFU1',amount:18000},{key:'expense:2',date:year+'-04-15',estimatedDate:true,label:'Réparation',supplier:'Technicien',invoiceNumber:null,supplierIfu:null,amount:9000}]}}));
 await page.goto('/proprietaire/impots-taxes');await expect(page.getByRole('heading',{name:'Impôts et taxes',exact:true})).toBeVisible({timeout:120000});
 await page.getByRole('combobox',{name:'Afficher par',exact:true}).click();await page.getByRole('option',{name:'Trimestre',exact:true}).click();
 await page.getByRole('combobox',{name:'Trimestre fiscal',exact:true}).click();await page.getByRole('option',{name:'1er trimestre · janvier à mars',exact:true}).click();
 await expect(page.getByRole('button',{name:'Consulter : IUTS période 1',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Consulter : IUTS période 4',exact:true})).toHaveCount(0);
 await expect(page.locator('.taxes__kpis > div').first()).toContainText(/1[\s\u00a0\u202f]000/);
 await expect(page.getByRole('region',{name:'État de la TVA fournisseurs'})).toContainText(/18[\s\u00a0\u202f]000 FCFA/);
 await page.getByRole('combobox',{name:'Afficher par',exact:true}).click();await page.getByRole('option',{name:'Mois',exact:true}).click();await page.getByRole('combobox',{name:'Mois fiscal',exact:true}).click();await page.getByRole('option',{name:'avril',exact:true}).click();
 await expect(page.getByRole('button',{name:'Consulter : IUTS période 4',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Consulter : IUTS période 1',exact:true})).toHaveCount(0);
 await expect(page.locator('.taxes__kpis > div').first()).toContainText(/4[\s\u00a0\u202f]000/);
 const supplier=page.getByRole('region',{name:'État de la TVA fournisseurs'});await expect(supplier).toContainText(/9[\s\u00a0\u202f]000 FCFA/);await expect(supplier).toContainText('Date à préciser');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Exporter la TVA fournisseurs',exact:true}).click();expect((await download).suggestedFilename()).toContain('tva-fournisseurs-1-');
 await page.getByRole('combobox',{name:'Afficher par',exact:true}).click();await page.getByRole('option',{name:'Année entière',exact:true}).click();await expect(page.getByRole('button',{name:/Consulter : IUTS période/})).toHaveCount(2);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:info.outputPath('tax-periods.png'),fullPage:true});
});
