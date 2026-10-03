import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

export type PostKind = 'ANNOUNCEMENT' | 'HOMEWORK' | 'DOCUMENT';
export interface PortalFile { id: number; filename: string; sizeBytes: number; }
export interface PortalPost { id: number; kind: PostKind; classId: number | null; className: string | null; studentId: number | null; title: string; content: string; dueDate: string | null; createdAt: string; files: PortalFile[]; mine: boolean; }
export interface ParentAppointment { id: number; studentId: number; studentName: string; parentName: string; teacherName: string; proposedAt: string; reason: string; status: string; response: string | null; }
export interface ParentPayment { id: number; feeName: string; amount: number; paymentDate: string; method: string; reference: string | null; }
export interface ParentEvaluation { id: number; title: string; subjectName: string; type: string; date: string; }
export const APPOINTMENT_LABELS: Record<string, string> = { PENDING: 'En attente', ACCEPTED: 'Confirmé', REJECTED: 'Refusé', CANCELLED: 'Annulé' };
export const POST_LABELS: Record<PostKind, string> = { ANNOUNCEMENT: 'Annonce', HOMEWORK: 'Devoir', DOCUMENT: 'Document' };

@Injectable({ providedIn: 'root' })
export class ParentPortalService {
  private readonly http = inject(HttpClient);
  private readonly url = environment.apiUrl;
  private studentUrl(id: number) { return `${this.url}/me/parent-portal/students/${id}`; }
  private schoolUrl(id: number) { return `${this.url}/owner/parent-portal/schools/${id}`; }
  private teacherUrl(id: number) { return `${this.url}/me/teacher/classes/${id}/portal`; }
  teacherPosts(classId: number, kind: PostKind) { return this.http.get<PortalPost[]>(`${this.teacherUrl(classId)}/posts`, { params: { kind } }); }
  teacherPublish(classId: number, payload: { kind: PostKind; title: string; content: string; dueDate: string | null }, files: File[]) {
    const body = new FormData();
    body.append('request', new Blob([JSON.stringify({ ...payload, classId, studentId: null })], { type: 'application/json' }));
    files.forEach(file => body.append('files', file, file.name));
    return this.http.post<PortalPost>(`${this.teacherUrl(classId)}/posts`, body);
  }
  teacherDelete(classId: number, id: number) { return this.http.delete<void>(`${this.teacherUrl(classId)}/posts/${id}`); }
  teacherAppointments(classId: number) { return this.http.get<ParentAppointment[]>(`${this.teacherUrl(classId)}/appointments`); }
  teacherDecide(classId: number, id: number, status: 'ACCEPTED' | 'REJECTED', response: string) { return this.http.post<void>(`${this.teacherUrl(classId)}/appointments/${id}/decision`, { status, response }); }
  posts(studentId: number, kind: PostKind) { return this.http.get<PortalPost[]>(`${this.studentUrl(studentId)}/posts`, { params: { kind } }); }
  payments(studentId: number) { return this.http.get<ParentPayment[]>(`${this.studentUrl(studentId)}/payments`); }
  evaluations(studentId: number) { return this.http.get<ParentEvaluation[]>(`${this.studentUrl(studentId)}/evaluations`); }
  appointments(studentId: number) { return this.http.get<ParentAppointment[]>(`${this.studentUrl(studentId)}/appointments`); }
  request(studentId: number, payload: { teacherUserId: number | null; proposedAt: string; reason: string }) { return this.http.post<ParentAppointment>(`${this.studentUrl(studentId)}/appointments`, payload); }
  cancel(studentId: number, id: number) { return this.http.post<void>(`${this.studentUrl(studentId)}/appointments/${id}/cancel`, {}); }
  schoolPosts(schoolId: number) { return this.http.get<PortalPost[]>(`${this.schoolUrl(schoolId)}/posts`); }
  schoolAppointments(schoolId: number) { return this.http.get<ParentAppointment[]>(`${this.schoolUrl(schoolId)}/appointments`); }
  publish(schoolId: number, payload: { kind: PostKind; classId: number | null; studentId: number | null; title: string; content: string; dueDate: string | null }, files: File[]) {
    const body = new FormData();
    body.append('request', new Blob([JSON.stringify(payload)], { type: 'application/json' }));
    files.forEach(file => body.append('files', file, file.name));
    return this.http.post<PortalPost>(`${this.schoolUrl(schoolId)}/posts`, body);
  }
  delete(schoolId: number, id: number) { return this.http.delete<void>(`${this.schoolUrl(schoolId)}/posts/${id}`); }
  decide(schoolId: number, id: number, status: 'ACCEPTED' | 'REJECTED', response: string) { return this.http.post<void>(`${this.schoolUrl(schoolId)}/appointments/${id}/decision`, { status, response }); }
  file(scope: 'student' | 'school' | 'teacher', scopeId: number, postId: number, fileId: number) {
    const url = scope === 'student' ? this.studentUrl(scopeId) : scope === 'teacher' ? this.teacherUrl(scopeId) : this.schoolUrl(scopeId);
    return this.http.get(`${url}/posts/${postId}/files/${fileId}`, { responseType: 'blob' });
  }
}
