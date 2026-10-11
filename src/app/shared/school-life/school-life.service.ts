import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

export type LifeModule = 'calendrier' | 'discipline' | 'demandes-administratives' | 'bibliotheque' | 'suivi-devoirs';
export type LifeScope = 'schools' | 'classes' | 'students';
export interface StudentChoice { id: number; name: string; classId: number; className: string; }
export interface CalendarEvent { id: number; classId: number | null; className: string | null; title: string; description: string; kind: string; startsOn: string; endsOn: string; }
export interface Observation { id: number; studentId: number; studentName: string; kind: string; observedOn: string; description: string; action: string; sharedWithFamily: boolean; resolved: boolean; }
export interface DocumentRequest { id: number; studentId: number; studentName: string; kind: string; reason: string; status: string; response: string; createdAt: string; mine: boolean; }
export interface LibraryBook { id: number; title: string; author: string; reference: string; copies: number; available: number; }
export interface LibraryLoan { id: number; bookId: number; title: string; studentId: number; studentName: string; borrowedOn: string; dueOn: string; returnedOn: string | null; }
export interface HomeworkProgress { postId: number; studentId: number; studentName: string; title: string; content: string; dueOn: string; status: string; feedback: string; editable: boolean; }
export interface LifeOverview { students: StudentChoice[]; events: CalendarEvent[]; observations: Observation[]; requests: DocumentRequest[]; books: LibraryBook[]; loans: LibraryLoan[]; homeworks: HomeworkProgress[]; }

export const LIFE_TITLES: Record<LifeModule, string> = {
  calendrier: 'Calendrier scolaire', discipline: 'Discipline et vie scolaire',
  'demandes-administratives': 'Demandes administratives', bibliotheque: 'Bibliothèque', 'suivi-devoirs': 'Suivi des devoirs',
};
export const LIFE_LABELS: Record<string, string> = {
  EXAM: 'Examen', HOLIDAY: 'Vacances', MEETING: 'Réunion', EVENT: 'Événement',
  INCIDENT: 'Incident', POSITIVE: 'Observation positive', SCHOOL_CERTIFICATE: 'Certificat de scolarité',
  ATTESTATION: 'Attestation', OTHER: 'Autre document', PENDING: 'En attente', IN_PROGRESS: 'En cours',
  READY: 'Prêt à retirer', REJECTED: 'Refusé', CANCELLED: 'Annulé', TO_DO: 'À faire', SUBMITTED: 'Remis', CORRECTED: 'Corrigé',
};

@Injectable({ providedIn: 'root' })
export class SchoolLifeService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/school-life`;
  overview(scope: LifeScope, id: number, module: LifeModule) {
    const modules: Record<LifeModule, string> = { calendrier: 'CALENDAR', discipline: 'DISCIPLINE',
      'demandes-administratives': 'REQUESTS', bibliotheque: 'LIBRARY', 'suivi-devoirs': 'HOMEWORK' };
    return this.http.get<LifeOverview>(`${this.base}/${scope}/${id}`, { params: { module: modules[module] } });
  }
  create(scope: LifeScope, id: number, resource: 'events' | 'observations' | 'requests' | 'books' | 'loans', body: unknown) {
    return this.http.post<void>(`${this.base}/${scope}/${id}/${resource}`, body);
  }
  update(scope: LifeScope, id: number, resource: string, body: unknown) {
    return this.http.put<void>(`${this.base}/${scope}/${id}/${resource}`, body);
  }
  action(scope: LifeScope, id: number, resource: string) { return this.http.post<void>(`${this.base}/${scope}/${id}/${resource}`, {}); }
  removeEvent(id: number, eventId: number) { return this.http.delete<void>(`${this.base}/schools/${id}/events/${eventId}`); }
}
