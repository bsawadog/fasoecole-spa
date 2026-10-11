import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../../../core/auth';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';
import { CashBookService, CashOverview } from '../../cash-book.service';
import { CashBookPage } from './cash-book';

const sample: CashOverview = {
  book: {openedOn:'2026-01-01',openingBalance:10000,closedOn:null},month:'2026-10',
  openingBalance:10000,receipts:5000,payments:2000,closingBalance:13000,closure:null,history:[],
  rows:[{id:1,date:'2026-10-01',direction:'IN',amount:5000,label:'Dépôt',reference:'D1',source:'MANUAL',balance:15000},
    {id:2,date:'2026-10-02',direction:'OUT',amount:2000,label:'Loyer',reference:null,source:'EXPENSE',balance:13000}],
};
function setup(value: CashOverview=sample) {
  const api={
    overview:vi.fn((_id:number,month:string)=>of({...value,month})),
    open:vi.fn(()=>of(undefined)),add:vi.fn(()=>of(undefined)),delete:vi.fn(()=>of(undefined)),close:vi.fn(()=>of(undefined)),
  };
  TestBed.configureTestingModule({imports:[CashBookPage],providers:[
    {provide:AuthService,useValue:{user:()=>({id:7}),selectSchoolContext:vi.fn(),getOwnedSchools:()=>of([{id:5,name:'École A'}])}},
    {provide:CashBookService,useValue:api},
    {provide:ConfirmationService,useValue:{confirm:vi.fn(()=>Promise.resolve(true))}},
  ]});
  const fixture=TestBed.createComponent(CashBookPage);fixture.detectChanges();return {fixture,api,page:fixture.componentInstance};
}
describe('CashBookPage',()=>{
  it('shows the carry, deposits, cash payments and running balance',()=>{
    const {fixture}=setup();const text=fixture.nativeElement.textContent;
    expect(text).toContain('Report du solde précédent');expect(text).toContain('Dépôt');expect(text).toContain('Loyer');
    expect(text).toContain('13');expect(text).toContain('École A');
  });
  it('opens the book with the actual initial amount',()=>{
    const {page,api}=setup({...sample,book:null,rows:[]});
    page.opening={date:'2026-07-01',amount:10000};page.open();
    expect(api.open).toHaveBeenCalledWith(5,'2026-07-01',10000);
    expect(api.overview).toHaveBeenLastCalledWith(5,'2026-07');
  });
  it('reuses the same request identifier after a failed HTTP submission',()=>{
    const {page,api}=setup();
    api.add.mockReturnValueOnce(throwError(()=>({error:{message:'Network failure'}})));
    page.entry={date:page.currentDate,direction:'IN',amount:5000,label:'Dépôt',reference:'D1'};
    page.saveEntry();page.saveEntry();
    expect(api.add).toHaveBeenCalledTimes(2);
    const calls=api.add.mock.calls as unknown as [number,{requestId:string}][];
    expect(calls[0][1].requestId).toBe(calls[1][1].requestId);
  });
  it('blocks a closing cash count mismatch and submits a reconciled monthly closure',async()=>{
    const {page,api}=setup();page.month='2026-07';page.load();
    page.countedBalance=12900;await page.close(false);expect(api.close).not.toHaveBeenCalled();
    page.countedBalance=13000;page.closureNote='Comptée';await page.close(false);
    expect(api.close).toHaveBeenCalledWith(5,'2026-07',13000,'Comptée',false);
  });
  it('keeps closed books read only and never deletes automatic payments',async()=>{
    const {page,api,fixture}=setup({...sample,book:{...sample.book!,closedOn:'2026-10-09'}});
    expect(page.editable()).toBe(false);expect(fixture.nativeElement.textContent).not.toContain('Enregistrer un mouvement');
    await page.remove(sample.rows[1]);page.saveEntry();expect(api.delete).not.toHaveBeenCalled();expect(api.add).not.toHaveBeenCalled();
  });
  it('renders only fifty movements normally and all movements when printing',()=>{
    const rows=Array.from({length:75},(_,i)=>({...sample.rows[0],id:i+1,label:'Entry '+i}));
    const {page,fixture}=setup({...sample,rows});
    expect(page.pageRows()).toHaveLength(50);expect(page.pageCount()).toBe(2);
    expect(fixture.nativeElement.querySelector('.cash-print-only')).toBeNull();
    page.beforePrint();expect(fixture.nativeElement.querySelectorAll('.cash-print-only tbody tr')).toHaveLength(76);
    page.afterPrint();fixture.detectChanges();expect(fixture.nativeElement.querySelector('.cash-print-only')).toBeNull();
  });
});
