import { Component, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { OfflineAttendanceService } from './offline-attendance.service';

@Component({
  selector: 'app-message-outbox', standalone: true, imports: [DatePipe, RouterLink],
  template: `
    @if (showStatus() || offline.pendingMessages().length || offline.lastMessageSync()) {
    <section class="outbox" aria-label="File d’attente des messages">
    <strong>File d’attente des messages</strong>
    @if (!offline.enabled()) {
      <p role="status">Le mode hors connexion Internet est désactivé. Activez-le dans <a routerLink="/profil">Mon profil</a> pour conserver vos messages pendant une coupure.</p>
    } @else if (!offline.unlocked()) {
      <p role="status">La file est verrouillée. Retrouvez Internet pour afficher et synchroniser les messages conservés sur cet appareil.</p>
      @if (offline.online()) { <button type="button" [disabled]="offline.busy()" (click)="offline.unlock()">{{ offline.busy() ? 'Déverrouillage…' : 'Déverrouiller la file' }}</button> }
    } @else {
    @if (offline.pendingMessages().length) {
      <details>
        <summary>{{ offline.pendingMessages().length }} message(s) en attente de connexion Internet</summary>
        <p>Ils sont conservés chiffrés sur cet appareil. L’envoi reprend automatiquement avec Internet, tant que l’application reste ouverte avec le même compte et le même profil.</p>
        @for (message of offline.pendingMessages(); track message.operationId) {
          <article>
            <strong>{{ message.subject }}</strong> · {{ message.createdAt | date:'dd/MM/yyyy HH:mm' }}
            <p>{{ message.issue || 'En attente de confirmation du serveur.' }}</p>
            @if (message.issue) { <button type="button" [disabled]="offline.busy() || !offline.online()" (click)="retry(message.operationId)">Réessayer cet envoi</button> }
          </article>
        }
        @if (error()) { <p role="alert">{{ error() }}</p> }
        <button type="button" [disabled]="offline.busy() || !offline.online()" (click)="offline.synchronize()">Synchroniser les messages</button>
      </details>
    } @else if (showStatus()) { <p role="status">Aucun message en attente d’envoi.</p> }
    @if (offline.lastMessageSync()) { <small role="status">Dernier message confirmé par le serveur : {{ offline.lastMessageSync() | date:'HH:mm' }}.</small> }
    }
    </section>
    }
  `,
  styles: [`.outbox{margin:.75rem 0;padding:.85rem 1rem;border:1px solid var(--theme-control-border,#49738f);border-radius:.75rem;background:var(--theme-surface,#fff)}.outbox>strong{display:block;margin-bottom:.5rem}.outbox>small{display:block;margin-top:.5rem}summary{cursor:pointer;font-weight:600}article{padding:.6rem 0;border-top:1px solid var(--theme-border,#ddd)}p{margin:.4rem 0}button{padding:.5rem .75rem;cursor:pointer}`],
})
export class MessageOutboxPanel {
  readonly showStatus = input(false);
  readonly offline = inject(OfflineAttendanceService);
  readonly error = signal<string | null>(null);
  async retry(id: string): Promise<void> {
    this.error.set(null);
    try { await this.offline.retryMessage(id); }
    catch { this.error.set('Impossible de relancer cet envoi. Il est toujours conservé sur cet appareil.'); }
  }
}
