import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthService, SchoolAccessService } from '../../core/auth';
import { ProfilePage } from './profile';

describe('ProfilePage', () => {
  const baseUser = {
    id: 4, firstName: 'Awa', lastName: 'Diallo', email: 'awa@ecole.bf', phone: '70000000',
    role: 'enseignant' as const, approved: true, emailVerified: true, requestedSchoolId: null,
    requestedSchoolName: null, requestedSchoolType: null, requestedRole: null, rawRoles: ['TEACHER'],
  };

  function setup(user: Record<string, unknown> = baseUser) {
    const auth = {
      user: () => user,
      updateProfile: vi.fn(() => of({ ...baseUser, firstName: 'Aminata' })),
      changePassword: vi.fn(() => of(undefined)),
      resendEmailVerification: vi.fn(() => of({ emailSent: true })),
      logout: vi.fn(),
      getRegistrationSchools: vi.fn(() => of([{ id: 2, name: 'École B', type: 'PRIMAIRE' }])),
    };
    const access = {
      mine: vi.fn(() => of([])),
      request: vi.fn(() => of({
        id: 9, userId: 4, firstName: 'Awa', lastName: 'Diallo', email: 'awa@ecole.bf', phone: null,
        schoolId: 2, schoolName: 'École B', schoolType: 'PRIMAIRE', requestedRole: 'TEACHER',
        status: 'PENDING', createdAt: '2026-10-01T08:00:00', decidedAt: null,
      })),
      cancel: vi.fn(() => of(undefined)),
    };
    TestBed.configureTestingModule({
      imports: [ProfilePage],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: SchoolAccessService, useValue: access },
      ],
    });
    const fixture = TestBed.createComponent(ProfilePage);
    fixture.detectChanges();
    return { fixture, auth, access };
  }

  async function submit(fixture: ComponentFixture<ProfilePage>, index: number): Promise<void> {
    const values = index === 0 ? fixture.componentInstance.form : fixture.componentInstance.passwordForm;
    const form = fixture.nativeElement.querySelectorAll('form')[index] as HTMLFormElement;
    for (const [name, value] of Object.entries(values)) {
      const input = form.querySelector<HTMLInputElement>('input[name="' + name + '"]');
      if (!input) continue;
      input.value = String(value ?? '');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    fixture.nativeElement.querySelectorAll('form')[index].dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true })
    );
  }

  it('displays personal details and saves editable fields', async () => {
    const { fixture, auth } = setup();
    const page = fixture.componentInstance;
    const email = fixture.nativeElement.querySelector('#profile-email') as HTMLInputElement;
    expect(email.value).toBe('awa@ecole.bf');
    expect(email.readOnly).toBe(true);

    page.form.firstName = ' Aminata ';
    await submit(fixture, 0);
    expect(auth.updateProfile).toHaveBeenCalledWith({
      firstName: 'Aminata', lastName: 'Diallo', phone: '70000000', childRegistrationNumbers: undefined, schoolIdentifier: undefined,
    });
    expect(page.success()).toBe(true);
    expect(page.form.firstName).toBe('Aminata');
  });

  it('reports profile errors without claiming success', async () => {
    const { fixture, auth } = setup();
    auth.updateProfile.mockImplementation(() => throwError(() => new Error('API unavailable')));
    await submit(fixture, 0);
    expect(fixture.componentInstance.error()).toContain('Impossible');
    expect(fixture.componentInstance.success()).toBe(false);
  });

  it('validates and changes the password', async () => {
    const { fixture, auth } = setup();
    const page = fixture.componentInstance;
    page.passwordForm = { currentPassword: 'ancienMdp1', newPassword: 'NouveauMdp1', confirmPassword: 'Autre' };
    await submit(fixture, 1);
    expect(auth.changePassword).not.toHaveBeenCalled();
    expect(page.passwordError()).toContain('confirmation');

    page.passwordForm = { currentPassword: 'ancienMdp1', newPassword: 'NouveauMdp1', confirmPassword: 'NouveauMdp1' };
    await submit(fixture, 1);
    expect(auth.changePassword).toHaveBeenCalledWith('ancienMdp1', 'NouveauMdp1');
    expect(page.passwordSuccess()).toBe(true);
    expect(page.passwordForm.currentPassword).toBe('');
    expect(auth.logout).toHaveBeenCalled();
  });

  it('shows the server message when the current password is wrong', async () => {
    const { fixture, auth } = setup();
    auth.changePassword.mockImplementation(() => throwError(() => new HttpErrorResponse({
      status: 400, error: { message: 'Le mot de passe actuel est incorrect' },
    })));
    const page = fixture.componentInstance;
    page.passwordForm = { currentPassword: 'mauvais12', newPassword: 'NouveauMdp1', confirmPassword: 'NouveauMdp1' };
    await submit(fixture, 1);
    expect(page.passwordError()).toBe('Le mot de passe actuel est incorrect');
    expect(page.passwordSuccess()).toBe(false);
  });

  it('lets a teacher request access to another school', () => {
    const { fixture, access } = setup();
    const page = fixture.componentInstance;
    expect(fixture.nativeElement.textContent).toContain('Accès à d’autres établissements');
    expect(access.mine).toHaveBeenCalled();

    page.accessForm.schoolId = 2;
    page.accessSchoolIdentifier = 'EMP-01';
    page.requestAccess();
    fixture.detectChanges();
    expect(access.request).toHaveBeenCalledWith(2, 'TEACHER', undefined, 'EMP-01');
    expect(page.requests()[0].schoolName).toBe('École B');
    expect(fixture.nativeElement.textContent).toContain('En attente');
  });

  it('requires school-specific child matricules and submits them for parent approval', () => {
    const { fixture, access } = setup({ ...baseUser, role: 'parent', rawRoles: ['PARENT'] });
    const page = fixture.componentInstance;
    page.accessForm.schoolId = 2;
    page.requestAccess();
    expect(access.request).not.toHaveBeenCalled();
    expect(page.accessError()).toContain('matricule');
    page.accessChildMatricules = ' 001, 002;001 ';
    page.requestAccess();
    expect(access.request).toHaveBeenCalledWith(2, 'PARENT', ['001', '002'], undefined);
    expect(page.accessChildMatricules).toBe('');
  });

  it('allows a pending parent to correct child matricules on their own profile', () => {
    const { fixture, auth } = setup({ ...baseUser, approved: false, requestedRole: 'PARENT', childRegistrationNumbers: ['001'] });
    const page = fixture.componentInstance;
    page.initialChildMatricules = '002, 003';
    page.save({ invalid: false } as any);
    expect(auth.updateProfile).toHaveBeenCalledWith(expect.objectContaining({ childRegistrationNumbers: ['002', '003'] }));
  });

  it('hides school access requests for owners and pending accounts', () => {
    const { fixture, access } = setup({ ...baseUser, role: 'proprietaire', rawRoles: ['SCHOOL_ADMIN'] });
    expect(fixture.nativeElement.textContent).not.toContain('Accès à d’autres établissements');
    expect(access.mine).not.toHaveBeenCalled();
    TestBed.resetTestingModule();

    const pending = setup({ ...baseUser, approved: false });
    expect(pending.fixture.componentInstance.canRequestSchools()).toBe(false);
  });

  it('offers to resend the verification link only when the email is unverified', () => {
    const verified = setup();
    expect(verified.fixture.nativeElement.textContent).not.toContain('Adresse courriel non vérifiée');
    TestBed.resetTestingModule();

    const { fixture, auth } = setup({ ...baseUser, emailVerified: false });
    expect(fixture.nativeElement.textContent).toContain('Adresse courriel non vérifiée');
    const button = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find((b) => b.textContent?.includes('Renvoyer le lien'))!;
    button.click();
    fixture.detectChanges();
    expect(auth.resendEmailVerification).toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('vient d’être envoyé');
  });

  it('does not claim a verification mail was sent when SMTP delivery failed', () => {
    const { fixture, auth } = setup({ ...baseUser, emailVerified: false });
    auth.resendEmailVerification.mockImplementation(() => of({ emailSent: false }));
    fixture.componentInstance.resendVerification();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('n’a pas pu être envoyé');
    expect(fixture.nativeElement.textContent).not.toContain('vient d’être envoyé');
  });

  it('shows onboarding steps and blocks school requests while email is unverified', () => {
    const { fixture, access } = setup({ ...baseUser, emailVerified: false,
      onboardingSteps: ['EMAIL_VERIFICATION_REQUIRED', 'CHILD_LINK_REQUIRED'] });
    expect(fixture.nativeElement.textContent).toContain('Courriel à confirmer');
    expect(fixture.nativeElement.textContent).toContain('Enfant à rattacher');
    expect(access.mine).not.toHaveBeenCalled();
  });
});
