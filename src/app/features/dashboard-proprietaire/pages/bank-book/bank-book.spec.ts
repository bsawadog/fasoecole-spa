import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../../../core/auth';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';
import { BankBookService, BankOverview } from '../../bank-book.service';
import { BankBookPage } from './bank-book';
const sample:BankOverview={book:{openedOn:'2026-01-01',openingBalance:10000},month:'2026-10',openingBalance:10000,receipts:5000,payments:2000,closingBalance:13000,
 rows:[{id:1,date:'2026-10-01',direction:'IN',amount:5000,label:'Dépôt',reference:'D1',source:'MANUAL',balance:15000},{id:2,date:'2026-10-02',direction:'OUT',amount:2000,label:'Virement',reference:null,source:'EXPENSE',balance:13000}]};
function setup(value=sample){
 const api={overview:vi.fn((_id:number,month:string)=>of({...value,month})),open:vi.fn(()=>of(undefined)),add:vi.fn(()=>of(undefined)),delete:vi.fn(()=>of(undefined))};
 const auth={user:()=>({id:7}),getOwnedSchools:vi.fn(()=>of([{id:5,name:'École de test'}]))};
 TestBed.configureTestingModule({imports:[BankBookPage],providers:[{provide:AuthService,useValue:auth},{provide:BankBookService,useValue:api},{provide:ConfirmationService,useValue:{confirm:vi.fn(()=>Promise.resolve(true))}}]});
 const fixture=TestBed.createComponent(BankBookPage);fixture.detectChanges();return {fixture,page:fixture.componentInstance,api,auth};
}
describe('Bank book',()=>{
 it('shows receipts, payments and the unreconciled balance with separate permission',()=>{const {fixture,auth}=setup();const text=fixture.nativeElement.textContent;expect(text).toContain('Solde avant rapprochement bancaire');expect(text).toContain('Dépôt');expect(text).toContain('Virement');expect(auth.getOwnedSchools).toHaveBeenCalledWith(7,'BANK_BOOK');});
 it('accepts an opening overdraft',()=>{const {page,api}=setup({...sample,book:null});page.opening={date:'2026-07-01',amount:-5000.5};page.open();expect(api.open).toHaveBeenCalledWith(5,'2026-07-01',-5000.5);});
 it('preserves input and idempotency key after failed submission',()=>{const {page,api}=setup();api.add.mockReturnValueOnce(throwError(()=>({error:{message:'Offline'}})));page.entry={date:page.currentDate,direction:'OUT',amount:250,label:'Frais bancaires',reference:'F1'};page.saveEntry();expect(page.entry.label).toBe('Frais bancaires');expect(page.error()).toBe('Offline');page.saveEntry();const calls=api.add.mock.calls as unknown as [number,{requestId:string}][];expect(calls).toHaveLength(2);expect(calls[0][1].requestId).toBe(calls[1][1].requestId);});
 it('never deletes automatic movements',async()=>{const {page,api}=setup();await page.remove(sample.rows[1]);expect(api.delete).not.toHaveBeenCalled();});
 it('prints all rows rather than only the current page',()=>{const {page}=setup({...sample,rows:Array.from({length:75},(_,i)=>({...sample.rows[0],id:i+1}))});expect(page.rows()).toHaveLength(50);page.beforePrint();expect(page.rows()).toHaveLength(75);page.afterPrint();expect(page.rows()).toHaveLength(50);});
 it('clears outdated balances when loading fails',()=>{const {page,api}=setup();api.overview.mockReturnValueOnce(throwError(()=>({error:{message:'Offline'}})));page.load();expect(page.data()).toBeNull();expect(page.loading()).toBe(false);expect(page.error()).toBe('Offline');});
});
