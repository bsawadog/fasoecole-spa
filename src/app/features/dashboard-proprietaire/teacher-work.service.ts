import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface TeacherCard {
  employeeNumber?: string;
  userId?: number;
  emailVerified?: boolean;
  invitationDeliveryStatus?: string | null;
  id: number;
  schoolId: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  specialty: string | null;
  subjects: string[];
  activeInClass: boolean | null;
  classCount: number;
}

export interface TeacherSlot {
  id: number;
  classId: number;
  className: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface TeacherSession {
  slotId: number;
  date: string;
  classId: number;
  className: string;
  startTime: string;
  endTime: string;
  status: 'PENDING' | 'PRESENT' | 'ABSENT';
  hours: number;
}

export interface TeacherMonth {
  plannedHours: number;
  workedHours: number;
  absenceHours: number;
  extraHours: number;
  amountDue: number;
  paid: number;
  remaining: number;
  perClass: {
    classId: number;
    className: string;
    plannedHours: number;
    workedHours: number;
    absenceHours: number;
    extraHours: number;
  }[];
  sessions: TeacherSession[];
  extras: { id: number; classId: number; className: string; date: string; hours: number; description: string | null }[];
  payments: { id: number; date: string; amount: number; reference: string | null }[];
}

export interface TeacherDetail {
  teacher: TeacherCard;
  rateType: 'HOURLY' | 'MONTHLY' | 'FIXED_MONTHLY' | null;
  rate: number | null;
  schedule: TeacherSlot[];
  month: TeacherMonth;
}

@Injectable({ providedIn: 'root' })
export class TeacherWorkService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/teacher-work`;

  teachersByClass(classId: number): Observable<TeacherCard[]> {
    return this.http.get<TeacherCard[]>(`${this.url}/classes/${classId}/teachers`);
  }

  candidatesByClass(classId: number): Observable<TeacherCard[]> {
    return this.http.get<TeacherCard[]>(`${this.url}/classes/${classId}/candidates`);
  }

  teachersBySchool(schoolId: number): Observable<TeacherCard[]> {
    return this.http.get<TeacherCard[]>(`${this.url}/schools/${schoolId}/teachers`);
  }

  setClassTeacherActive(classId: number, teacherId: number, active: boolean): Observable<TeacherCard> {
    const action = active ? 'reactivate' : 'deactivate';
    return this.http.post<TeacherCard>(`${this.url}/classes/${classId}/teachers/${teacherId}/${action}`, {});
  }

  createTeacher(classId: number, payload: {
    firstName: string; lastName: string; email: string; password?: string; phone: string | null;
    employeeNumber?: string | null; specialty: string | null; hireDate: string | null; monthlySalary?: number | null; subjectId: number;
  }): Observable<TeacherCard> {
    return this.http.post<TeacherCard>(`${this.url}/classes/${classId}/teachers`, payload);
  }

  assignTeacher(classId: number, teacherId: number, subjectId: number): Observable<TeacherCard> {
    return this.http.post<TeacherCard>(`${this.url}/classes/${classId}/assignments`, { teacherId, subjectId });
  }

  detail(teacherId: number, month: string): Observable<TeacherDetail> {
    return this.http.get<TeacherDetail>(`${this.url}/teachers/${teacherId}`, { params: { month } });
  }

  sendSummary(teacherId: number, month: string): Observable<void> {
    return this.http.post<void>(`${this.url}/teachers/${teacherId}/send-summary`, {}, { params: { month } });
  }

  setRate(teacherId: number, payload: { type: 'HOURLY' | 'MONTHLY' | 'FIXED_MONTHLY'; amount: number; effectiveFrom: string }): Observable<void> {
    return this.http.post<void>(`${this.url}/teachers/${teacherId}/rates`, payload);
  }

  addSlot(teacherId: number, payload: { classId: number; dayOfWeek: number; startTime: string;
    endTime: string; effectiveFrom: string }): Observable<void> {
    return this.http.post<void>(`${this.url}/teachers/${teacherId}/slots`, payload);
  }

  removeSlot(teacherId: number, slotId: number): Observable<void> {
    return this.http.delete<void>(`${this.url}/teachers/${teacherId}/slots/${slotId}`);
  }

  pointSession(teacherId: number, payload: { slotId: number; date: string;
    status: 'PRESENT' | 'ABSENT' }): Observable<void> {
    return this.http.put<void>(`${this.url}/teachers/${teacherId}/sessions`, payload);
  }

  addExtra(teacherId: number, payload: { classId: number; date: string; hours: number;
    description: string }): Observable<void> {
    return this.http.post<void>(`${this.url}/teachers/${teacherId}/extras`, payload);
  }

  removeExtra(teacherId: number, extraId: number): Observable<void> {
    return this.http.delete<void>(`${this.url}/teachers/${teacherId}/extras/${extraId}`);
  }

  addPayment(teacherId: number, payload: { month: string; date: string; amount: number;
    reference: string }): Observable<void> {
    return this.http.post<void>(`${this.url}/teachers/${teacherId}/payments`, payload);
  }

  removePayment(teacherId: number, paymentId: number): Observable<void> {
    return this.http.delete<void>(`${this.url}/teachers/${teacherId}/payments/${paymentId}`);
  }
}
