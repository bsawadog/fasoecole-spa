import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../../../core/auth';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';
import { OwnerManagementService } from '../../owner-management.service';
import { ClassRoster } from './class-roster';

describe('ClassRoster transfer', () => {
  const row = {
    studentId: 7, firstName: 'Ali', lastName: 'Kaboré', email: 'ali@ecole.bf', phone: null,
    registrationNumber: 'M-7', birthDate: null, gender: null, parents: [], teacherNames: [],
  };
  const classes = [
    { id: 100, name: 'A', levelId: 1, academicYearId: 5 },
    { id: 101, name: 'B', levelId: 1, academicYearId: 5 },
    { id: 200, name: 'A', levelId: 2, academicYearId: 6 },
  ];

  function setup() {
    localStorage.removeItem('fasoecole_owner_school');
    const api = {
      getClasses: vi.fn(() => of(classes)),
      getLevels: vi.fn(() => of([{ id: 1, name: 'CM1' }, { id: 2, name: 'CM2' }])),
      getAcademicYears: vi.fn(() => of([
        { id: 5, schoolId: 1, label: '2025-2026', startDate: '', endDate: '', isCurrent: true },
        { id: 6, schoolId: 1, label: '2026-2027', startDate: '', endDate: '', isCurrent: false },
      ])),
      getClassRoster: vi.fn(() => of([row])),
      transferRosterStudent: vi.fn(() => of({ ...row })),
      deleteRosterStudent: vi.fn(() => of(undefined)),
      updateRosterParent: vi.fn(() => of({ ...row })),
    };
    const confirmation = { confirm: vi.fn(() => Promise.resolve(true)) };
    const auth = {
      resendUserInvitation: vi.fn(() => of({ emailSent: true })),
      requestPasswordReset: vi.fn(() => of({ message: 'Demande de réinitialisation prise en compte.' })),
    };
    TestBed.configureTestingModule({
      imports: [ClassRoster],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { ...auth, user: () => ({ id: 10 }), selectSchoolContext: vi.fn(), selectedSchoolType: () => 'PRIMAIRE', getOwnedSchools: vi.fn(() => of([{ id: 1, name: 'École A', type: 'PRIMAIRE' }])) },
        },
        { provide: OwnerManagementService, useValue: api },
        { provide: ConfirmationService, useValue: confirmation },
      ],
    });
    const fixture = TestBed.createComponent(ClassRoster);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, api, confirmation, auth };
  }

  it('offers every other class of the school, grouped by academic year', () => {
    const { component } = setup();
    expect(component.transferTargets().map((c) => c.id)).toEqual([101, 200]);
    expect(component.transferTargetGroups().map((g) => g.label)).toEqual(['2025-2026', '2026-2027']);
  });

  const parent = { parentId: 30, userId: 31, firstName: 'Mamadou', lastName: 'Traoré',
    email: 'parent@example.test', phone: '+22670000000', relationship: 'Père', emailVerified: false, passwordSet: false };

  it('uses contact icons and sends activation to the parent account', () => {
    const { fixture, component, auth } = setup();
    component.rows.set([{ ...row, userId: 9, parents: [parent] }]); fixture.detectChanges();
    const email = fixture.nativeElement.querySelector('a[href="mailto:parent@example.test"]');
    const phone = fixture.nativeElement.querySelector('a[href="tel:+22670000000"]');
    expect(email.querySelector('svg')).not.toBeNull();
    expect(phone.querySelector('svg')).not.toBeNull();
    expect(email.getAttribute('aria-label')).toContain('Mamadou Traoré');
    fixture.nativeElement.querySelector('button[aria-label^="Envoyer le lien d’activation"]').click();
    expect(auth.resendUserInvitation).toHaveBeenCalledWith(31);
    expect(auth.requestPasswordReset).not.toHaveBeenCalled();
    expect(component.successMessage()).toContain('activation envoyé au parent');
  });

  it('requests password reset for an already activated parent', () => {
    const { fixture, component, auth } = setup();
    component.rows.set([{ ...row, userId: 9, parents: [{ ...parent, emailVerified: true, passwordSet: true }] }]); fixture.detectChanges();
    fixture.nativeElement.querySelector('button[aria-label^="Réinitialiser le mot de passe"]').click();
    expect(auth.requestPasswordReset).toHaveBeenCalledWith('parent@example.test');
    expect(auth.resendUserInvitation).not.toHaveBeenCalled();
    expect(component.successMessage()).toBe('Demande de réinitialisation prise en compte.');
  });

  it('keeps activation available until the parent has chosen a password and reports delivery failure', () => {
    const { component, auth } = setup();
    const unactivated = { ...parent, emailVerified: true, passwordSet: false };
    component.rows.set([{ ...row, userId: 9, parents: [unactivated] }]);
    auth.resendUserInvitation.mockReturnValue(of({ emailSent: false }));
    component.sendParentAccountLink(unactivated);
    expect(auth.resendUserInvitation).toHaveBeenCalledWith(31);
    expect(component.errorMessage()).toContain('n’a pas pu être envoyé');
    expect(component.successMessage()).toBeNull();
    expect(component.saving()).toBe(false);
  });

  it('offers only calling when the parent has no email', () => {
    const { fixture, component, auth } = setup();
    const noEmail = { ...parent, email: null };
    component.rows.set([{ ...row, userId: 9, parents: [noEmail] }]); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a[href^="tel:"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('a[href^="mailto:"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('button[aria-label^="Envoyer le lien d’activation"]')).toBeNull();
    component.sendParentAccountLink(noEmail);
    expect(auth.resendUserInvitation).not.toHaveBeenCalled();
    expect(auth.requestPasswordReset).not.toHaveBeenCalled();
  });

  it('shows accounting totals and preserves them when a parent profile is edited', () => {
    const { fixture, component } = setup();
    component.rows.set([{ ...row, userId: 9, billingSummary: { totalDue: 50000, totalPaid: 20000, totalBalance: 30000 } }]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toMatch(/50\s000 FCFA/);
    expect(fixture.nativeElement.textContent).toMatch(/20\s000 FCFA/);
    expect(fixture.nativeElement.textContent).toMatch(/30\s000 FCFA/);
    component.parentForm = { firstName: 'Parent', lastName: 'Test', email: 'parent@example.test', phone: '' };
    component.saveParent(30, 7);
    expect(component.rows()[0].billingSummary?.totalBalance).toBe(30000);
  });

  it('offers accessible icon actions with a student deletion action', () => {
    const { fixture } = setup();
    expect(fixture.nativeElement.textContent).toContain('Inscriptions');
    expect(fixture.nativeElement.querySelector('input[name="nFirstName"]')).toBeNull();
    expect(Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .some(button => /Ajouter un (élève|étudiant)/.test(button.textContent ?? ''))).toBe(false);
    const actions = fixture.nativeElement.querySelector('.class-roster__actions');
    expect(actions.querySelectorAll('svg').length).toBe(4);
    expect(actions.querySelector('a[aria-label^="Voir la fiche"]')).not.toBeNull();
    expect(actions.querySelector('button[aria-label^="Transf"]')).not.toBeNull();
    expect(actions.querySelector('button[aria-label^="Supprimer"]')).not.toBeNull();
  });

  it('transfers the student and removes them from the current list', async () => {
    const { fixture, component, api, confirmation } = setup();
    component.startTransfer(row as never);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Classe de destination');

    await component.confirmTransfer(row as never);

    expect(confirmation.confirm).toHaveBeenCalled();
    expect(api.transferRosterStudent).toHaveBeenCalledWith(100, 7, 101);
    expect(component.rows()).toEqual([]);
    expect(component.successMessage()).toContain('CM1 · B (2025-2026)');
    expect(component.successMessage()).toContain('fiche est conservée');
  });
  it('deletes only after confirmation and keeps the row on cancellation', async () => {
    const { component, api, confirmation } = setup();
    confirmation.confirm.mockResolvedValueOnce(false);
    await component.deleteStudent(row as never);
    expect(api.deleteRosterStudent).not.toHaveBeenCalled();
    expect(component.rows()).toHaveLength(1);
    await component.deleteStudent(row as never);
    expect(api.deleteRosterStudent).toHaveBeenCalledWith(100, 7);
    expect(component.rows()).toEqual([]);
    expect(component.saving()).toBe(false);
  });

  it('identifies the selected child when replacing a parent with an existing account', () => {
    const { component, api } = setup();
    component.parentForm = { firstName: 'Boubacar', lastName: 'Sawadogo', email: 'admin@fasoecole.com', phone: '' };
    component.saveParent(30, 7);
    expect(api.updateRosterParent).toHaveBeenCalledWith(100, 30, {
      studentId: 7, firstName: 'Boubacar', lastName: 'Sawadogo', email: 'admin@fasoecole.com', phone: null,
    });
  });

  it('allows adding another parent even when the child already has one', () => {
    const { component } = setup();
    component.startAddParent({ ...row, parents: [{ parentId: 30 }] } as never);
    expect(component.addingParentStudentId()).toBe(7);
  });

});
