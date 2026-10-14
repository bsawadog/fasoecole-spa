import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthService, OWNER_MODULES, SchoolAccess } from './auth.service';

describe('AuthService account flow', () => {
  let auth: AuthService;
  let http: HttpTestingController;
  const profile = { id: 7, firstName: 'Awa', lastName: 'Diallo', email: 'awa@test.bf',
    approved: true, emailVerified: true, passwordSet: true, requestedSchoolId: 2,
    requestedSchoolName: 'École', requestedSchoolType: 'PRIMAIRE', requestedRole: 'PARENT', roles: ['PARENT'],
    onboardingSteps: ['READY'] };

  beforeEach(() => {
    localStorage.removeItem('fasoecole_auth');
    localStorage.removeItem('fasoecole_owner_school');
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); localStorage.removeItem('fasoecole_auth'); localStorage.removeItem('fasoecole_owner_school'); });

  const access: SchoolAccess[] = [
    { schoolId: 1, schoolName: 'École A', schoolType: 'PRIMAIRE', status: 'ACTIVE', owner: true, jobTitle: 'Propriétaire', modules: OWNER_MODULES.map(module => module.code) },
    { schoolId: 2, schoolName: 'École B', schoolType: 'PRIMAIRE', status: 'ACTIVE', owner: true, jobTitle: 'Propriétaire', modules: OWNER_MODULES.map(module => module.code) },
  ];

  it.each(OWNER_MODULES.map(module => [module.code]))('limits the %s module to the globally selected school', module => {
    auth.selectSchoolContext(2);
    let schools: { id: number }[] = [];
    auth.getOwnedSchools(7, module).subscribe(value => schools = value);
    http.expectOne(`${environment.apiUrl}/owner/staff/my-access`).flush(access);
    expect(schools.map(school => school.id)).toEqual([2]);
    expect(auth.schoolContextId()).toBe(2);
  });

  it('does not switch to another school when the selected school lacks a module', () => {
    auth.selectSchoolContext(2);
    let schools: { id: number }[] = [];
    auth.getOwnedSchools(7, 'MANAGEMENT').subscribe(value => schools = value);
    http.expectOne(`${environment.apiUrl}/owner/staff/my-access`).flush([access[0], { ...access[1], owner: false, modules: ['FINANCE'] }]);
    expect(schools).toEqual([]);
    expect(auth.schoolContextId()).toBe(2);
    expect(auth.ownerModules().has('MANAGEMENT')).toBe(false);
    expect(auth.ownerModules().has('FINANCE')).toBe(true);
  });

  it('keeps explicit administrator inspection separate from the global school choice', () => {
    auth.selectSchoolContext(2);
    let schools: { id: number }[] = [];
    auth.getOwnedSchools(7, 'MANAGEMENT', 1).subscribe(value => schools = value);
    http.expectOne(`${environment.apiUrl}/owner/staff/my-access`).flush(access);
    expect(schools.map(school => school.id)).toEqual([1]);
    expect(auth.schoolContextId()).toBe(2);
  });

  it('initializes the shared context with an active school ahead of a new pending request', () => {
    auth.loadOwnerAccess().subscribe();
    http.expectOne(`${environment.apiUrl}/owner/staff/my-access`).flush([{ ...access[0], status: 'PENDING_APPROVAL' }, access[1]]);
    expect(auth.schoolContextId()).toBe(2);
    expect(localStorage.getItem('fasoecole_owner_school')).toBe('2');
  });

  it('limits owner-wide school lists to the selected school too', () => {
    auth.selectSchoolContext(2);
    let schools: { id: number }[] = [];
    auth.getOwnedSchools(7).subscribe(value => schools = value);
    http.expectOne(`${environment.apiUrl}/schools/by-owner/7`).flush([{ id: 1, name: 'École A' }, { id: 2, name: 'École B' }]);
    expect(schools.map(school => school.id)).toEqual([2]);
  });

  function login(changes: Record<string, unknown> = {}) {
    auth.login('awa@test.bf', 'MotDePasseSecret').subscribe();
    http.expectOne(`${environment.apiUrl}/auth/login`).flush({ token: 'jwt', userId: 7, email: profile.email, roles: ['PARENT'] });
    const request = http.expectOne(`${environment.apiUrl}/users/me`);
    expect(request.request.headers.get('Authorization')).toBe('Bearer jwt');
    request.flush({ ...profile, ...changes });
  }

  it.each(['PARENT', 'TEACHER', 'STUDENT'] as const)('registration for %s gets an accepted response without opening a session', role => {
    let response: unknown;
    auth.register({ firstName: 'Awa', lastName: 'Diallo', email: profile.email, phone: '',
      password: 'MotDePasseSecret', schoolId: 2, requestedRole: role }).subscribe(value => response = value);
    const request = http.expectOne(`${environment.apiUrl}/auth/register`);
    expect(request.request.body.requestedRole).toBe(role);
    request.flush({ activationRequired: true, message: 'Consultez votre courriel.' }, { status: 202, statusText: 'Accepted' });
    expect(response).toEqual({ activationRequired: true, message: 'Consultez votre courriel.' });
    expect(auth.isAuthenticated()).toBe(false); expect(auth.getToken()).toBeNull();
  });

  it('pending and unverified accounts go to the profile while ready accounts go to their space', () => {
    const navigation = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    login({ approved: false, emailVerified: false, onboardingSteps: ['EMAIL_VERIFICATION_REQUIRED', 'APPROVAL_REQUIRED'] });
    auth.redirectAfterLogin(); expect(navigation).toHaveBeenLastCalledWith('/profil');
    expect(auth.user()?.onboardingSteps).toContain('APPROVAL_REQUIRED');
    auth.refreshCurrentUser().subscribe();
    http.expectOne(`${environment.apiUrl}/users/me`).flush(profile);
    auth.redirectAfterLogin(); expect(navigation).toHaveBeenLastCalledWith('/parent');
  });

  it('missing email proof never defaults to verified', () => {
    login({ emailVerified: undefined });
    expect(auth.user()?.emailVerified).toBe(false);
  });

  it('resend returns the SMTP outcome and activation sends the chosen password', () => {
    let sent = true;
    auth.resendEmailVerification().subscribe(result => sent = result.emailSent);
    http.expectOne(`${environment.apiUrl}/users/me/email-verification`).flush({ emailSent: false });
    expect(sent).toBe(false);
    auth.verifyEmail('link', 'MotDePasseChoisi').subscribe();
    const activation = http.expectOne(`${environment.apiUrl}/auth/verify-email`);
    expect(activation.request.body).toEqual({ token: 'link', newPassword: 'MotDePasseChoisi' });
    activation.flush(null);
  });

  it('student approval includes the selected class and logout clears the saved JWT', () => {
    auth.approvePendingUser(7, 2, 'STUDENT', 11).subscribe();
    const approval = http.expectOne(`${environment.apiUrl}/users/7/approve`);
    expect(approval.request.body).toEqual({ schoolId: 2, role: 'STUDENT', classId: 11 }); approval.flush(profile);
    login();
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    auth.logout();
    expect(auth.getToken()).toBeNull(); expect(localStorage.getItem('fasoecole_auth')).toBeNull();
  });
});
