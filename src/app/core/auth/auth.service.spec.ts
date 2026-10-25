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
    localStorage.removeItem('fasoecole_active_role_7');
    localStorage.removeItem('fasoecole_auth');
    localStorage.removeItem('fasoecole_owner_school');
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { localStorage.removeItem('fasoecole_active_role_7'); http.verify(); localStorage.removeItem('fasoecole_auth'); localStorage.removeItem('fasoecole_owner_school'); });

  const access: SchoolAccess[] = [
    { schoolId: 1, schoolName: 'École A', schoolType: 'PRIMAIRE', status: 'ACTIVE', owner: true, jobTitle: 'Propriétaire', modules: OWNER_MODULES.map(module => module.code) },
    { schoolId: 2, schoolName: 'École B', schoolType: 'PRIMAIRE', status: 'ACTIVE', owner: true, jobTitle: 'Propriétaire', modules: OWNER_MODULES.map(module => module.code) },
  ];

  function multiRoleLogin(roles = ['SCHOOL_ADMIN', 'TEACHER', 'PARENT']) {
    auth.login(profile.email, 'secret').subscribe();
    http.expectOne(`${environment.apiUrl}/auth/login`).flush({ token: 'multi-role-token', userId: 7, email: profile.email, roles });
    http.expectOne(`${environment.apiUrl}/users/me`).flush({ ...profile, roles });
  }

  it('switches among authorized spaces without changing the token and remembers the choice after login', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    multiRoleLogin();
    expect(auth.availableRoles()).toEqual(['proprietaire', 'enseignant', 'parent']);
    expect(await auth.switchRole('parent')).toBe(true);
    expect(auth.role()).toBe('parent');
    expect(auth.getToken()).toBe('multi-role-token');
    expect(navigate).toHaveBeenLastCalledWith('/parent');
    auth.logout();
    multiRoleLogin();
    expect(auth.role()).toBe('parent');
  });

  it('rejects unassigned roles and rolls back a canceled navigation', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(false);
    multiRoleLogin();
    expect(await auth.switchRole('admin')).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    expect(await auth.switchRole('parent')).toBe(false);
    expect(auth.role()).toBe('proprietaire');
    expect(localStorage.getItem('fasoecole_active_role_7')).toBe('proprietaire');
  });

  it('falls back when a remembered role is removed and deduplicates administrative roles', () => {
    localStorage.setItem('fasoecole_active_role_7', 'parent');
    multiRoleLogin(['SCHOOL_ADMIN', 'STAFF', 'TEACHER']);
    expect(auth.role()).toBe('proprietaire');
    expect(auth.availableRoles()).toEqual(['proprietaire', 'enseignant']);
  });

  it('prevents switching before account activation', async () => {
    multiRoleLogin();
    auth.refreshCurrentUser().subscribe();
    http.expectOne(`${environment.apiUrl}/users/me`).flush({ ...profile, roles: ['SCHOOL_ADMIN', 'PARENT'], emailVerified: false });
    expect(await auth.switchRole('parent')).toBe(false);
  });

  it('keeps the chosen space on refresh and returns to an authorized space if access is revoked', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    multiRoleLogin();
    await auth.switchRole('parent');
    auth.refreshCurrentUser().subscribe();
    http.expectOne(`${environment.apiUrl}/users/me`).flush({ ...profile, roles: ['SCHOOL_ADMIN', 'PARENT'] });
    expect(auth.role()).toBe('parent');
    auth.refreshCurrentUser().subscribe();
    http.expectOne(`${environment.apiUrl}/users/me`).flush({ ...profile, roles: ['SCHOOL_ADMIN'] });
    expect(auth.role()).toBe('proprietaire');
    expect(navigate).toHaveBeenLastCalledWith('/proprietaire');
  });

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

  it('reuses loaded access between modules and applies the current school at each call', () => {
    auth.getOwnedSchools(7, 'STUDENTS').subscribe();
    http.expectOne(`${environment.apiUrl}/owner/staff/my-access`).flush(access);
    auth.selectSchoolContext(2);
    let schools: { id: number }[] = [];
    auth.getOwnedSchools(7, 'TEACHERS').subscribe(value => schools = value);
    http.expectNone(`${environment.apiUrl}/owner/staff/my-access`);
    expect(schools.map(school => school.id)).toEqual([2]);
  });

  it('shares concurrent access requests and still supports a fresh forced refresh', () => {
    const results: SchoolAccess[][] = [];
    auth.loadOwnerAccess().subscribe(value => results.push(value));
    auth.loadOwnerAccess().subscribe(value => results.push(value));
    http.expectOne(`${environment.apiUrl}/owner/staff/my-access`).flush(access);
    expect(results).toEqual([access, access]);
    auth.loadOwnerAccess(true).subscribe();
    http.expectOne(`${environment.apiUrl}/owner/staff/my-access`).flush([{ ...access[0], modules: ['FINANCE'] }]);
    expect(auth.ownerModules().has('STUDENTS')).toBe(false);
    expect(auth.ownerModules().has('FINANCE')).toBe(true);
  });

  it('retries after a failed access request instead of caching the error', () => {
    auth.loadOwnerAccess().subscribe({ error: () => undefined });
    http.expectOne(`${environment.apiUrl}/owner/staff/my-access`).flush({}, { status: 503, statusText: 'Unavailable' });
    auth.loadOwnerAccess().subscribe();
    http.expectOne(`${environment.apiUrl}/owner/staff/my-access`).flush(access);
    expect(auth.ownerAccess()).toEqual(access);
  });

  it('forces a new request after a mutation even when an older refresh is pending', () => {
    auth.loadOwnerAccess().subscribe();
    const older = http.expectOne(`${environment.apiUrl}/owner/staff/my-access`);
    auth.loadOwnerAccess(true).subscribe();
    http.expectOne(`${environment.apiUrl}/owner/staff/my-access`).flush([access[1]]);
    older.flush([access[0]]);
    expect(auth.ownerAccess()).toEqual([access[1]]);
  });

  it('clears cached access when a different session is opened', () => {
    auth.loadOwnerAccess().subscribe();
    http.expectOne(`${environment.apiUrl}/owner/staff/my-access`).flush(access);
    login({ id: 8 });
    expect(auth.ownerAccess()).toBeNull();
    auth.loadOwnerAccess().subscribe();
    http.expectOne(`${environment.apiUrl}/owner/staff/my-access`).flush([access[1]]);
    expect(auth.ownerAccess()).toEqual([access[1]]);
  });

  it('does not reuse or restore access from a request started before logout', () => {
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    auth.loadOwnerAccess().subscribe();
    const previous = http.expectOne(`${environment.apiUrl}/owner/staff/my-access`);
    auth.logout();
    auth.loadOwnerAccess().subscribe();
    const current = http.expectOne(`${environment.apiUrl}/owner/staff/my-access`);
    current.flush([access[1]]);
    previous.flush([access[0]]);
    expect(auth.ownerAccess()).toEqual([access[1]]);
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
