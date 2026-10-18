import { TestBed } from '@angular/core/testing';
import { MonthlyFinanceChart } from './monthly-finance';
import { MonthlyFinance } from '../../../../core/models/monthly-finance.model';

describe('MonthlyFinanceChart', () => {
  const data: MonthlyFinance = {
    academicYearId: 1, yearLabel: '2025-2026', startDate: '2025-09-15', endDate: '2026-01-10',
    receivedAmount: 1000, spentAmount: 1300, difference: -300,
    months: [
      { month: '2025-09', receivedAmount: 500, spentAmount: 600 },
      { month: '2025-10', receivedAmount: 300, spentAmount: 650 },
      { month: '2025-11', receivedAmount: 0, spentAmount: 0 },
      { month: '2025-12', receivedAmount: 0, spentAmount: 0 },
      { month: '2026-01', receivedAmount: 200, spentAmount: 50 },
    ],
  };
  function setup(value = data) {
    TestBed.configureTestingModule({ imports: [MonthlyFinanceChart] });
    const fixture = TestBed.createComponent(MonthlyFinanceChart);
    fixture.componentRef.setInput('data', value); fixture.detectChanges(); return fixture;
  }
  it('renders every month, totals, negative differences and the accessible data table', () => {
    const fixture = setup();
    expect(fixture.nativeElement.querySelectorAll('svg g[role="button"]')).toHaveLength(5);
    expect(fixture.nativeElement.textContent).toContain('2025-2026');
    expect(fixture.nativeElement.querySelector('.monthly-finance__negative').textContent).toContain('-300');
    expect(fixture.nativeElement.querySelectorAll('tbody tr')).toHaveLength(5);
    expect(fixture.nativeElement.textContent).toContain('pas le bénéfice');
  });
  it('shows exact monthly amounts on pointer hover and keyboard focus', () => {
    const fixture = setup();
    const groups = fixture.nativeElement.querySelectorAll('svg g[role="button"]');
    groups[0].dispatchEvent(new MouseEvent('mouseenter')); fixture.detectChanges();
    expect(fixture.componentInstance.active()?.month).toBe('2025-09');
    expect(fixture.nativeElement.querySelector('.monthly-finance__detail').textContent).toContain('500 FCFA');
    groups[1].dispatchEvent(new FocusEvent('focus')); fixture.detectChanges();
    expect(fixture.componentInstance.active()?.month).toBe('2025-10');
    expect(groups[1].getAttribute('aria-label')).toContain('650 FCFA');
  });
  it('renders empty months without inventing financial activity or invalid SVG dimensions', () => {
    const fixture = setup({ ...data, receivedAmount: 0, spentAmount: 0, difference: 0,
      months: data.months.map(m => ({ ...m, receivedAmount: 0, spentAmount: 0 })) });
    expect(fixture.nativeElement.textContent).toContain('Aucun encaissement ni dépense');
    const bars = Array.from(fixture.nativeElement.querySelectorAll('svg rect[class^="monthly-finance__bar"]')) as SVGRectElement[];
    expect(bars.every(bar => bar.getAttribute('height') === '0')).toBe(true);
  });
  it('refreshes the selected values and scale when the school or year changes', () => {
    const fixture = setup();
    fixture.componentInstance.select('2025-09');
    fixture.componentRef.setInput('data', { ...data, academicYearId: 2, yearLabel: '2027-2028', months: [{ month: '2027-09', receivedAmount: 10000, spentAmount: 0 }] });
    fixture.detectChanges();
    expect(fixture.componentInstance.active()?.month).toBe('2027-09');
    expect(fixture.componentInstance.maximum()).toBe(10000);
    expect(fixture.nativeElement.textContent).toContain('2027-2028');
  });
});
