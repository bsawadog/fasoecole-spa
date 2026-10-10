import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../../../core/auth';
import { ExpenseSummary, ExpensesService } from '../../expenses.service';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';
import { ExpensesPage } from './expenses';
import { PayablesService } from '../../payables.service';

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
        { provide: PayablesService, useValue: {
          prepare: () => of(null), categories: () => of([]),
          overview: () => of({rows:[],fixedCharges:[],total:0,paid:0,remaining:0,overdue:0}),
        } },
      ],
    });
    const fixture = TestBed.createComponent(ExpensesPage);
    fixture.detectChanges();
    return { fixture, api };
  }

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

  it('saves the yearly budget per category', () => {
    const { fixture, api } = setup();
    const page = fixture.componentInstance;
    page.setTab('budget');
    page.budget[30] = 1000000;
    page.saveBudget();
    expect(api.saveBudget).toHaveBeenCalledWith(5, 2, expect.arrayContaining([{ categoryId: 30, amount: 1000000 }]));
  });
});
