import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApprovalRole } from './auth.service';

export type SchoolAccessStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'AUTO_APPROVED' | 'REVOKED';

export interface SchoolAccessRequest {
  id: number;
  userId: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  schoolId: number;
  schoolName: string;
  schoolType: string;
  requestedRole: ApprovalRole;
  status: SchoolAccessStatus;
  createdAt: string;
  decidedAt: string | null;
  /** Accès parent : enfants inscrits dans l'établissement. */
  children?: string[];
  schoolIdentifier?: string | null;
  identifierReview?: string | null;
  childRegistrationNumbers?: string[];
  childReview?: string[];
}

/** Demandes d'accès à un établissement supplémentaire (enseignants, parents, élèves). */
@Injectable({ providedIn: 'root' })
export class SchoolAccessService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  mine(): Observable<SchoolAccessRequest[]> {
    return this.http.get<SchoolAccessRequest[]>(`${this.apiUrl}/users/me/school-requests`);
  }

  request(schoolId: number, requestedRole: ApprovalRole, childRegistrationNumbers?: string[], schoolIdentifier?: string): Observable<SchoolAccessRequest> {
    return this.http.post<SchoolAccessRequest>(`${this.apiUrl}/users/me/school-requests`, { schoolId, requestedRole, childRegistrationNumbers, schoolIdentifier });
  }

  cancel(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/users/me/school-requests/${id}`);
  }

  pending(): Observable<SchoolAccessRequest[]> {
    return this.http.get<SchoolAccessRequest[]>(`${this.apiUrl}/school-access-requests/pending`);
  }

  approve(id: number, classId?: number | null): Observable<SchoolAccessRequest> {
    return this.http.post<SchoolAccessRequest>(`${this.apiUrl}/school-access-requests/${id}/approve`, { classId });
  }

  reject(id: number): Observable<SchoolAccessRequest> {
    return this.http.post<SchoolAccessRequest>(`${this.apiUrl}/school-access-requests/${id}/reject`, {});
  }

  /** Valide un accès accordé automatiquement par le système. */
  confirm(id: number): Observable<SchoolAccessRequest> {
    return this.http.post<SchoolAccessRequest>(`${this.apiUrl}/school-access-requests/${id}/confirm`, {});
  }

  /** Retire un accès accordé automatiquement par le système. */
  revoke(id: number): Observable<SchoolAccessRequest> {
    return this.http.post<SchoolAccessRequest>(`${this.apiUrl}/school-access-requests/${id}/revoke`, {});
  }
}
