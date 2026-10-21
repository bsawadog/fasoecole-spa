import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, defer, finalize, map, of, shareReplay, switchMap, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { LoginRequest, LoginResponse, ROLE_HOME_ROUTE, User, UserDto, Role, resolveRoles, resolveRole } from '../models';

const STORAGE_KEY = 'fasoecole_auth';
const SPACE_KEY = 'fasoecole_active_role_';

interface StoredSession {
  token: string;
  user: User;
}

export interface PasswordResetRequestResponse {
  message: string;
}

/** Réponse publique commune aux inscriptions et aux demandes d'activation. */
export interface ActivationRequired {
  activationRequired: true;
  message: string;
}

export interface RegistrationRequest {
  schoolIdentifier?: string;
  childRegistrationNumbers?: string[];
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  schoolId: number;
  requestedRole: ApprovalRole;
}

export interface OwnerRegistrationRequest {
  firstName:string;lastName:string;email:string;phone:string;password:string;
}

export interface AccountRecoveryView {
  id: number; schoolId: number; schoolName: string; studentId: number | null;
  firstName: string; lastName: string; registrationNumber: string; newEmail: string; reason: string;
  status: 'PENDING' | 'SUPPORT_REQUIRED' | 'APPROVED' | 'REJECTED' | 'COMPLETED' | 'SUPERSEDED';
  createdAt: string; decidedAt: string | null; completedAt: string | null; decidedBy: number | null;
  verificationNote: string | null; deliveryStatus: string | null; oldNotificationStatus: string | null;
  expiresAt: string | null; sendCount: number; affectedSchools: string[];
  history: { actorId: number | null; action: string; details: string; createdAt: string }[];
}

export interface RegistrationSchool {
  id: number;
  name: string;
  type: string;
  status?: string;
}

export interface ProfileUpdate {
  schoolIdentifier?: string;
  childRegistrationNumbers?: string[];
  firstName: string;
  lastName: string;
  phone: string;
}

export type ApprovalRole = 'TEACHER' | 'PARENT' | 'STUDENT';

/** Modules de l'espace propriétaire pouvant être délégués au personnel. */
export type OwnerModule = 'DASHBOARD' | 'MANAGEMENT' | 'STUDENTS' | 'TEACHERS' | 'FINANCE' | 'EXPENSES' | 'GRADES' | 'ENROLLMENT'
  | 'CALENDAR' | 'DISCIPLINE' | 'LIBRARY' | 'HOMEWORK' | 'REQUESTS' | 'PARENT_PORTAL' | 'MESSAGES' | 'CASH_BOOK' | 'BANK_BOOK' | 'FINANCIAL_STATEMENTS' | 'ASSETS' | 'INVENTORY' | 'PAYROLL' | 'TAXES';

export const OWNER_MODULES: { code: OwnerModule; label: string; route: string }[] = [
  { code: 'DASHBOARD', label: 'Tableau de bord', route: '/proprietaire' },
  { code: 'MANAGEMENT', label: 'Configuration de l’école', route: '/proprietaire/gestion' },
  { code: 'STUDENTS', label: 'Élèves & dossiers', route: '/proprietaire/classes' },
  { code: 'TEACHERS', label: 'Enseignants & paie', route: '/proprietaire/enseignants' },
  { code: 'FINANCE', label: 'Recouvrement', route: '/proprietaire/frais' },
  { code: 'PAYROLL', label: 'Salaires', route: '/proprietaire/salaires' },
  { code: 'TAXES', label: 'Impôts et taxes', route: '/proprietaire/impots-taxes' },
  { code: 'EXPENSES', label: 'Dépenses & budget', route: '/proprietaire/depenses' },
  { code: 'GRADES', label: 'Notes & bulletins', route: '/proprietaire/notes' },
  { code: 'ENROLLMENT', label: 'Inscriptions', route: '/proprietaire/inscriptions' },
  { code: 'CALENDAR', label: 'Calendrier scolaire', route: '/proprietaire/calendrier' },
  { code: 'DISCIPLINE', label: 'Discipline et vie scolaire', route: '/proprietaire/discipline' },
  { code: 'LIBRARY', label: 'Bibliothèque', route: '/proprietaire/bibliotheque' },
  { code: 'HOMEWORK', label: 'Suivi des devoirs', route: '/proprietaire/suivi-devoirs' },
  { code: 'REQUESTS', label: 'Demandes administratives', route: '/proprietaire/demandes-administratives' },
  { code: 'PARENT_PORTAL', label: 'Portail parents', route: '/proprietaire/portail-parents' },
  { code: 'MESSAGES', label: 'Messages', route: '/proprietaire/messages' },
  { code: 'CASH_BOOK', label: 'Brouillard de caisse', route: '/proprietaire/caisse' },
  { code: 'BANK_BOOK', label: 'Brouillard de banque', route: '/proprietaire/banque' },
  { code: 'FINANCIAL_STATEMENTS', label: 'États financiers', route: '/proprietaire/etats-financiers' },
  { code: 'ASSETS', label: 'Patrimoine et mobilier', route: '/proprietaire/patrimoine' },
  { code: 'INVENTORY', label: 'Stocks et fournitures', route: '/proprietaire/stocks' },
];

export const OWNER_LIFE_MODULES: Record<'calendrier' | 'discipline' | 'bibliotheque' | 'suivi-devoirs' | 'demandes-administratives', OwnerModule> = {
  calendrier: 'CALENDAR', discipline: 'DISCIPLINE', bibliotheque: 'LIBRARY',
  'suivi-devoirs': 'HOMEWORK', 'demandes-administratives': 'REQUESTS',
};

/** Établissement accessible dans l'espace propriétaire (possédé ou délégué). */
export interface SchoolAccess {
  schoolId: number;
  schoolName: string;
  schoolType: string;
  status?: string;
  submittedAt?: string | null;
  owner: boolean;
  jobTitle: string;
  modules: OwnerModule[];
}

export interface OwnerDashboard {
  classReceivables?: import('../models/dashboard-charts.model').ClassReceivables | null;
  weeklyAttendance?: import('../models/dashboard-charts.model').WeeklyAttendance | null;
  bankPosition?: { yearLabel: string; fromDate: string; asOf: string; openingBalance: number | null; receipts: number; payments: number; balance: number } | null;
  monthlyFinance?: import('../models/monthly-finance.model').MonthlyFinance | null;
  schoolId: number;
  schoolName: string;
  schoolType: string;
  generatedDate: string;
  students: number;
  teachers: number;
  classes: number;
  levels: number;
  parents: number;
  pendingAccountApprovals: number;
  pendingInvoices: number;
  outstandingAmount: number;
  receivedAmount: number;
  expectedAmount: number;
  attendanceRecorded: number;
  presentToday: number;
  absentToday: number;
  lateToday: number;
  excusedToday: number;
  pendingAttendanceReportsCount?: number;
  pendingAttendanceReports?: {
    id: number;
    studentName: string;
    attendanceType: 'ABSENT' | 'LATE';
    startDate: string;
    endDate: string;
    createdAt: string;
  }[];
  handledAttendanceReports?: {
    id: number;
    studentName: string;
    attendanceType: 'ABSENT' | 'LATE';
    startDate: string;
    endDate: string;
    handledAt: string | null;
  }[];
  validatedReportCards: number;
  schoolAverage: number | null;
  averagePeriodName: string | null;
  passRate: number | null;
  rankedStudents: number;
  unreadMessages: number;
  recentPayments: {
    id: number;
    studentName: string;
    amount: number;
    paymentDate: string;
    method: string;
    reference: string | null;
  }[];
  recentNotifications: {
    id: number;
    title: string;
    content: string | null;
    read: boolean;
    createdAt: string;
  }[];
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly apiUrl = environment.apiUrl;

  private readonly _user = signal<User | null>(this.restoreSession()?.user ?? null);
  private readonly _token = signal<string | null>(this.restoreSession()?.token ?? null);

  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => !!this._user());
  readonly role = computed(() => this._user()?.role ?? null);
  readonly availableRoles = computed(() => resolveRoles(this._user()?.rawRoles ?? []));

  async switchRole(role: Role): Promise<boolean> {
    const user = this._user();
    const token = this._token();
    if (!user || !token || !user.approved || !user.emailVerified || user.mustChangePassword
      || !this.availableRoles().includes(role)) return false;
    if (role === user.role) return true;
    this.setSession(token, { ...user, role });
    try {
      const navigated = await this.router.navigateByUrl(ROLE_HOME_ROUTE[role]);
      if (!navigated) this.setSession(token, user);
      return navigated;
    } catch {
      this.setSession(token, user);
      return false;
    }
  }

  private readonly _ownerAccess = signal<SchoolAccess[] | null>(null);
  private ownerAccessRequest?: { token: string | null; response: Observable<SchoolAccess[]> };
  readonly ownerAccess = this._ownerAccess.asReadonly();
  private readonly selectedSchoolId = signal(Number(localStorage.getItem('fasoecole_owner_school')) || null);
  readonly schoolContextId = this.selectedSchoolId.asReadonly();
  private readonly ownedSchools = signal<RegistrationSchool[]>([]);
  readonly selectedSchoolType = computed(() => {
    const id = this.selectedSchoolId();
    const access = this.ownerAccess() ?? [];
    return access.find(school => school.schoolId === id)?.schoolType
      ?? this.ownedSchools().find(school => school.id === id)?.type
      ?? (id === null ? access[0]?.schoolType ?? this.ownedSchools()[0]?.type : undefined);
  });

  selectSchoolContext(schoolId: number): void {
    localStorage.setItem('fasoecole_owner_school', String(schoolId));
    this.selectedSchoolId.set(schoolId);
  }
  /** Vrai pour le propriétaire (ou l'administrateur) : accès complet à l'espace propriétaire. */
  readonly isSchoolOwner = computed(() => {
    const roles = this._user()?.rawRoles ?? [];
    return roles.includes('SCHOOL_ADMIN') || roles.includes('SUPER_ADMIN');
  });
  /** Modules accessibles (union sur tous les établissements). */
  readonly ownerModules = computed<Set<OwnerModule>>(() => {
    if (this.isSchoolOwner()) {
      return new Set(OWNER_MODULES.map((m) => m.code));
    }
    const schoolId = this.schoolContextId();
    return new Set((this._ownerAccess() ?? [])
      .filter(access => schoolId === null || access.schoolId === schoolId)
      .flatMap(access => access.modules));
  });

  /**
   * Authentifie l'utilisateur auprès de l'API :
   * 1. POST /auth/login -> { token, userId, email, roles }
   * 2. GET /users/{userId} -> profil complet (firstName, lastName, ...)
   * Le rôle applicatif est déduit des rôles backend (SUPER_ADMIN, SCHOOL_ADMIN, TEACHER, STUDENT, PARENT).
   */
  login(email: string, password: string): Observable<User> {
    const body: LoginRequest = { email, password };

    return defer(() => {
      this.clearSession();
      return this.http.post<LoginResponse>(`${this.apiUrl}/auth/login`, body).pipe(
        switchMap((loginResponse) => {
          const headers = new HttpHeaders({
            Authorization: `Bearer ${loginResponse.token}`,
          });

          return this.loadProfile(loginResponse, headers);
        })
      );
    });
  }

  register(request: RegistrationRequest): Observable<User | ActivationRequired> {
    return defer(() => {
      this.clearSession();
      return this.http.post<LoginResponse | ActivationRequired>(`${this.apiUrl}/auth/register`, request).pipe(
        switchMap((response): Observable<User | ActivationRequired> => {
          if ('activationRequired' in response) {
            return of(response);
          }
          const loginResponse = response;
          const headers = new HttpHeaders({ Authorization: `Bearer ${loginResponse.token}` });
          return this.loadProfile(loginResponse, headers);
        })
      );
    });
  }

  getRegistrationSchools(): Observable<RegistrationSchool[]> {
    return this.http.get<RegistrationSchool[]>(`${this.apiUrl}/schools/registration-options`);
  }

  registerOwner(request:OwnerRegistrationRequest):Observable<ActivationRequired> {
    return this.http.post<ActivationRequired>(`${this.apiUrl}/auth/register-owner`,request);
  }

  enableOwnerAccount():Observable<User> {
    const token=this._token();
    return this.http.post<UserDto>(`${this.apiUrl}/users/me/owner-account`,{}).pipe(
      map(profile=>this.toUser(profile,profile.roles)),
      tap(user=>{ if(token) this.setSession(token,user);this._ownerAccess.set(null); }),
    );
  }

  /**
   * Établissements accessibles dans l'espace propriétaire. Avec un module, la liste inclut aussi
   * les établissements où ce module a été délégué à l'utilisateur (personnel administratif).
   */
  getOwnedSchools(ownerId: number, module?: OwnerModule, scopeSchoolId?: number | null): Observable<RegistrationSchool[]> {
    if (!module && this.user()?.rawRoles.includes('SUPER_ADMIN')) {
      return this.loadOwnerAccess().pipe(map(access => this.schoolsForContext(access.map(a => ({id:a.schoolId,name:a.schoolName,type:a.schoolType,status:a.status})), scopeSchoolId)));
    }
    if (!module) {
      return this.http.get<RegistrationSchool[]>(`${this.apiUrl}/schools/by-owner/${ownerId}`).pipe(
        tap(schools => { if (this.user()?.id === ownerId) this.ownedSchools.set(schools); }),
        map(schools => this.schoolsForContext(schools, scopeSchoolId)),
      );
    }
    return this.loadOwnerAccess().pipe(
      map((access) =>
        this.schoolsForContext(access
          .filter((a) => a.modules.includes(module))
          .map((a) => ({ id: a.schoolId, name: a.schoolName, type: a.schoolType, status: a.status })), scopeSchoolId)
      )
    );
  }

  private schoolsForContext(schools: RegistrationSchool[], scopeSchoolId?: number | null): RegistrationSchool[] {
    const schoolId = scopeSchoolId ?? this.schoolContextId();
    if (schoolId !== null) return schools.filter(school => school.id === schoolId);
    const initial = schools.find(school => school.status === 'ACTIVE') ?? schools[0];
    return initial ? [initial] : [];
  }

  /** Charge (une fois par session) les établissements et modules accessibles à l'utilisateur. */
  loadOwnerAccess(force = false): Observable<SchoolAccess[]> {
    const sessionToken = this._token();
    // Ordinary page loads share requests. Explicit refreshes always fetch fresh access.
    const ongoing = this.ownerAccessRequest;
    if (!force && ongoing?.token === sessionToken) return ongoing.response;
    const cached = this._ownerAccess();
    if (cached && !force) {
      return of(cached);
    }
    const request = { token: sessionToken, response: undefined as unknown as Observable<SchoolAccess[]> };
    request.response = this.http
      .get<SchoolAccess[]>(`${this.apiUrl}/owner/staff/my-access`)
      .pipe(tap((access) => {
        if (this._token() !== sessionToken || this.ownerAccessRequest !== request) return;
        this._ownerAccess.set(access);
        if (this.schoolContextId() === null) {
          const initial = access.find(school => school.status === 'ACTIVE') ?? access[0];
          if (initial) this.selectSchoolContext(initial.schoolId);
        }
      }), finalize(() => {
        if (this.ownerAccessRequest === request) this.ownerAccessRequest = undefined;
      }), shareReplay({ bufferSize: 1, refCount: true }));
    this.ownerAccessRequest = request;
    return request.response;
  }

  getOwnerDashboard(schoolId: number): Observable<OwnerDashboard> {
    return this.http.get<OwnerDashboard>(`${this.apiUrl}/owner/dashboard`, {
      params: { schoolId },
    });
  }

  getPendingApprovals(): Observable<UserDto[]> {
    return this.http.get<UserDto[]>(`${this.apiUrl}/users/pending`);
  }

  approvePendingUser(userId: number, schoolId: number, role: ApprovalRole, classId?: number | null): Observable<UserDto> {
    return this.http.post<UserDto>(`${this.apiUrl}/users/${userId}/approve`, { schoolId, role, classId });
  }

  resendUserInvitation(userId: number): Observable<{ emailSent: boolean }> {
    return this.http.post<{ emailSent: boolean }>(`${this.apiUrl}/users/${userId}/invitation`, {});
  }

  refreshCurrentUser(): Observable<User> {
    const previousUser = this._user();
    const token = this._token();
    if (!token || !previousUser) {
      throw new Error('Aucune session à actualiser');
    }

    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    return this.http.get<UserDto>(`${this.apiUrl}/users/me`, { headers }).pipe(
      map((profile) => this.toUser(profile, profile.roles)),
      tap((user) => {
        this.setSession(token, user);
        if (user.approved && user.emailVerified && !user.mustChangePassword && previousUser.role !== user.role) {
          this.router.navigateByUrl(ROLE_HOME_ROUTE[user.role]);
        }
      })
    );
  }

  updateProfile(changes: ProfileUpdate): Observable<User> {
    const token = this._token();
    if (!token || !this._user()) {
      throw new Error('Aucune session à actualiser');
    }
    return this.http.put<UserDto>(`${this.apiUrl}/users/me`, changes).pipe(
      map((profile) => this.toUser(profile, profile.roles)),
      tap((user) => this.setSession(token, user))
    );
  }

  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.http.put<void>(`${this.apiUrl}/users/me/password`, { currentPassword, newPassword });
  }

  requestPasswordReset(email: string): Observable<PasswordResetRequestResponse> {
    return this.http.post<PasswordResetRequestResponse>(`${this.apiUrl}/auth/forgot-password`, { email });
  }

  resetPassword(token: string, newPassword: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/auth/reset-password`, { token, newPassword });
  }

  /** Confirme l'adresse (lien « verify ») ou active un compte créé par une école (lien « activate » + mot de passe). */
  verifyEmail(token: string, newPassword?: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/auth/verify-email`, newPassword ? { token, newPassword } : { token });
  }

  resendEmailVerification(): Observable<{ emailSent: boolean }> {
    return this.http.post<{ emailSent: boolean }>(`${this.apiUrl}/users/me/email-verification`, {});
  }

  requestEmailChange(email: string, currentPassword: string): Observable<{ emailSent: boolean }> {
    return this.http.post<{ emailSent: boolean }>(`${this.apiUrl}/users/me/email-change`, { email, currentPassword });
  }

  submitAccountRecovery(request: { schoolId: number; registrationNumber: string; firstName: string; lastName: string; newEmail: string; reason: string }): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/auth/account-recovery`, request);
  }
  completeAccountRecovery(token: string, newPassword: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/auth/account-recovery/complete`, { token, newPassword });
  }
  getAccountRecoveries(schoolId?: number | null): Observable<AccountRecoveryView[]> {
    return this.http.get<AccountRecoveryView[]>(`${this.apiUrl}/account-recovery`, schoolId ? { params: { schoolId } } : {});
  }
  decideAccountRecovery(id: number, approve: boolean, identityVerified: boolean, verificationNote: string): Observable<AccountRecoveryView> {
    return this.http.post<AccountRecoveryView>(`${this.apiUrl}/account-recovery/${id}/decision`, { approve, identityVerified, verificationNote });
  }
  resendAccountRecovery(id: number): Observable<AccountRecoveryView> {
    return this.http.post<AccountRecoveryView>(`${this.apiUrl}/account-recovery/${id}/resend`, {});
  }

  logout(): void {
    this.clearSession();
    this.router.navigateByUrl('/login');
  }

  private clearSession(): void {
    this.ownerAccessRequest = undefined;
    this._user.set(null);
    this._token.set(null);
    this._ownerAccess.set(null);
    this.ownedSchools.set([]);
    this.selectedSchoolId.set(null);
    for (const key of Object.keys(localStorage)) {
      if (key === 'fasoecole_owner_school' || key.startsWith('fasoecole_year_')) localStorage.removeItem(key);
    }
    localStorage.removeItem(STORAGE_KEY);
  }

  redirectAfterLogin(next?:'school-setup'): void {
    const role = this.role();
    if (!role) {
      this.router.navigateByUrl('/login');
      return;
    }
    const user = this._user();
    const ready=user?.approved && user.emailVerified === true && !user.mustChangePassword;
    this.router.navigateByUrl(ready ? next==='school-setup' ? (this.isSchoolOwner()?'/proprietaire/creer-ecole':'/ajouter-etablissement') : ROLE_HOME_ROUTE[role] : '/profil');
  }

  getToken(): string | null {
    return this._token();
  }

  private toUser(profile: UserDto, backendRoles: string[]): User {
    const effectiveRoles = backendRoles.length ? backendRoles : profile.requestedRole ? [profile.requestedRole] : [];
    const preferred = localStorage.getItem(SPACE_KEY + profile.id) as Role | null;
    const role = preferred && resolveRoles(effectiveRoles).includes(preferred) ? preferred : resolveRole(effectiveRoles);
    if (!role) {
      throw new Error(`Aucun rôle applicatif reconnu parmi : ${backendRoles.join(', ')}`);
    }

    return {
      id: profile.id,
      email: profile.email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      phone: profile.phone,
      role,
      approved: profile.approved,
      emailVerified: profile.emailVerified === true,
      passwordSet: profile.passwordSet,
      mustChangePassword: profile.mustChangePassword,
      ownerAccount: profile.ownerAccount,
      onboardingSteps: profile.onboardingSteps,
      invitationDeliveryStatus: profile.invitationDeliveryStatus,
      requestedSchoolId: profile.requestedSchoolId,
      requestedSchoolName: profile.requestedSchoolName,
      requestedSchoolType: profile.requestedSchoolType,
      schoolIdentifier: profile.schoolIdentifier,
      identifierReview: profile.identifierReview,
      childRegistrationNumbers: profile.childRegistrationNumbers ?? [],
      childReview: profile.childReview ?? [],
      requestedRole: profile.requestedRole,
      rawRoles: effectiveRoles,
    };
  }

  private loadProfile(loginResponse: LoginResponse, headers: HttpHeaders): Observable<User> {
    return this.http.get<UserDto>(`${this.apiUrl}/users/me`, { headers }).pipe(
      map((profile) => this.toUser(profile, loginResponse.roles)),
      tap((user) => this.setSession(loginResponse.token, user))
    );
  }

  private setSession(token: string, user: User): void {
    if (this._token() !== token || this._user()?.id !== user.id) {
      this.ownerAccessRequest = undefined;
      this._ownerAccess.set(null);
      this.ownedSchools.set([]);
    }
    this._token.set(token);
    this._user.set(user);
    localStorage.setItem(SPACE_KEY + user.id, user.role);
    const payload: StoredSession = { token, user };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }

  private restoreSession(): StoredSession | null {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      const session = JSON.parse(raw) as StoredSession;
      const available = resolveRoles(session.user.rawRoles ?? []);
      const preferred = localStorage.getItem(SPACE_KEY + session.user.id) as Role | null;
      const role = preferred && available.includes(preferred) ? preferred
        : available.includes(session.user.role) ? session.user.role : available[0];
      if (!role) return null;
      return {
        ...session,
        user: {
          ...session.user,
          role,
          approved: session.user.approved ?? true,
          requestedSchoolId: session.user.requestedSchoolId ?? null,
          requestedSchoolName: session.user.requestedSchoolName ?? null,
          requestedSchoolType: session.user.requestedSchoolType ?? null,
          requestedRole: session.user.requestedRole ?? null,
        },
      };
    } catch {
      return null;
    }
  }
}
