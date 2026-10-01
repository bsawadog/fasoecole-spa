import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { AuthService, SchoolAccessRequest, SchoolAccessService } from '../../../../core/auth';
import { Approvals } from './approvals';

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
    };
    TestBed.configureTestingModule({
      imports: [Approvals],
      providers: [{ provide: SchoolAccessService, useValue: access }, { provide: AuthService, useValue: auth }],
    });
    const fixture = TestBed.createComponent(Approvals);
    fixture.detectChanges();
    return { fixture, page: fixture.componentInstance, access };
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
});
