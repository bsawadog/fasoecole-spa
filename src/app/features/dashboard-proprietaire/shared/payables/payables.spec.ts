import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../../../environments/environment';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';
import { PayableOverview, PayableRow } from '../../payables.service';
import { Payables } from './payables';

const base = `${environment.apiUrl}/owner/payables/schools/5`;
const row: PayableRow = {id:1,source:'MANUAL',period:'2026-10',dueDate:'2026-10-05',label:'Loyer octobre',supplier:'Bailleur',
  categoryId:4,categoryName:'Locaux',amount:100000,paid:40000,remaining:60000,status:'PARTIAL',overdue:true,notes:null};
const overview: PayableOverview = {rows:[row],fixedCharges:[],total:100000,paid:40000,remaining:60000,overdue:60000};
const cats = [{id:4,name:'Locaux',active:true,systemCode:null},{id:5,name:'Paie',active:true,systemCode:'PAYROLL'}];

describe('Payables', () => {
  function setup(salaries = false) {
    TestBed.configureTestingModule({imports:[Payables],providers:[provideHttpClient(),provideHttpClientTesting(),
      {provide:ConfirmationService,useValue:{confirm:() => Promise.resolve(true)}}]});
    const fixture = TestBed.createComponent(Payables);
    fixture.componentRef.setInput('schoolId',5); fixture.componentRef.setInput('salariesOnly',salaries);
    fixture.componentInstance.month = '2026-10';
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    const prepare = http.expectOne(`${base}/prepare?month=2026-10`);
    expect(prepare.request.method).toBe('POST'); prepare.flush(null);
    flushLoad(http);
    fixture.detectChanges();
    return {fixture,page:fixture.componentInstance,http};
  }
  function flushLoad(http: HttpTestingController, value = overview) {
    http.expectOne(req => req.url === base && req.params.get('month') === '2026-10').flush(value);
    http.expectOne(`${base}/categories`).flush(cats);
  }
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  it('shows paid amounts, outstanding balances and overdue statuses', () => {
    const {fixture,page} = setup();
    expect(fixture.nativeElement.textContent).toContain('Partiellement payée');
    expect(fixture.nativeElement.textContent).toContain('En retard');
    expect(page.data()?.remaining).toBe(60000);
    page.filter = 'PAID'; fixture.detectChanges();
    expect(page.rows()).toHaveLength(0);
    page.filter = 'OVERDUE'; expect(page.rows()).toHaveLength(1);
  });
  it('records a partial payment and reuses its request ID after a network failure', () => {
    const {fixture,page,http} = setup();
    page.openDetail(row); http.expectOne(`${base}/1/payments`).flush([]);
    page.pay.amount = 20000; page.recordPayment();
    const first = http.expectOne(`${base}/1/payments`);
    expect(first.request.method).toBe('POST');
    expect(first.request.body.amount).toBe(20000);
    const key = first.request.body.requestId;
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    first.error(new ProgressEvent('error'));
    page.recordPayment(); const retry = http.expectOne(`${base}/1/payments`);
    expect(retry.request.body.requestId).toBe(key);
    retry.flush({...row,paid:60000,remaining:40000});
    flushLoad(http,{...overview,rows:[{...row,paid:60000,remaining:40000}],paid:60000,remaining:40000,overdue:40000});
    fixture.detectChanges();
    expect(page.selected()).toBeNull(); expect(page.data()?.remaining).toBe(40000);
    expect(fixture.nativeElement.textContent).toContain('Paiement enregistré.');
  });
  it('rejects an excessive payment before submitting and preserves the unpaid amount', () => {
    const {page,http} = setup();page.openDetail(row);http.expectOne(`${base}/1/payments`).flush([]);
    page.pay.amount = 60001;page.recordPayment();http.expectNone(`${base}/1/payments`);
    expect(page.error()).toContain('reste à payer');expect(page.data()?.remaining).toBe(60000);
  });
  it('creates recurring charges with an amount, a due day and a starting month', () => {
    const {page,http} = setup();page.openForm('fixed');
    expect(page.manualCategories().map(c => c.id)).toEqual([4]);
    page.form.label='Électricité';page.form.amount=15000;page.form.dueDay=12;page.save();
    const fixed=http.expectOne(`${base}/fixed`);
    expect(fixed.request.body).toEqual({categoryId:4,label:'Électricité',supplier:null,amount:15000,dueDay:12,startMonth:'2026-10'});
    fixed.flush(null);http.expectOne(`${base}/prepare?month=2026-10`).flush(null);flushLoad(http);
  });
  it('offers salary payments without the ordinary expense creation controls', () => {
    const {fixture,page} = setup(true);
    const text=fixture.nativeElement.textContent;
    expect(text).toContain('Salaires à payer');expect(text).not.toContain('Ajouter une charge fixe');
    expect(page.canCancel({...row,source:'TEACHER_SALARY',paid:0})).toBe(false);
  });
});
