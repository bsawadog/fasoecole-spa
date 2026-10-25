import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
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
      getClassTeachers: vi.fn(() => of([{ teacherId: 1, teacherName: "Professeur A", subjectName: "Mathématiques" }, { teacherId: 1, teacherName: "Professeur A", subjectName: "Français" }, { teacherId: 1, teacherName: "Professeur A", subjectName: "Français" }, { teacherId: 2, teacherName: "Professeur A", subjectName: "Histoire" }])),
      getClassRoster: vi.fn(() => of([row])),
      inviteStudentAccount: vi.fn(() => of({ student: { ...row, email: 'login@example.test', accountEmail: 'login@example.test' }, emailSent: true })),
      transferRosterStudent: vi.fn(() => of({ ...row })),
      deleteRosterStudent: vi.fn(() => of(undefined)),
      updateRosterParent: vi.fn(() => of({ ...row })),
      updateRosterStudent: vi.fn(() => of({ ...row })),
    };
    const confirmation = { confirm: vi.fn(() => Promise.resolve(true)) };
    const auth = {
      ownerAccess: vi.fn(() => [{ schoolId: 1, owner: true }]),
      resendUserInvitation: vi.fn(() => of({ emailSent: true })),
      requestPasswordReset: vi.fn(() => of({ message: 'Demande de réinitialisation prise en compte.' })),
    };
    TestBed.configureTestingModule({
      imports: [ClassRoster],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { ...auth, user: () => ({ id: 10, ownerAccount: false }), selectSchoolContext: vi.fn(), selectedSchoolType: () => 'PRIMAIRE', getOwnedSchools: vi.fn(() => of([{ id: 1, name: 'École A', type: 'PRIMAIRE' }])) },
        },
        { provide: OwnerManagementService, useValue: api },
        { provide: ConfirmationService, useValue: confirmation },
      ],
    });
    const fixture = TestBed.createComponent(ClassRoster);
    const dialog = fixture.nativeElement.querySelector('.class-roster__error-dialog') as HTMLDialogElement;
    dialog.showModal = () => dialog.setAttribute('open', '');
    dialog.close = () => { dialog.removeAttribute('open'); dialog.dispatchEvent(new Event('close')); };
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, api, confirmation, auth };
  }

  it.each([
    [false, false, false],
    [true, false, true],
    [false, true, true],
    [true, true, true],
    [undefined, undefined, true],
  ])('allows owner email corrections only before activation: password=%s verified=%s', (passwordSet, emailVerified, readonly) => {
    const { component, fixture } = setup();
    const student = { ...row, userId: 9, passwordSet, emailVerified } as never;
    component.rows.set([student]); component.startEditStudent(student); fixture.detectChanges();
    const email = fixture.nativeElement.querySelector('.class-roster__edit-form input[type="email"]') as HTMLInputElement;
    expect(email.readOnly).toBe(readonly);
  });

  it('keeps email read-only for delegated staff or ownership of another school', () => {
    const { component, auth } = setup();
    const student = { ...row, userId: 9, passwordSet: false, emailVerified: false } as never;
    auth.ownerAccess.mockReturnValue([{ schoolId: 1, owner: false }]);
    expect(component.canCorrectStudentEmail(student)).toBe(false);
    auth.ownerAccess.mockReturnValue([{ schoolId: 2, owner: true }]);
    expect(component.canCorrectStudentEmail(student)).toBe(false);
  });

  it('reports a saved correction without promising delivery after an invitation failure', () => {
    const { component, api } = setup();
    component.startEditStudent(row as never); component.studentForm.email = 'correct@example.test';
    api.updateRosterStudent.mockReturnValueOnce(of({ ...row, email: 'correct@example.test', invitationDeliveryStatus: 'FAILED' }) as never);
    component.saveStudent(row.studentId);
    expect(component.rows()[0].email).toBe('correct@example.test');
    expect(component.successMessage()).toContain('réessayer');
    expect(component.successMessage()).not.toContain('invitation envoyée');
  });

  it('does not announce a new invitation for a case-only email change', () => {
    const { component } = setup();
    component.startEditStudent(row as never); component.studentForm.email = row.email.toUpperCase();
    component.saveStudent(row.studentId);
    expect(component.successMessage()).not.toContain('Courriel corrigé');
  });

  it('assigns the personal email explicitly when the student has none', () => {
    const { component, api, auth } = setup();
    component.openStudentAccess({ ...row, email: null } as never);
    expect(component.studentLoginEmail).toBe('');
    component.sendStudentAccess();
    expect(api.inviteStudentAccount).not.toHaveBeenCalled();
    component.studentLoginEmail = 'login@example.test';
    component.sendStudentAccess();
    expect(api.inviteStudentAccount).toHaveBeenCalledWith(100, 7, 'login@example.test');
    expect(component.rows()[0].email).toBe('login@example.test');
    expect(auth.requestPasswordReset).not.toHaveBeenCalled();
  });

  it('sends password reset to the login address instead of the school contact', () => {
    const { component, auth } = setup();
    component.openStudentAccess({ ...row, userId: 9, accountEmail: 'login@example.test', emailVerified: true, passwordSet: true } as never);
    component.sendStudentAccess();
    expect(auth.requestPasswordReset).toHaveBeenCalledWith('login@example.test');
    expect(auth.resendUserInvitation).not.toHaveBeenCalled();
  });

  it('groups the current class subjects by teacher identity without duplicates', () => {
    const { component, api } = setup();
    component.studentSearch.set('no matching pupil');
    component.showTeachers();
    expect(api.getClassTeachers).toHaveBeenCalledWith(100);
    expect(component.classTeachers()).toEqual([
      { teacherId: 1, name: 'Professeur A', subjects: ['Français', 'Mathématiques'] },
      { teacherId: 2, name: 'Professeur A', subjects: ['Histoire'] },
    ]);
  });
  it('shows a loading failure and allows teachers to be loaded again', () => {
    const { component, api } = setup();
    api.getClassTeachers.mockReturnValueOnce(throwError(() => new Error('offline')));
    component.showTeachers();
    expect(component.loadingTeachers()).toBe(false);
    expect(component.teachersError()).toContain('Impossible');
    expect(component.classTeachers()).toEqual([]);
    component.showTeachers();
    expect(component.teachersError()).toBeNull();
    expect(component.classTeachers()).toHaveLength(2);
  });

  it('offers every other class of the school, grouped by academic year', () => {
    const { component } = setup();
    expect(component.transferTargets().map((c) => c.id)).toEqual([101, 200]);
    expect(component.transferTargetGroups().map((g) => g.label)).toEqual(['2025-2026', '2026-2027']);
  });

  const parent = { parentId: 30, userId: 31, firstName: 'Mamadou', lastName: 'Traoré',
    email: 'parent@example.test', phone: '+22670000000', relationship: 'Père', emailVerified: false, passwordSet: false };

  it('opens a small error dialog for a failed activation and closes it on OK', async () => {
    const { fixture, component, auth } = setup();
    component.rows.set([{ ...row, userId: 9, parents: [parent] }]);
    auth.resendUserInvitation.mockReturnValue(of({ emailSent: false }));
    component.sendParentAccountLink(parent);
    fixture.detectChanges(); await fixture.whenStable();
    const dialog = fixture.nativeElement.querySelector('.class-roster__error-dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain('Le lien d’activation n’a pas pu être envoyé. Réessayez ultérieurement.');
    (dialog.querySelector('button') as HTMLButtonElement).click();
    expect(dialog.open).toBe(false);
    expect(component.errorMessage()).toBeNull();
    expect(component.saving()).toBe(false);
  });

  it('shows server errors from a failed student action in the same dialog', async () => {
    const { fixture, component, auth } = setup();
    auth.resendUserInvitation.mockReturnValue(throwError(() => ({ error: { message: 'Service de courriel indisponible.' } })));
    component.resendInvitation(9);
    fixture.detectChanges(); await fixture.whenStable();
    const dialog = fixture.nativeElement.querySelector('.class-roster__error-dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain('Service de courriel indisponible.');
    expect(component.saving()).toBe(false);
  });

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

  it.each([
    'Ce compte possède plusieurs rôles. Son titulaire peut modifier son identité depuis Mon profil.',
    'Ce courriel est déjà utilisé par un autre compte.',
  ])('shows the API explanation and retains the student edits after a rejected update: %s', message => {
    const { fixture, component, api } = setup();
    component.startEditStudent(row as never);
    component.studentForm.email = 'nouveau@example.test';
    api.updateRosterStudent.mockReturnValueOnce(throwError(() => ({ status: 400, error: { message } })));
    component.saveStudent(row.studentId);
    fixture.detectChanges();
    expect(component.errorDialogMessage()).toBe(message);
    expect(fixture.nativeElement.querySelector('#class-roster-error-message').textContent).toContain(message);
    expect(component.saving()).toBe(false);
    expect(component.editingStudentId()).toBe(row.studentId);
    expect(component.studentForm.email).toBe('nouveau@example.test');
    expect(component.rows()[0].email).toBe(row.email);
    expect(component.successMessage()).toBeNull();
    component.dismissError();
    fixture.detectChanges();
    expect(component.errorMessage()).toBeNull();
    expect(component.errorDialogMessage()).toBeNull();
    component.saveStudent(row.studentId);
    fixture.detectChanges();
    expect(component.successMessage()).toContain('Courriel corrigé');
    expect(component.errorMessage()).toBeNull();
  });

  it('offers accessible icon actions with a student deletion action', () => {
    const { fixture } = setup();
    const toolbar = fixture.nativeElement.querySelector('.class-roster__toolbar');
    expect(toolbar.querySelector('.class-roster__teachers-button').textContent).toContain('Voir les enseignants');
    expect(toolbar.querySelector('#roster-student-search')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.class-roster__hint')).toBeNull();
    expect(fixture.nativeElement.querySelector('input[name="nFirstName"]')).toBeNull();
    expect(Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .some(button => /Ajouter un (élève|étudiant)/.test(button.textContent ?? ''))).toBe(false);
    const actions = fixture.nativeElement.querySelector('.class-roster__actions');
    expect(actions.querySelector('.ui-actions-trigger')).not.toBeNull();
    expect(actions.querySelectorAll('.ui-actions-panel svg').length).toBe(5);
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
