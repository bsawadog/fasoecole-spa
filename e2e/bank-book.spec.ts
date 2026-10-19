import { test, expect } from '@playwright/test';
import { mockSchool } from './ui-fixtures';
const data={book:{openedOn:'2026-01-01',openingBalance:10000},month:'2026-10',openingBalance:10000,receipts:5000,payments:2000,closingBalance:13000,
 rows:[{id:1,date:'2026-10-01',direction:'IN',amount:5000,label:'Dépôt de test',reference:'DEP-1',source:'MANUAL',balance:15000},{id:2,date:'2026-10-02',direction:'OUT',amount:2000,label:'Virement de test',reference:'VIR-1',source:'EXPENSE',balance:13000}]};
test('bank register displays unreconciled balance and preserves form on failed submission',async({page},info)=>{
 await mockSchool(page);
 await page.route('**/api/owner/bank-book/schools/1?**',r=>r.fulfill({json:data}));
 await page.route('**/api/owner/bank-book/schools/1/entries',r=>r.fulfill({status:503,json:{message:'Enregistrement temporairement indisponible'}}));
 await page.goto('/proprietaire/banque');
 await expect(page.getByRole('heading',{name:'Brouillard de banque',exact:true})).toBeVisible({timeout:120000});
 await expect(page.getByRole('note')).toContainText('Solde avant rapprochement bancaire');
 await expect(page.locator('.dep__kpis')).toContainText(/13[\s\u202f\u00a0]000 FCFA/);
 await expect(page.getByRole('row',{name:/Virement de test/}).getByRole('button',{name:'Supprimer'})).toHaveCount(0);
 await page.getByRole('textbox',{name:'Libellé',exact:true}).fill('Frais bancaires de test');
 await page.getByRole('spinbutton',{name:'Montant (FCFA)',exact:true}).fill('250');
 await page.getByRole('button',{name:'Enregistrer',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Enregistrement temporairement indisponible');
 await expect(page.getByRole('textbox',{name:'Libellé',exact:true})).toHaveValue('Frais bancaires de test');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.emulateMedia({media:'print'});await expect(page.getByRole('cell',{name:'Dépôt de test DEP-1'})).toBeVisible();await page.emulateMedia({media:'screen'});
 await page.screenshot({path:info.outputPath('bank-book.png'),fullPage:true});
});
test('staff with only cash permission cannot access bank register',async({page})=>{
 await mockSchool(page,'proprietaire',[],['CASH_BOOK']);await page.goto('/proprietaire/banque');
 await expect(page.getByRole('heading',{name:'Brouillard de banque',exact:true})).toHaveCount(0);
 await expect(page).not.toHaveURL(/\/proprietaire\/banque$/);
});
