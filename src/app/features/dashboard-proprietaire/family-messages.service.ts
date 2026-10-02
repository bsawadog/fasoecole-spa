import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable, forkJoin, map, of, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ConversationRecipient, ConversationSummary, ConversationThread, NewConversationPayload } from '../../shared/self-space/self-space.service';

export interface FamilyInboxSummary {
  pendingAbsenceReports: number;
  unreadMessages: number;
}

@Injectable({ providedIn: 'root' })
export class OwnerFamilyMessagesService {
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.apiUrl}/owner/family`;
  private readonly conversationApi = `${environment.apiUrl}/conversations`;

  readonly unreadCount = signal(0);

  summary(schoolId: number): Observable<FamilyInboxSummary> {
    return this.http.get<FamilyInboxSummary>(`${this.api}/schools/${schoolId}/summary`);
  }

  conversations(schoolId: number): Observable<ConversationSummary[]> {
    return this.http.get<ConversationSummary[]>(this.conversationApi, { params: { schoolId } });
  }

  recipients(schoolId: number): Observable<ConversationRecipient[]> {
    return this.http.get<ConversationRecipient[]>(`${this.conversationApi}/recipients`, { params: { schoolId } });
  }

  start(payload: NewConversationPayload): Observable<ConversationThread> {
    return this.http.post<ConversationThread>(this.conversationApi, payload);
  }

  conversation(conversationId: number): Observable<ConversationThread> {
    return this.http.get<ConversationThread>(`${this.conversationApi}/${conversationId}`);
  }

  reply(conversationId: number, content: string): Observable<ConversationThread> {
    return this.http.post<ConversationThread>(`${this.conversationApi}/${conversationId}/messages`, { content });
  }

  refreshUnreadCount(schoolIds: number[]): Observable<number> {
    if (!schoolIds.length) {
      this.unreadCount.set(0);
      return of(0);
    }
    return forkJoin(schoolIds.map((schoolId) => this.summary(schoolId))).pipe(
      map((summaries) => summaries.reduce((total, summary) => total + summary.unreadMessages, 0)),
      tap((count) => this.unreadCount.set(count)),
    );
  }
}
