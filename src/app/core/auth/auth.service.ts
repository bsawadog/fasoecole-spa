import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, defer, map, switchMap, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { LoginRequest, LoginResponse, ROLE_HOME_ROUTE, User, UserDto, resolveRole } from '../models';

const STORAGE_KEY = 'fasoecole_auth';

interface StoredSession {
  token: string;
  user: User;
}

export interface PasswordResetRequestResponse {
  message: string;
}

export interface RegistrationRequest {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  schoolId: number;
  requestedRole: ApprovalRole;
}

export interface RegistrationSchool {
  id: number;
  name: string;
  type: string;
}

export type ApprovalRole = 'TEACHER' | 'PARENT' | 'STUDENT';

export interface OwnerDashboard {
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
  attendanceRecorded: number;
  presentToday: number;
  absentToday: number;
  lateToday: number;
  excusedToday: number;
  validatedReportCards: number;
  schoolAverage: number | null;
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

  register(request: RegistrationRequest): Observable<User> {
    return defer(() => {
      this.clearSession();
      return this.http.post<LoginResponse>(`${this.apiUrl}/auth/register`, request).pipe(
        switchMap((loginResponse) => {
          const headers = new HttpHeaders({ Authorization: `Bearer ${loginResponse.token}` });
          return this.loadProfile(loginResponse, headers);
        })
      );
    });
  }

  getRegistrationSchools(): Observable<RegistrationSchool[]> {
    return this.http.get<RegistrationSchool[]>(`${this.apiUrl}/schools/registration-options`);
  }

  getOwnedSchools(ownerId: number): Observable<RegistrationSchool[]> {
    return this.http.get<RegistrationSchool[]>(`${this.apiUrl}/schools/by-owner/${ownerId}`);
  }

  getOwnerDashboard(schoolId: number): Observable<OwnerDashboard> {
    return this.http.get<OwnerDashboard>(`${this.apiUrl}/owner/dashboard`, {
      params: { schoolId },
    });
  }

  getPendingApprovals(): Observable<UserDto[]> {
    return this.http.get<UserDto[]>(`${this.apiUrl}/users/pending`);
  }

  approvePendingUser(userId: number, schoolId: number, role: ApprovalRole): Observable<UserDto> {
    return this.http.post<UserDto>(`${this.apiUrl}/users/${userId}/approve`, { schoolId, role });
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
        if (!previousUser.approved && user.approved && previousUser.role !== user.role) {
          this.router.navigateByUrl(ROLE_HOME_ROUTE[user.role]);
        }
      })
    );
  }

  requestPasswordReset(email: string): Observable<PasswordResetRequestResponse> {
    return this.http.post<PasswordResetRequestResponse>(`${this.apiUrl}/auth/forgot-password`, { email });
  }

  resetPassword(token: string, newPassword: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/auth/reset-password`, { token, newPassword });
  }

  logout(): void {
    this.clearSession();
    this.router.navigateByUrl('/login');
  }

  private clearSession(): void {
    this._user.set(null);
    this._token.set(null);
    localStorage.removeItem(STORAGE_KEY);
  }

  redirectAfterLogin(): void {
    const role = this.role();
    if (!role) {
      this.router.navigateByUrl('/login');
      return;
    }
    this.router.navigateByUrl(ROLE_HOME_ROUTE[role]);
  }

  getToken(): string | null {
    return this._token();
  }

  private toUser(profile: UserDto, backendRoles: string[]): User {
    const effectiveRoles = backendRoles.length ? backendRoles : profile.requestedRole ? [profile.requestedRole] : [];
    const role = resolveRole(effectiveRoles);
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
      requestedSchoolId: profile.requestedSchoolId,
      requestedSchoolName: profile.requestedSchoolName,
      requestedSchoolType: profile.requestedSchoolType,
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
    this._token.set(token);
    this._user.set(user);
    const payload: StoredSession = { token, user };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }

  private restoreSession(): StoredSession | null {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      const session = JSON.parse(raw) as StoredSession;
      return {
        ...session,
        user: {
          ...session.user,
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
