import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PayrollCalculator } from './payroll-calculator';
import { PayrollCalculationPreview, PayrollEmployee } from '../../payroll.service';
import { environment } from '../../../../../environments/environment';

describe('PayrollCalculator',()=>{
  function setup(){
    TestBed.configureTestingModule({imports:[PayrollCalculator],providers:[provideHttpClient(),provideHttpClientTesting()]});
    const fixture=TestBed.createComponent(PayrollCalculator),page=fixture.componentInstance,http=TestBed.inject(HttpTestingController);
    fixture.componentRef.setInput('school',1);fixture.componentRef.setInput('month','2026-10');
    fixture.componentRef.setInput('employee',{userId:20,due:100000,contracts:[]} as unknown as PayrollEmployee);
    fixture.detectChanges();const base=`${environment.apiUrl}/owner/payroll/schools/1/employees/20/calculation`;
    http.expectOne(`${base}?month=2026-10`).flush(null);
    page.form={...page.form,tpaExempt:true,reason:'Justificatifs vérifiés'};
    const preview={result:{input:{...page.form},month:'2026-10',ruleVersion:'BF-CGI-2026-v1',gross:100000,taxableBase:75000,iuts:5895,net:94105,tpa:0,employerCost:100000,brackets:[]},versions:{'7':0},grossByPayable:{'7':100000}} as unknown as PayrollCalculationPreview;
    return {fixture,page,http,base,preview};
  }
  it('requests a server calculation and never applies it before validation',()=>{
    const {page,http,base,preview}=setup();page.calculate();const req=http.expectOne(`${base}/preview?month=2026-10`);
    expect(req.request.body).toMatchObject({baseSalary:100000,tpaExempt:true,regime:'SALARIED'});req.flush(preview);
    expect(page.preview()?.result.net).toBe(94105);http.expectNone(`${base}?month=2026-10`);http.verify();
  });
  it('invalidates the preview when parameters change',()=>{
    const {page,http,base,preview}=setup();page.calculate();http.expectOne(`${base}/preview?month=2026-10`).flush(preview);
    page.form.familyCharges=2;page.save();expect(page.preview()).toBeNull();http.expectNone(`${base}?month=2026-10`);http.verify();
  });
  it('retains a request key on network failure and applies the preview versions',()=>{
    const {page,http,base,preview}=setup();page.calculate();http.expectOne(`${base}/preview?month=2026-10`).flush(preview);
    const saved=vi.fn();page.saved.subscribe(saved);page.save();const first=http.expectOne(`${base}?month=2026-10`),key=first.request.body.requestId;
    expect(first.request.body).toMatchObject({versions:{'7':0},grossByPayable:{'7':100000}});
    first.flush({message:'Réseau indisponible'},{status:503,statusText:'Unavailable'});
    page.save();const retry=http.expectOne(`${base}?month=2026-10`);expect(retry.request.body.requestId).toBe(key);retry.flush(null);expect(saved).toHaveBeenCalledOnce();http.verify();
  });
  it('clears salaried allowances when selecting teaching vacations',()=>{
    const {page,http}=setup();page.form.regime='TEACHING_VACATION';page.form.familyCharges=2;page.form.housing=10000;page.regimeChanged();
    expect(page.form.baseSalary).toBe(0);expect(page.form.familyCharges).toBe(0);expect(page.form.housing).toBe(0);http.verify();
  });
});
