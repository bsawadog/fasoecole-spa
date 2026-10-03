import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../../../core/auth';
import { Login } from './login';

describe('Login', () => {
  function setup(queryParams: Record<string, string> = {}) {
    const auth = {
      getRegistrationSchools: vi.fn(() => of([{ id: 1, name: 'École A', type: 'PRIMAIRE' }])),
      register: vi.fn(() => of({ activationRequired: true, message: 'Consultez votre boîte courriel.' })),
      verifyEmail: vi.fn(() => of(undefined)),
      redirectAfterLogin: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } } },
      ],
    });
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
    return { fixture, auth };
  }

  it('does not open a session when the email belongs to a school-created account', () => {
    const { fixture, auth } = setup();
    const page = fixture.componentInstance;
    page.setMode('register');
    page.registerForm.setValue({
      firstName: 'Awa', lastName: 'Diallo', email: 'awa@ecole.bf', phone: '', schoolId: 1,
      requestedRole: 'PARENT', schoolIdentifier: '', childMatricules: '001, MAT-02', password: 'MotDePasse1', confirmPassword: 'MotDePasse1',
    });
    page.submitRegistration();
    expect(auth.register).toHaveBeenCalledWith(expect.objectContaining({ childRegistrationNumbers: ['001', 'MAT-02'] }));
    expect(auth.redirectAfterLogin).not.toHaveBeenCalled();
    expect(page.mode()).toBe('login');
    expect(page.successMessage()).toBe('Consultez votre boîte courriel.');
  });

  it('requires child matricules for parents, and clears claims for other roles', () => {
    const { fixture, auth } = setup();
    const page = fixture.componentInstance;
    page.setMode('register');
    page.registerForm.patchValue({ firstName: 'Awa', lastName: 'Diallo', email: 'awa@ecole.bf', schoolId: 1,
      requestedRole: 'PARENT', password: 'MotDePasse1', confirmPassword: 'MotDePasse1' });
    page.submitRegistration();
    expect(auth.register).not.toHaveBeenCalled();
    expect(page.errorMessage()).toContain('matricule');
    page.registerForm.patchValue({ requestedRole: 'TEACHER', schoolIdentifier: 'EMP-01', childMatricules: '001' });
    page.submitRegistration();
    expect(auth.register).toHaveBeenCalledWith(expect.objectContaining({ childRegistrationNumbers: [] }));
  });

  it.each(['STUDENT', 'TEACHER'] as const)('requires the school identifier for %s and preserves leading zeroes', role => {
    const { fixture, auth } = setup();
    const page = fixture.componentInstance;
    page.registerForm.patchValue({ firstName: 'Awa', lastName: 'Diallo', email: 'awa@test.bf', schoolId: 1,
      requestedRole: role, password: 'MotDePasse1', confirmPassword: 'MotDePasse1' });
    page.submitRegistration(); expect(auth.register).not.toHaveBeenCalled();
    page.registerForm.controls.schoolIdentifier.setValue(' 001 ');
    page.submitRegistration();
    expect(auth.register).toHaveBeenCalledWith(expect.objectContaining({ schoolIdentifier: '001', requestedRole: role }));
  });

  it('activates an account with the password chosen from the emailed link', () => {
    const { fixture, auth } = setup({ activate: 'jeton-activation' });
    const page = fixture.componentInstance;
    expect(page.mode()).toBe('activate');
    expect(fixture.nativeElement.textContent).toContain('Activez votre compte');

    page.resetForm.setValue({ password: 'MotDePasse1', confirmPassword: 'MotDePasse1' });
    page.submitPasswordReset();
    expect(auth.verifyEmail).toHaveBeenCalledWith('jeton-activation', 'MotDePasse1');
    expect(page.mode()).toBe('login');
    expect(page.successMessage()).toContain('activé');
  });

  it('confirms the email automatically when opening a verification link', () => {
    const { fixture, auth } = setup({ verify: 'jeton-verif' });
    expect(auth.verifyEmail).toHaveBeenCalledWith('jeton-verif');
    expect(fixture.componentInstance.successMessage()).toContain('confirmée');
  });
});
