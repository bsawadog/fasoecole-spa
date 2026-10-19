import { Component, input, output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../../../core/auth';
import { ExpenseSummary, ExpensesService } from '../../expenses.service';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';
import { ExpensesPage } from './expenses';
import { Payables } from '../../shared/payables/payables';

// Payables has its own tests; these tests exercise the expense page's summary and forms.
@Component({ selector: 'app-payables', standalone: true, template: '' })
class PayablesStub {
  readonly schoolId = input.required<number>();
  readonly salariesOnly = input(false);
  readonly mode = input('all');
  readonly saved = output<void>();
}

const summary: ExpenseSummary = {
  schoolName: 'École', from: '2026-09-01', to: '2027-06-30',
  year: { id: 2, label: '2026-2027', startDate: '2026-09-01', endDate: '2027-06-30', current: true },
  years: [{ id: 2, label: '2026-2027', startDate: '2026-09-01', endDate: '2027-06-30', current: true }],
  income: 500000, expenses: 440000, balance: 60000, spentThisMonth: 190000, budgetTotal: 1250000,
  budgetUsedRate: 35.2, overBudgetCount: 1,
  months: [{ month: '2026-09', income: 300000, expenses: 250000, balance: 50000 }],
  categories: [
    { categoryId: 31, name: 'Loyer & locaux', systemCode: null, active: true, budget: 250000, spent: 300000,
      remaining: -50000, usedRate: 120, overBudget: true },
    { categoryId: 30, name: 'Salaires des enseignants', systemCode: 'PAYROLL', active: true, budget: 0, spent: 100000,
      remaining: -100000, usedRate: null, overBudget: false },
  ],
  recentExpenses: [],
};

describe('ExpensesPage', () => {
  function setup() {
    const api = {
      summary: vi.fn(() => of(summary)),
      categories: vi.fn(() => of([
        { id: 30, name: 'Salaires des enseignants', description: null, systemCode: 'PAYROLL', active: true, expenseCount: 0 },
        { id: 31, name: 'Loyer & locaux', description: null, systemCode: null, active: true, expenseCount: 2 },
      ])),
      expenses: vi.fn(() => of([])),
      saveExpense: vi.fn(() => of({})),
      saveBudget: vi.fn(() => of(summary)),
    };
    TestBed.configureTestingModule({
      imports: [ExpensesPage],
      providers: [
        provideRouter([]),
        { provide: ConfirmationService, useValue: { confirm: () => Promise.resolve(true) } },
        { provide: AuthService, useValue: {
          user: () => ({ id: 7 }),
          selectSchoolContext: vi.fn(), selectedSchoolType: () => 'PRIMAIRE', getOwnedSchools: () => of([{ id: 5, name: 'École', type: 'SECONDAIRE' }]),
        } },
        { provide: ExpensesService, useValue: api },
      ],
    });
    TestBed.overrideComponent(ExpensesPage, {
      remove: { imports: [Payables] }, add: { imports: [PayablesStub] },
    });
    const fixture = TestBed.createComponent(ExpensesPage);
    fixture.detectChanges();
    return { fixture, api };
  }

  it('offers the seven steps in order and explains expense creation before payment', () => {
    const {fixture} = setup();
    const labels = [...fixture.nativeElement.querySelectorAll('nav.dep__tabs button')].map((button:any) => button.textContent.trim());
    expect(labels).toEqual(['Saisir une dépense','Saisir une charge fixe','Dépenses à payer','Paiements effectués','Bilan','Budget annuel','Catégories']);
    expect(fixture.nativeElement.querySelector('.dep__guide').textContent).toContain('aucun paiement');
    fixture.componentInstance.setTab('fixed'); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.dep__guide').textContent).toContain('chaque mois');
  });

  it('shows income, expenses, balance and budget overruns', () => {
    const { fixture, api } = setup();
    fixture.componentInstance.setTab('summary');
    fixture.detectChanges();
    expect(api.summary).toHaveBeenCalledWith(5, null);
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Recettes encaissées');
    expect(text).toContain('Excédent');
    expect(text).toContain('Dépassé');
    expect(text).toContain('Depuis la paie des enseignants');
  });

  it('only offers manual categories and validates the expense before saving', () => {
    const { fixture, api } = setup();
    const page = fixture.componentInstance;
    page.setTab('expenses');
    fixture.detectChanges();
    expect(page.manualCategories().map(c => c.id)).toEqual([31]);

    page.openExpense();
    page.form.label = 'Loyer octobre';
    page.form.amount = 0;
    page.saveExpense();
    expect(api.saveExpense).not.toHaveBeenCalled();

    page.form.amount = 150000;
    page.saveExpense();
    expect(api.saveExpense).toHaveBeenCalledWith(5, expect.objectContaining({ categoryId: 31, amount: 150000 }), undefined);
  });

  it('saves invoice VAT inside TTC and deducts only withholding from supplier payment',()=>{
    const {fixture,api}=setup();const page=fixture.componentInstance;page.setTab('expenses');page.openExpense();
    page.form.label='Invoice supplies';page.form.amount=118000;page.invoiceEnabled=true;
    page.invoice={number:'F-001',date:page.form.expenseDate,supplierIfu:'IFU-TEST',taxDueDate:'2099-01-01'};
    page.invoiceTaxes=[{code:'TVA',label:'TVA facturée',treatment:'INCLUDED',amount:18000},{code:'TVA',label:'Retenue TVA',treatment:'WITHHELD',amount:5400}];
    page.saveExpense();expect(api.saveExpense).toHaveBeenCalledWith(5,expect.objectContaining({amount:112600,invoice:expect.objectContaining({total:118000,excludingTax:100000,number:'F-001'})}),undefined);
  });
  it('does not submit a tax detail that exceeds the invoice amount',()=>{
    const {fixture,api}=setup();const page=fixture.componentInstance;page.openExpense();page.form.label='Invoice';page.form.amount=100;page.invoiceEnabled=true;
    page.invoice={number:'F-001',date:page.form.expenseDate,supplierIfu:'',taxDueDate:''};page.invoiceTaxes=[{code:'TVA',label:'TVA',treatment:'INCLUDED',amount:150}];
    page.saveExpense();expect(api.saveExpense).not.toHaveBeenCalled();expect(page.error()).toContain('Vérifiez');
  });
  it('saves the yearly budget per category', () => {
    const { fixture, api } = setup();
    const page = fixture.componentInstance;
    page.setTab('budget');
    page.budget[30] = 1000000;
    page.saveBudget();
    expect(api.saveBudget).toHaveBeenCalledWith(5, 2, expect.arrayContaining([{ categoryId: 30, amount: 1000000 }]));
  });
});
