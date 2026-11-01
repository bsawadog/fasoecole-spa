import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { OfflineAttendanceService, PendingCall } from './offline-attendance.service';
import { ErrorAlert } from '../error-alert';
import { ConfirmationService } from '../confirmation/confirmation.service';
import { apiError, TeacherAttendanceItem } from '../self-space/self-space.service';
import { environment } from '../../../environments/environment';

@Component({ selector: 'app-offline-attendance', standalone: true, imports: [ButtonModule, DatePipe, ErrorAlert],
  template: `<section class="ss__card ss__body" aria-label="Présences hors connexion Internet">
    <details class="offline-pending">
      <summary>Hors connexion Internet · {{ offline.unlocked() ? offline.pending().length + ' envoi(s) en attente' : 'Saisies locales verrouillées' }} — {{ offline.busy() ? 'Synchronisation en cours…' : offline.issue() ? 'Synchronisation bloquée : afficher les détails' : 'Afficher les détails' }}</summary>
    @if (offline.enabled()) {
      <p role="status"><strong>{{ offline.online() ? 'Connexion Internet disponible' : 'Hors connexion Internet' }}</strong></p>
      <p>Les envois se synchronisent automatiquement au retour de la connexion Internet, tant que l’application est ouverte. Un envoi en conflit nécessite votre vérification.</p>
      @if (!offline.unlocked()) { <p>Reconnectez-vous avec Internet pour retrouver vos saisies locales. Elles restent chiffrées.</p> }
      @if (offline.lastSync()) { <p>Dernier envoi confirmé : {{ offline.lastSync() | date:'dd/MM/yyyy HH:mm' }}</p> }
      <button pButton type="button" [disabled]="offline.busy()" (click)="offline.synchronize()">{{ offline.busy() ? 'Synchronisation…' : 'Synchroniser' }}</button>
      @for (call of offline.pending(); track call.operationId) {
        <p>{{ call.schoolName }} · {{ call.className }} · Appel du {{ call.date | date:'dd/MM/yyyy' }} · {{ call.entries.length }} présence(s)</p>
        @if (call.issue) { <p>{{ call.issue }}</p><button pButton type="button" [disabled]="!offline.online() || offline.busy()" (click)="review(call)">Vérifier cet appel</button> }
      }
    }
    @if (offline.issue()) { <p role="status">{{ offline.issue() }}</p> }
    @if (error()) { <app-error-alert [message]="error()" (dismissed)="error.set(null)" /> }
    @if (reviewing(); as call) {
      <section aria-label="Comparer les présences"><h3>Vérifier l’appel du {{ call.date | date:'dd/MM/yyyy' }}</h3>
        <p>Comparez les informations actuelles avec vos choix. Aucun remplacement sans votre confirmation.</p>
        <div class="ss__table-wrap"><table class="ss__table"><thead><tr><th>Élève</th><th>Actuellement enregistré</th><th>Votre saisie</th></tr></thead><tbody>
          @for (entry of call.entries; track entry.studentId) {
            <tr><td>{{ name(call, entry.studentId) }}</td><td>{{ status(current(entry.studentId)?.status) }} · {{ current(entry.studentId)?.justification || 'Sans motif' }}</td><td>{{ status(entry.status) }} · {{ entry.justification || 'Sans motif' }}</td></tr>
          }
        </tbody></table></div>
        <div class="ss__actions">
          <button pButton type="button" [disabled]="offline.busy()" (click)="retry(call)">Confirmer et envoyer mes choix</button>
          <button pButton severity="secondary" type="button" (click)="reviewing.set(null)">Fermer sans modifier</button>
          <button pButton severity="danger" type="button" [disabled]="offline.busy()" (click)="discard(call)">Supprimer cette saisie locale</button>
        </div>
      </section>
    }
    </details>
  </section>`, styles: [`
    .ss__card.ss__body { padding: 1rem 1.25rem; }
    .offline-pending > summary { cursor: pointer; padding: .5rem; font-weight: 600; }
    .offline-pending > summary:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
  `] })
export class OfflineAttendancePanel {
  readonly offline = inject(OfflineAttendanceService);
  private readonly http = inject(HttpClient);
  private readonly confirmation = inject(ConfirmationService);
  readonly error = signal<string | null>(null);
  readonly reviewing = signal<PendingCall | null>(null);
  readonly rows = signal<TeacherAttendanceItem[]>([]);
  current(id: number) { return this.rows().find(row => row.studentId === id); }
  name(call: PendingCall, id: number) { return this.current(id)?.fullName ?? this.offline.snapshot(call.schoolId, call.classId, call.date)?.rows.find(row => row.studentId === id)?.fullName ?? `Élève ${id}`; }
  status(value?: string | null) { return ({ PRESENT: 'Présent', ABSENT: 'Absent', LATE: 'En retard', EXCUSED: 'Absence excusée' } as Record<string, string>)[value ?? ''] ?? 'Non renseigné'; }
  async review(call: PendingCall) {
    try {
      this.rows.set(await firstValueFrom(this.http.get<TeacherAttendanceItem[]>(`${environment.apiUrl}/me/teacher/classes/${call.classId}/attendance`, { params: { date: call.date } })));
      this.reviewing.set(call);
    } catch (err) { this.error.set(apiError(err, 'Impossible de vérifier cet appel. Vos saisies sont conservées.')); }
  }
  async retry(call: PendingCall) {
    try { await this.offline.retryAfterReview(call.operationId, this.rows()); this.reviewing.set(null); }
    catch (err) { this.error.set(apiError(err, 'Impossible de renvoyer cet appel.')); }
  }
  async discard(call: PendingCall) {
    if (!await this.confirmation.confirm({ title: 'Supprimer la saisie locale', message: 'Cette saisie non synchronisée sera définitivement supprimée de cet appareil. Les données du serveur ne seront pas modifiées.', confirmLabel: 'Supprimer', destructive: true })) return;
    try { await this.offline.removeAfterReview(call.operationId, this.rows()); this.reviewing.set(null); }
    catch (err) { this.error.set(apiError(err, 'Impossible de supprimer cette saisie.')); }
  }
}
