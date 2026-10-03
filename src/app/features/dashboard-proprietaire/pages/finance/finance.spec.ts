import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../../../core/auth';
import { OwnerManagementService } from '../../owner-management.service';
import { FinanceService, InvoiceRow } from '../../finance.service';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';
import { FinancePage } from './finance';

const invoice: InvoiceRow = {
  id: 30, studentId: 20, studentName: 'Awa Kaboré', registrationNumber: 'M-20', classId: 1, className: '6e A',
  feeTypeId: 7, feeTypeName: 'Scolarité', amountDue: 50000, discountAmount: 10000, discountReason: 'Fratrie',
  netAmount: 40000, paid: 15000, balance: 25000, dueDate: '2026-09-10', status: 'OVERDUE', daysOverdue: 21,
};

describe('FinancePage', () => {
  function setup() {
    const finance = {
      overview: vi.fn(() => of({
        schoolName: 'École', expected: 40000, discounts: 10000, collected: 15000, remaining: 25000,
        overdueAmount: 25000, collectedThisMonth: 0, collectionRate: 37.5, invoiceCount: 1, unpaidCount: 1,
        overdueCount: 1, paidCount: 0,
        perClass: [{ classId: 1, className: '6e A', students: 1, expected: 40000, collected: 15000, remaining: 25000, unpaidInvoices: 1 }],
        perFeeType: [], recentPayments: [],
      })),
      feeTypes: vi.fn(() => of([{ id: 7, name: 'Scolarité', amount: 50000, frequency: 'YEARLY', levelId: null,
        levelName: null, description: null, active: true, invoiceCount: 1 }])),
      invoices: vi.fn(() => of([invoice])),
      payments: vi.fn(() => of([])),
      recordPayment: vi.fn(() => of({})),
    };
    TestBed.configureTestingModule({
      imports: [FinancePage],
      providers: [
        provideRouter([]),
        { provide: ConfirmationService, useValue: { confirm: () => Promise.resolve(true) } },
        { provide: AuthService, useValue: {
          user: () => ({ id: 7 }),
          selectSchoolContext: vi.fn(), selectedSchoolType: () => 'PRIMAIRE', getOwnedSchools: () => of([{ id: 5, name: 'École', type: 'SECONDAIRE' }]),
        } },
        { provide: OwnerManagementService, useValue: {
          getClasses: () => of([{ id: 1, schoolId: 5, name: '6e A', levelId: 8, academicYearId: 9, capacity: 30 }]),
          getLevels: () => of([{ id: 8, schoolId: 5, name: '6e', cycle: 'COLLEGE', orderIndex: 10 }]),
        } },
        { provide: FinanceService, useValue: finance },
      ],
    });
    const fixture = TestBed.createComponent(FinancePage);
    fixture.detectChanges();
    return { fixture, finance };
  }

  it('shows the school financial overview', () => {
    const { fixture, finance } = setup();
    expect(finance.overview).toHaveBeenCalledWith(5);
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Reste à percevoir');
    expect(text).toContain('37.5 %');
    expect(text).toContain('6e A');
  });

  it('lists unpaid invoices and records a payment capped to the balance', () => {
    const { fixture, finance } = setup();
    fixture.componentInstance.setTab('invoices');
    fixture.detectChanges();
    expect(finance.invoices).toHaveBeenCalledWith(5, 'UNPAID', null);
    expect(fixture.nativeElement.textContent).toContain('Awa Kaboré');
    expect(fixture.nativeElement.textContent).toContain('En retard');

    fixture.componentInstance.openPanel('pay', invoice);
    fixture.componentInstance.pay.amount = 30000;
    fixture.componentInstance.submitPayment();
    expect(finance.recordPayment).not.toHaveBeenCalled();
    expect(fixture.componentInstance.error()).toContain('25');

    fixture.componentInstance.pay.amount = 25000;
    fixture.componentInstance.submitPayment();
    expect(finance.recordPayment).toHaveBeenCalledWith(30, expect.objectContaining({ amount: 25000, method: 'CASH' }));
  });
});
