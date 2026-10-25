import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService, AccountRecoveryView } from '../core/auth/auth.service';
import { AccountRecoveryQueue } from './account-recovery-queue';

describe('Account recovery queue', () => {
  const row: AccountRecoveryView = { id: 1, schoolId: 2, schoolName: 'School B', studentId: 9,
    firstName: 'Ali', lastName: 'Test', registrationNumber: '001', newEmail: 'new@example.test', reason: 'Accès au courriel perdu',
    status: 'PENDING', createdAt: '2026-10-21T10:00:00', decidedAt: null, completedAt: null, decidedBy: null,
    verificationNote: null, deliveryStatus: null, oldNotificationStatus: null, expiresAt: null, sendCount: 0,
    affectedSchools: ['School B'], history: [] };
  function setup(support = false, owner = true, status: AccountRecoveryView['status'] = 'PENDING') {
    const auth = {
      user: () => ({ rawRoles: support ? ['SUPER_ADMIN'] : ['SCHOOL_ADMIN'] }),
      schoolContextId: () => 2, ownerAccess: () => [{ schoolId: 2, owner }],
      getAccountRecoveries: vi.fn(() => of([{ ...row, status }])),
      decideAccountRecovery: vi.fn((_id: number, approve: boolean) => of({ ...row, status: approve ? 'APPROVED' : 'REJECTED', deliveryStatus: 'SENT' })),
      resendAccountRecovery: vi.fn(() => of({ ...row, status: 'APPROVED', deliveryStatus: 'FAILED' })),
    };
    TestBed.configureTestingModule({ imports: [AccountRecoveryQueue], providers: [provideRouter([]), { provide: AuthService, useValue: auth }] });
    const fixture = TestBed.createComponent(AccountRecoveryQueue); fixture.detectChanges();
    return { fixture, page: fixture.componentInstance, auth };
  }
  it('requires an identity check and a written note before approval', () => {
    const { page, auth } = setup();
    expect(auth.getAccountRecoveries).toHaveBeenCalledWith(2);
    page.decide(row, true); expect(auth.decideAccountRecovery).not.toHaveBeenCalled();
    page.notes[1] = 'Responsable légal contacté aux coordonnées enregistrées.';
    page.decide(row, true); expect(auth.decideAccountRecovery).not.toHaveBeenCalled();
    page.verified[1] = true; page.decide(row, true);
    expect(auth.decideAccountRecovery).toHaveBeenCalledWith(1, true, true, page.notes[1]);
    expect(page.message()).toContain('inchangé jusqu’à');
  });
  it('shows escalations to owners without an approval button', () => {
    const { fixture } = setup(false, true, 'SUPPORT_REQUIRED');
    expect(fixture.nativeElement.textContent).toContain('nécessite le support');
    expect(Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).some(b => b.textContent?.includes('Autoriser et envoyer'))).toBe(false);
  });
  it('loads the platform queue for support and hides it for delegated staff', () => {
    const { auth } = setup(true, false, 'SUPPORT_REQUIRED');
    expect(auth.getAccountRecoveries).toHaveBeenCalledWith(null);
  });
  it('allows cancelling an outstanding recovery without claiming to change the account', () => {
    const { page, auth } = setup(false, true, 'APPROVED');
    page.notes[1] = 'Le titulaire conteste cette demande de récupération.';
    page.decide(page.rows()[0], false);
    expect(auth.decideAccountRecovery).toHaveBeenCalledWith(1, false, false, page.notes[1]);
    expect(page.message()).toContain('annulée');
  });
  it('does not load any recovery details for delegated staff', () => {
    const { auth, page } = setup(false, false);
    expect(auth.getAccountRecoveries).not.toHaveBeenCalled(); expect(page.visible()).toBe(false);
  });
});
