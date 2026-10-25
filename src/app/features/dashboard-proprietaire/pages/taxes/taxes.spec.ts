import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController,provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { AuthService } from '../../../../core/auth';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';
import { environment } from '../../../../../environments/environment';
import { SchoolTaxesPage } from './taxes';
import { TaxRow,TaxOverview } from '../../taxes.service';

const row:TaxRow={id:7,code:'TVA',periodStart:'2026-01-01',periodEnd:'2026-12-31',origin:'MANUAL',declarationReference:'TVA-TEST',version:0,carryover:false,
  obligation:{id:7,source:'TAX',period:'2026-01',dueDate:'2026-10-20',label:'TVA annuelle',supplier:'DGI',categoryId:1,categoryName:'Impôts',amount:100000,paid:40000,remaining:60000,status:'PARTIAL',overdue:false,notes:null}};
describe('SchoolTaxesPage',()=>{
  function setup(){
    const access=vi.fn(()=>of([{id:1,name:'École'}]));
    TestBed.configureTestingModule({imports:[SchoolTaxesPage],providers:[provideHttpClient(),provideHttpClientTesting(),{provide:AuthService,useValue:{user:()=>({id:10}),getOwnedSchools:access}},{provide:ConfirmationService,useValue:{confirm:()=>Promise.resolve(true)}}]});
    const fixture=TestBed.createComponent(SchoolTaxesPage);fixture.detectChanges();
    const page=fixture.componentInstance,http=TestBed.inject(HttpTestingController),base=`${environment.apiUrl}/owner/taxes/schools/1`;
    const overview:TaxOverview={year:page.year,rows:[row],due:100000,paid:40000,remaining:60000,overdue:0};
    http.expectOne(`${base}?year=${page.year}`).flush(overview);fixture.detectChanges();
    return {fixture,page,http,base,overview,access};
  }
  it('separates supplier VAT from fiscal debt and filters invoices by their date',()=>{
    const {page,http,overview}=setup();page.data.set({...overview,year:2026,supplierVat:[{key:'payable:1',date:'2026-01-05',estimatedDate:false,label:'Achat',supplier:'Fournisseur',invoiceNumber:'F1',supplierIfu:null,amount:18000},{key:'expense:2',date:'2026-04-05',estimatedDate:true,label:'Achat 2',supplier:null,invoiceNumber:null,supplierIfu:null,amount:9000}]});
    expect(page.supplierVatTotal()).toBe(27000);expect(page.periodTotals().due).toBe(100000);
    page.periodMode.set('QUARTER');page.periodQuarter.set(1);expect(page.supplierVatTotal()).toBe(18000);expect(page.supplierVatRows()).toHaveLength(1);
    page.periodMode.set('MONTH');page.periodMonth.set(4);expect(page.supplierVatTotal()).toBe(9000);http.verify();
  });
  it('filters months and quarters consistently across rows, tax cards and totals',()=>{
    const {page,http,overview}=setup();
    const monthly=(id:number,month:string,amount:number):TaxRow=>({...row,id,periodStart:'2026-'+month+'-01',periodEnd:'2026-'+month+'-28',obligation:{...row.obligation,id,amount,paid:0,remaining:amount}});
    page.data.set({...overview,year:2026,rows:[monthly(1,'01',100),monthly(2,'03',200),monthly(3,'04',300),{...monthly(4,'12',400),periodStart:'2025-12-01',periodEnd:'2025-12-31',carryover:true}]});
    page.periodMode.set('MONTH');page.periodMonth.set(3);expect(page.rows().map(r=>r.id)).toEqual([2]);expect(page.periodTotals().due).toBe(200);expect(page.summaries().find(s=>s.code==='TVA')?.due).toBe(200);
    page.periodMode.set('QUARTER');page.periodQuarter.set(1);expect(page.rows().map(r=>r.id)).toEqual([1,2]);expect(page.periodTotals().due).toBe(300);
    page.openCreate();expect(page.form.periodStart).toBe('2026-01-01');expect(page.form.periodEnd).toBe('2026-03-31');
    page.periodMode.set('YEAR');expect(page.rows()).toHaveLength(4);expect(page.periodTotals().due).toBe(1000);http.verify();
  });
  it('includes an overlapping quarterly obligation at its full amount without duplicating it',()=>{
    const {page,http,overview}=setup();page.data.set({...overview,year:2026,rows:[{...row,periodStart:'2026-01-01',periodEnd:'2026-03-31'}]});page.periodMode.set('MONTH');page.periodMonth.set(2);expect(page.rows()).toHaveLength(1);expect(page.periodTotals().due).toBe(100000);page.periodMonth.set(4);expect(page.rows()).toHaveLength(0);expect(page.periodTotals().due).toBe(0);http.verify();
  });
  it('uses independent tax permission and groups balances by tax type',()=>{
    const {page,http,access,fixture}=setup();expect(access).toHaveBeenCalledWith(10,'TAXES');
    expect(page.summaries().find(s=>s.code==='TVA')).toMatchObject({due:100000,paid:40000,remaining:60000,count:1});
    expect(fixture.nativeElement.textContent).toContain('Patente');page.search.set('tva annuelle');expect(page.rows()).toHaveLength(1);page.codeFilter.set('IUTS');expect(page.rows()).toHaveLength(0);http.verify();
  });
  it('synchronizes payroll only after the explicit calculation action',()=>{
    const {page,http,base,overview}=setup();http.expectNone(r=>r.method==='POST');
    page.synchronizePayroll();const request=http.expectOne(base+'/synchronize-payroll?year='+page.year);expect(request.request.method).toBe('POST');
    request.flush(overview);http.expectOne(base+'?year='+page.year).flush(overview);http.verify();
  });
  it('retains the creation key and values after a failed response',()=>{
    const {page,http,base,overview}=setup();page.openCreate();Object.assign(page.form,{amount:50000,dueDate:'2026-10-20',declarationReference:'DECL-2'});
    page.save();const first=http.expectOne(base),key=first.request.body.requestId;expect(first.request.body.code).toBe('TVA');
    first.flush({},{status:503,statusText:'Unavailable'});expect(page.form.amount).toBe(50000);page.save();const retry=http.expectOne(base);expect(retry.request.body.requestId).toBe(key);
    retry.flush(row);http.expectOne(`${base}?year=${page.year}`).flush(overview);http.verify();
  });
  it('rejects overpayments and reuses the payment key after failure',()=>{
    const {page,http,base,overview}=setup();page.detail.set({tax:row,payments:[],events:[]});page.openPayment();page.payment.amount=60001;page.recordPayment();http.expectNone(`${base}/7/payments`);
    page.payment.amount=30000;page.recordPayment();const first=http.expectOne(`${base}/7/payments`),key=first.request.body.requestId;
    first.flush({},{status:503,statusText:'Unavailable'});page.recordPayment();const retry=http.expectOne(`${base}/7/payments`);expect(retry.request.body.requestId).toBe(key);
    retry.flush({});http.expectOne(`${base}?year=${page.year}`).flush(overview);http.expectOne(`${base}/7`).flush({tax:row,payments:[],events:[]});http.verify();
  });
  it('requires a confirmed deadline and reason before importing payroll taxes',()=>{
    const {page,http,base,overview}=setup();page.openPayroll();http.expectOne(`${base}/payroll-preview?month=${page.currentMonth}`).flush({month:page.currentMonth,iuts:8000,tpa:1600,remunerations:4});
    page.importPayroll();http.expectNone(`${base}/payroll-import`);page.payroll.dueDate='2026-10-20';page.payroll.reason='Contrôle comptable';page.importPayroll();
    const request=http.expectOne(`${base}/payroll-import`);expect(request.request.body).toMatchObject({month:page.currentMonth,reason:'Contrôle comptable'});request.flush(null);
    http.expectOne(`${base}?year=${page.year}`).flush(overview);http.verify();
  });
  it('clears previous data and details when switching fiscal years',()=>{
    const {page,http,base,overview}=setup();page.detail.set({tax:row,payments:[],events:[]});page.year=2025;page.changeYear();expect(page.detail()).toBeNull();expect(page.data()).toBeNull();
    http.expectOne(`${base}?year=2025`).flush({...overview,year:2025});http.verify();
  });
});
