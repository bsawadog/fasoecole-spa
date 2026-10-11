import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { AuthService } from '../../../../core/auth';
import { ExpensesService, ExpenseSummary } from '../../expenses.service';
import { FinancialStatements } from './financial-statements';

const summary: ExpenseSummary = {
  schoolName: 'Ecole A', year: {id: 2, label: '2026-2027', startDate: '2026-09-01', endDate: '2027-06-30', current: true},
  years: [{id: 2, label: '2026-2027', startDate: '2026-09-01', endDate: '2027-06-30', current: true}, {id: 1, label: '2025-2026', startDate: '2025-09-01', endDate: '2026-06-30', current: false}],
  from: '2026-09-01', to: '2027-06-30', income: 500000, expenses: 300000, balance: 200000,
  spentThisMonth: 300000, budgetTotal: 0, budgetUsedRate: null, overBudgetCount: 0,
  months: [{month: '2026-09', income: 500000, expenses: 300000, balance: 200000}],
  categories: [{categoryId: 30, name: 'Salaires', systemCode: 'PAYROLL', active: true, budget: 0, spent: 300000, remaining: -300000, usedRate: null, overBudget: false}], recentExpenses: [],
};
function setup() {
  localStorage.removeItem('fasoecole_owner_school');
  const api = {summary: vi.fn(() => of(summary))};
  TestBed.configureTestingModule({imports: [FinancialStatements], providers: [
    {provide: AuthService, useValue: {user: () => ({id: 7}), selectSchoolContext: vi.fn(), getOwnedSchools: () => of([{id: 5, name: 'Ecole A'}, {id: 6, name: 'Ecole B'}])}},
    {provide: ExpensesService, useValue: api},
  ]});
  const fixture = TestBed.createComponent(FinancialStatements);fixture.detectChanges();return {fixture, api};
}
describe('FinancialStatements', () => {
  it('shows recorded movements and explains that opening balances are excluded', () => {
    const {fixture, api} = setup();
    expect(api.summary).toHaveBeenCalledWith(5, null);
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('500');expect(text).toContain('200');expect(text).toContain('Salaires');
    expect(text).toContain('sans solde d’ouverture');expect(text).toContain('SYSCOHADA');
  });
  it('requests the selected year and resets it when switching schools', () => {
    const {fixture, api} = setup();const page = fixture.componentInstance;
    page.yearId = 1;page.load();expect(api.summary).toHaveBeenLastCalledWith(5, 1);
    page.selectSchool(6);expect(api.summary).toHaveBeenLastCalledWith(6, null);
  });
  it('cancels outdated reports when switching schools', () => {
    const {fixture, api} = setup();const page = fixture.componentInstance;
    const first = new Subject<ExpenseSummary>();const second = new Subject<ExpenseSummary>();
    api.summary.mockReturnValueOnce(first).mockReturnValueOnce(second);
    page.load();page.selectSchool(6);
    first.next(summary);expect(page.summary()).toBeNull();
    second.next({...summary, schoolName: 'Ecole B'});expect(page.summary()?.schoolName).toBe('Ecole B');
  });
});
