import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';

export interface SchoolAppointment {
  id: number; schoolId: number; schoolName: string; organizerName: string; recipientName: string;
  proposedAt: string; reason: string; status: string; response: string | null; mine: boolean;
}
export interface AppointmentRecipient { userId: number; fullName: string; role: string; }
@Injectable({ providedIn: 'root' })
export class AppointmentsService {
  private readonly http = inject(HttpClient);
  private readonly url = environment.apiUrl;
  private schoolUrl(id: number) { return `${this.url}/owner/appointments/schools/${id}`; }
  sent(id: number) { return this.http.get<SchoolAppointment[]>(this.schoolUrl(id)); }
  received() { return this.http.get<SchoolAppointment[]>(`${this.url}/me/appointments`); }
  recipients(id: number) { return this.http.get<AppointmentRecipient[]>(`${this.schoolUrl(id)}/recipients`); }
  create(id: number, payload: { recipientUserId: number; proposedAt: string; reason: string }) { return this.http.post<SchoolAppointment>(this.schoolUrl(id), payload); }
  cancel(schoolId: number, id: number) { return this.http.post<void>(`${this.schoolUrl(schoolId)}/${id}/cancel`, {}); }
  decide(id: number, status: 'ACCEPTED' | 'REJECTED', response: string) { return this.http.post<void>(`${this.url}/me/appointments/${id}/decision`, { status, response }); }
}
