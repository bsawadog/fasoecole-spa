import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { OwnerModule } from '../../core/auth';

export interface StaffMember {
  emailVerified?: boolean;
  invitationDeliveryStatus?: string | null;
  id: number;
  userId: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  jobTitle: string;
  monthlySalary?: number | null;
  modules: OwnerModule[];
  active: boolean;
  /** Compte utilisé uniquement comme personnel : le propriétaire peut modifier l'identité et le mot de passe. */
  managedAccount: boolean;
  createdAt: string;
}

export interface StaffPayload {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  jobTitle: string;
  monthlySalary?: number | null;
  modules: OwnerModule[];
}

export interface StaffCreated {
  staff: StaffMember;
  temporaryPassword: string | null;
  existingAccount: boolean;
  emailSent: boolean;
}

export interface StaffPasswordReset {
  temporaryPassword: string | null;
  emailSent: boolean;
}

@Injectable({ providedIn: 'root' })
export class StaffService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/owner/staff`;

  list(schoolId: number): Observable<StaffMember[]> {
    return this.http.get<StaffMember[]>(`${this.base}/schools/${schoolId}`);
  }

  create(schoolId: number, payload: StaffPayload): Observable<StaffCreated> {
    return this.http.post<StaffCreated>(`${this.base}/schools/${schoolId}`, payload);
  }

  update(staffId: number, payload: StaffPayload): Observable<StaffMember> {
    return this.http.put<StaffMember>(`${this.base}/${staffId}`, payload);
  }

  setActive(staffId: number, active: boolean): Observable<StaffMember> {
    return this.http.post<StaffMember>(`${this.base}/${staffId}/${active ? 'reactivate' : 'suspend'}`, {});
  }

  resetPassword(staffId: number): Observable<StaffPasswordReset> {
    return this.http.post<StaffPasswordReset>(`${this.base}/${staffId}/reset-password`, {});
  }

  remove(staffId: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${staffId}`);
  }
}
