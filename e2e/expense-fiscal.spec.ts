import { test,expect } from '@playwright/test';
import { mockSchool } from './ui-fixtures';
test('records invoice VAT and withholding separately from net supplier payment',async({page},info)=>{
 await mockSchool(page);const saved:any[]=[];
 await page.route('**/api/owner/expenses/schools/1/categories',r=>r.fulfill({json:[{id:31,name:'Fournitures',active:true,systemCode:null,description:null,expenseCount:0}]}));
 await page.route('**/api/owner/expenses/schools/1/expenses**',r=>{
  if(r.request().method()==='POST'){const data=r.request().postDataJSON();expect(data.amount).toBe(112600);expect(data.invoice).toMatchObject({number:'F-001',total:118000,excludingTax:100000});saved.push({...data,id:1,source:'MANUAL',categoryName:'Fournitures'});return r.fulfill({json:saved[0]});}
  return r.fulfill({json:saved});
 });
 await page.goto('/proprietaire/depenses');await expect(page.getByRole('heading',{name:'Dépenses & budget',exact:true})).toBeVisible({timeout:120000});await page.getByRole('button',{name:'Paiements effectués',exact:true}).click();await page.getByRole('button',{name:'+ Dépense déjà payée',exact:true}).click();
 await page.getByRole('textbox',{name:'Libellé',exact:true}).fill('Facture de fournitures');await page.getByRole('spinbutton',{name:'Montant (FCFA)',exact:true}).fill('118000');
 await page.getByRole('checkbox',{name:'Facture avec références et taxes'}).check();await page.getByRole('textbox',{name:'Numéro de facture',exact:true}).fill('F-001');
 await page.getByRole('textbox',{name:'IFU du fournisseur',exact:true}).fill('IFU-TEST');
 const today=new Date().toLocaleDateString('fr-FR');await page.getByRole('combobox',{name:'Échéance de reversement',exact:true}).fill(today);
 await page.getByRole('button',{name:'Ajouter une taxe',exact:true}).click();await page.getByRole('spinbutton',{name:'Montant de taxe 1',exact:true}).fill('18000');
 await page.getByRole('button',{name:'Ajouter une taxe',exact:true}).click();await page.getByRole('spinbutton',{name:'Montant de taxe 2',exact:true}).fill('5400');
 await page.getByRole('combobox',{name:'Traitement de la ligne 2',exact:true}).click();await page.getByRole('option',{name:'Retenue sur le paiement fournisseur',exact:true}).click();
 await expect(page.locator('.dep__panel')).toContainText(/112[\s\u202f\u00a0]600 FCFA/);
 await page.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(page.locator('p-message[severity="success"]')).toContainText('Dépense enregistrée');
 await expect(page.getByRole('button',{name:'Créer les reversements fiscaux',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:info.outputPath('expense-invoice.png'),fullPage:true});
});
test('calculates payroll obligations through an explicit synchronization',async({page})=>{
 await mockSchool(page);let synchronized=false;
 const row=(code:string,amount:number)=>({id:code==='IUTS'?1:2,code,periodStart:'2026-10-01',periodEnd:'2026-10-31',origin:'PAYROLL',declarationReference:null,version:0,carryover:false,obligation:{id:code==='IUTS'?1:2,source:'TAX',period:'2026-10',dueDate:'2026-11-10',label:code+' salaires',supplier:'DGI',categoryId:31,categoryName:'Impôts',amount,paid:0,remaining:amount,status:'UNPAID',overdue:false,notes:null}});
 const overview=()=>({year:2026,rows:synchronized?[row('IUTS',5895),row('TPA',3000)]:[],due:synchronized?8895:0,paid:0,remaining:synchronized?8895:0,overdue:0});
 await page.route('**/api/owner/taxes/schools/1**',r=>{if(r.request().method()==='POST'){expect(r.request().url()).toContain('synchronize-payroll');synchronized=true;}return r.fulfill({json:overview()});});
 await page.goto('/proprietaire/impots-taxes');await expect(page.getByRole('heading',{name:'Impôts et taxes',exact:true})).toBeVisible({timeout:120000});expect(synchronized).toBe(false);
 await page.getByRole('button',{name:'Calculer et synchroniser IUTS / TPA',exact:true}).click();await expect(page.locator('p-message[severity="success"]')).toContainText('synchronisées');
 await expect(page.getByRole('button',{name:'Consulter : IUTS salaires',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Consulter : TPA salaires',exact:true})).toBeVisible();
});
