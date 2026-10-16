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
  it('uses independent tax permission and groups balances by tax type',()=>{
    const {page,http,access,fixture}=setup();expect(access).toHaveBeenCalledWith(10,'TAXES');
    expect(page.summaries().find(s=>s.code==='TVA')).toMatchObject({due:100000,paid:40000,remaining:60000,count:1});
    expect(fixture.nativeElement.textContent).toContain('Patente');page.search.set('tva annuelle');expect(page.rows()).toHaveLength(1);page.codeFilter.set('IUTS');expect(page.rows()).toHaveLength(0);http.verify();
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
