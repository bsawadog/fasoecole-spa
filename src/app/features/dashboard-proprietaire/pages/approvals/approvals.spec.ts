import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { AuthService, SchoolAccessRequest, SchoolAccessService } from '../../../../core/auth';
import { Approvals } from './approvals';
import { OwnerManagementService } from '../../owner-management.service';

const request = (id: number, status: SchoolAccessRequest['status']): SchoolAccessRequest => ({
  id, userId: 7, firstName: 'Awa', lastName: 'Kaboré', email: 'awa@ecole.bf', phone: null,
  schoolId: 2, schoolName: 'École B', schoolType: 'PRIMARY', requestedRole: 'PARENT', status,
  createdAt: '2026-10-01T08:00:00', decidedAt: null, children: ['Sali Ouédraogo'],
});

describe('Approvals', () => {
  function setup() {
    const access = {
      pending: vi.fn(() => of([request(1, 'PENDING'), request(2, 'AUTO_APPROVED')])),
      approve: vi.fn(() => of({})),
      reject: vi.fn(() => of({})),
      confirm: vi.fn(() => of({})),
      revoke: vi.fn(() => of({})),
    };
    const auth = {
      user: () => ({ id: 10 }),
      getOwnedSchools: vi.fn(() => of([{ id: 2, name: 'École B' }])),
      getPendingApprovals: vi.fn(() => of([])),
      approvePendingUser: vi.fn(() => of({})),
      resendUserInvitation: vi.fn(() => of({ emailSent: false })),
    };
    TestBed.configureTestingModule({
      imports: [Approvals],
      providers: [{ provide: SchoolAccessService, useValue: access }, { provide: AuthService, useValue: auth },
        { provide: OwnerManagementService, useValue: {
          getClasses: () => of([{ id: 11, schoolId: 2, name: 'CP1', academicYearId: 9 }]),
          getAcademicYears: () => of([{ id: 9, label: '2026-2027' }]),
        } }],
    });
    const fixture = TestBed.createComponent(Approvals);
    fixture.detectChanges();
    return { fixture, page: fixture.componentInstance, access, auth };
  }

  it('lists system-approved parent access separately with a revoke button', () => {
    const { fixture, page, access } = setup();
    expect(page.manualRequests().map((r) => r.id)).toEqual([1]);
    expect(page.autoApproved().map((r) => r.id)).toEqual([2]);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Approuvé par le système');
    expect(text).toContain('Sali Ouédraogo');

    const revoke = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find((b) => b.textContent?.includes('Refuser l’accès'))!;
    revoke.click();
    expect(access.revoke).toHaveBeenCalledWith(2);
    expect(page.autoApproved()).toEqual([]);
    expect(page.successMessage()).toContain('n’a plus accès à École B');
  });

  it('confirms an automatic access', () => {
    const { page, access } = setup();
    page.decideAutomatic(page.autoApproved()[0], true);
    expect(access.confirm).toHaveBeenCalledWith(2);
    expect(access.revoke).not.toHaveBeenCalled();
    expect(page.successMessage()).toContain('est confirmé');
  });

  it('shows child matricules and school matches before approving additional parent access', () => {
    const { fixture, page } = setup();
    page.accessRequests.set([{ ...request(1, 'PENDING'), childRegistrationNumbers: ['001', '002'],
      childReview: ['001 — Sali Diallo', '002 — introuvable dans cet établissement'] }]);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('001, 002');
    expect(text).toContain('001 — Sali Diallo');
    expect(text).toContain('002 — introuvable');
    expect(text).toContain('Vérifiez le lien familial');
  });

  it('requires verified email and preserves the existing student class', () => {
    const { page, auth } = setup();
    const student = { id: 7, firstName: 'Sali', lastName: 'Diallo', email: 'sali@test.bf', emailVerified: false } as never;
    page.selections.set({ 7: { schoolId: 2, role: 'STUDENT', classId: null } });
    page.approve(student); expect(auth.approvePendingUser).not.toHaveBeenCalled();
    page.approve({ ...student as object, emailVerified: true } as never);
    expect(auth.approvePendingUser).toHaveBeenCalled();
    page.changeClass(7, { target: { value: '11' } } as unknown as Event);
    page.approve({ ...student as object, emailVerified: true } as never);
    expect(auth.approvePendingUser).toHaveBeenCalledWith(7, 2, 'STUDENT', 11);
  });

  it('approves additional student school access without requiring a new class', () => {
    const { page, access } = setup();
    const student = { ...request(8, 'PENDING'), requestedRole: 'STUDENT' as const };
    page.decideAccess(student, true); expect(access.approve).toHaveBeenCalledWith(8, undefined);
    page.changeAccessClass(8, { target: { value: '11' } } as unknown as Event);
    page.decideAccess(student, true); expect(access.approve).toHaveBeenCalledWith(8, 11);
  });

  it('reports resend failure without claiming success', () => {
    const { page } = setup();
    page.resend({ id: 7 } as never);
    expect(page.successMessage()).toBeNull(); expect(page.errorMessage()).toContain('n’a pas pu être envoyé');
  });
});
