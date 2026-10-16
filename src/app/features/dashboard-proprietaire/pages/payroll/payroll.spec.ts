import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { AuthService } from '../../../../core/auth';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';
import { PayrollPage } from './payroll';
import { PayrollEmployee, PayrollOverview, PayrollDetail, PayrollDocument } from '../../payroll.service';
import { environment } from '../../../../../environments/environment';

const school={id:1,name:'École',address:'Ouagadougou',phone:null,email:null};
const employee:PayrollEmployee={userId:20,firstName:'Awa',lastName:'Diallo',email:null,phone:null,active:true,subjects:['Français','Mathématiques'],contracts:[
  {key:'teacher:9',kind:'TEACHER',jobTitle:'Enseignant',employeeNumber:'EMP-9',active:true,hireDate:'2026-10-01',rateType:'FIXED_MONTHLY',rate:80000,eligible:true,prepared:true,payableId:7,due:80000,paid:20000,remaining:60000,workedHours:0,extraHours:0,payments:[]},
],due:80000,paid:20000,remaining:60000,status:'PARTIAL'};

describe('PayrollPage',()=>{
  function setup(){
    const access=vi.fn(()=>of([{id:1,name:'École'}]));
    TestBed.configureTestingModule({imports:[PayrollPage],providers:[provideHttpClient(),provideHttpClientTesting(),
      {provide:AuthService,useValue:{user:()=>({id:10}),getOwnedSchools:access}},
      {provide:ConfirmationService,useValue:{confirm:()=>Promise.resolve(true)}},
    ]});
    const fixture=TestBed.createComponent(PayrollPage);fixture.detectChanges();
    const page=fixture.componentInstance,http=TestBed.inject(HttpTestingController),base=`${environment.apiUrl}/owner/payroll/schools/1`;
    const overview:PayrollOverview={school,month:page.month,employees:[employee],due:80000,paid:20000,remaining:60000};
    const detail:PayrollDetail={school,month:page.month,employee,history:[],documents:[]};
    http.expectOne(`${base}?month=${page.month}`).flush(overview);fixture.detectChanges();
    return {fixture,page,http,base,overview,detail,access};
  }
  it('loads the dedicated payroll permission and displays subjects and payment status',()=>{
    const {fixture,page,http,access}=setup();expect(access).toHaveBeenCalledWith(10,'PAYROLL');
    expect(fixture.nativeElement.textContent).toContain('Français, Mathématiques');expect(fixture.nativeElement.textContent).toContain('Partiellement payé');
    page.search.set('mathematiques');expect(page.employees()).toHaveLength(1);http.verify();
  });
  it('rejects overpayment and reuses the payment key after a network error',()=>{
    const {page,http,base,detail,overview}=setup();
    page.openDetail(20);http.expectOne(`${base}/employees/20?month=${page.month}`).flush(detail);
    page.openPayment(employee.contracts[0]);page.payment.amount=60001;page.recordPayment();
    expect(page.error()).toContain('reste à payer');http.expectNone(`${base}/payments/7`);
    page.payment.amount=30000;page.recordPayment();const first=http.expectOne(`${base}/payments/7`),key=first.request.body.requestId;
    first.flush({message:'Réseau indisponible'},{status:503,statusText:'Unavailable'});
    expect(page.payment.amount).toBe(30000);page.recordPayment();const retry=http.expectOne(`${base}/payments/7`);expect(retry.request.body.requestId).toBe(key);
    retry.flush({});http.expectOne(`${base}?month=${page.month}`).flush(overview);http.expectOne(`${base}/employees/20?month=${page.month}`).flush(detail);http.verify();
  });
  it('requires all configured remunerations to be prepared before enabling a payslip',()=>{
    const {page,http,detail}=setup();page.detail.set({...detail,employee:{...employee,contracts:[employee.contracts[0],{...employee.contracts[0],key:'staff:4',kind:'STAFF',prepared:false,payableId:null,paid:0}]}});
    expect(page.canIssueSlip()).toBe(false);http.verify();
  });
  it('preserves a document request key on failure and opens the saved snapshot',()=>{
    const {page,http,base,detail}=setup();page.selectedUser.set(20);page.detail.set(detail);
    page.issue('PAYSLIP');const first=http.expectOne(`${base}/documents`),key=first.request.body.requestId;
    expect(first.request.body).toMatchObject({kind:'PAYSLIP',userId:20,month:page.month});first.flush({},{status:503,statusText:'Unavailable'});
    page.issue('PAYSLIP');const retry=http.expectOne(`${base}/documents`);expect(retry.request.body.requestId).toBe(key);
    const document:PayrollDocument={id:1,reference:'PAIE-1',kind:'PAYSLIP',month:page.month,createdAt:'2026-10-16T10:00:00',snapshot:{school,month:page.month,employee,issuedOn:'2026-10-16'}};
    retry.flush(document);http.expectOne(`${base}/employees/20?month=${page.month}`).flush(detail);expect(page.document()?.id).toBe(1);http.verify();
  });
  it('clears the previous employee and document when changing the month',()=>{
    const {page,http,base,detail,overview}=setup();page.selectedUser.set(20);page.detail.set(detail);page.month='2026-01';page.changeMonth();
    expect(page.selectedUser()).toBeNull();expect(page.detail()).toBeNull();expect(page.document()).toBeNull();expect(page.data()).toBeNull();
    http.expectOne(`${base}?month=2026-01`).flush({...overview,month:'2026-01'});http.verify();
  });
  it('saves manual IUTS separately from employer TPA and refreshes the net',()=>{
    const {page,http,base,detail,overview}=setup();
    const contract={...employee.contracts[0],paid:0,remaining:80000,iuts:0,tpa:0,net:80000,taxVersion:0};
    page.selectedUser.set(20);page.detail.set({...detail,employee:{...employee,paid:0,contracts:[contract]}});
    page.openTaxes(contract);page.taxForm={iuts:80001,tpa:1600,reason:'Calcul du comptable'};page.saveTaxes();
    http.expectNone(`${base}/payments/7/taxes`);
    page.taxForm.iuts=5000;page.saveTaxes();const save=http.expectOne(`${base}/payments/7/taxes`);
    expect(save.request.method).toBe('PUT');expect(save.request.body).toEqual({iuts:5000,tpa:1600,version:0,reason:'Calcul du comptable'});
    save.flush(null);http.expectOne(`${base}?month=${page.month}`).flush(overview);http.expectOne(`${base}/employees/20?month=${page.month}`).flush(detail);
    const taxed={...employee,contracts:[{...contract,iuts:5000,tpa:1600,net:75000}]};
    expect(page.net(taxed)).toBe(75000);expect(page.sumTax(taxed,'tpa')).toBe(1600);http.verify();
  });
  it('locks tax entry after payment and supports documents issued before tax fields existed',()=>{
    const {page,http}=setup();page.openTaxes(employee.contracts[0]);expect(page.taxContract()).toBeNull();
    expect(page.net(employee)).toBe(80000);expect(page.sumTax(employee,'iuts')).toBe(0);http.verify();
  });
});
