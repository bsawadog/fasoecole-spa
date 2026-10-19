import {test,expect} from '@playwright/test';
import {mockSchool} from './ui-fixtures';
test('records included VAT when adding an unpaid expense',async({page},info)=>{
 await mockSchool(page);const rows:any[]=[];
 await page.route('**/api/owner/payables/schools/1**',route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.pathname.endsWith('/categories'))return route.fulfill({json:[{id:31,name:'Fournitures',active:true,systemCode:null}]});
  if(url.pathname.endsWith('/prepare'))return route.fulfill({json:null});
  if(url.pathname.endsWith('/payments'))return route.fulfill({json:[]});
  if(req.method()==='POST'){
   const data=req.postDataJSON();expect(data.amount).toBe(118000);expect(data.taxDetails).toMatchObject({invoiceNumber:'F-001',excludingTax:100000,taxes:[{label:'TVA',amount:18000}]});
   rows.push({...data,id:1,source:'MANUAL',period:data.dueDate.slice(0,7),categoryName:'Fournitures',paid:0,remaining:data.amount,status:'UNPAID',overdue:false});return route.fulfill({json:null});
  }
  return route.fulfill({json:{rows,fixedCharges:[],total:rows.length?118000:0,paid:0,remaining:rows.length?118000:0,overdue:0}});
 });
 await page.goto('/proprietaire/depenses');await expect(page.getByRole('heading',{name:'Dépenses & budget',exact:true})).toBeVisible({timeout:120000});
 await expect(page.locator('nav.dep__tabs button')).toHaveText(['Saisir une dépense','Saisir une charge fixe','Dépenses à payer','Paiements effectués','Bilan','Budget annuel','Catégories']);
 await page.getByRole('button',{name:'Saisir une charge fixe',exact:true}).click();await expect(page.getByRole('heading',{name:'Nouvelle charge mensuelle',exact:true})).toBeVisible();await expect(page.locator('.payables .metrics')).toHaveCount(0);
 await page.getByRole('button',{name:'Saisir une dépense',exact:true}).click();await expect(page.getByRole('heading',{name:'Nouvelle dépense à payer',exact:true})).toBeVisible();
 await page.getByRole('textbox',{name:'Libellé',exact:true}).fill('Fournitures avec TVA');await page.getByRole('spinbutton',{name:'Montant total (FCFA)',exact:true}).fill('118000');
 await page.getByRole('button',{name:'Ajouter la TVA / une taxe',exact:true}).click();await page.getByRole('spinbutton',{name:'Montant de taxe 1',exact:true}).fill('18000');
 await page.getByRole('textbox',{name:'Numéro de facture (facultatif)',exact:true}).fill('F-001');await expect(page.locator('fieldset.tax-details')).toContainText(/HT : 100[\s\u202f\u00a0]000 FCFA/);
 await page.screenshot({path:info.outputPath('payable-tax-form.png'),fullPage:true});
 await page.getByRole('button',{name:'Enregistrer',exact:true}).click();await expect(page.locator('p-message[severity="success"]')).toBeVisible();
 await expect(page.getByRole('cell').filter({hasText:'Fournitures avec TVA'})).toContainText(/TVA : 18[\s\u202f\u00a0]000 FCFA/);
 await page.getByRole('button',{name:'Payer / détails',exact:true}).click();await expect(page.getByRole('region',{name:'Détails de la dépense'})).toContainText('Facture : F-001');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
