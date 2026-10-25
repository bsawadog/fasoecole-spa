import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { AuthService, AccountRecoveryView } from '../core/auth/auth.service';
import { ErrorAlert } from './error-alert';
import { apiError } from './api-error';

@Component({
  selector: 'app-account-recovery-queue', standalone: true,
  imports: [FormsModule, DatePipe, RouterLink, ButtonModule, InputTextModule, ErrorAlert],
  template: `
    @if (visible()) {
      <section class="recovery-queue" aria-labelledby="recovery-queue-title">
        <h2 id="recovery-queue-title">Récupération des comptes apprenants {{ support() ? '— Support' : '' }}</h2>
        <p>Vérifiez l’identité indépendamment de la nouvelle adresse fournie : dossier scolaire, contact déjà enregistré et responsable légal pour un mineur. Aucun mot de passe ne doit être demandé.</p>
        <button pButton type="button" severity="secondary" variant="outlined" (click)="reload.update(n => n + 1)" [disabled]="loading() || busy()">Actualiser les récupérations</button>
        @if (error()) { <app-error-alert [message]="error()" (dismissed)="error.set(null)">{{ error() }}</app-error-alert> }
        @if (message()) { <p role="status">{{ message() }}</p> }
        @if (loading()) { <p>Chargement des demandes…</p> }
        @for (row of rows(); track row.id) {
          <article>
            <h3>{{ row.firstName }} {{ row.lastName }} — {{ row.registrationNumber }}</h3>
            <p>{{ row.schoolName }} · {{ row.createdAt | date:'dd/MM/yyyy HH:mm' }} · <strong>{{ statusLabel(row.status) }}</strong></p>
            <p>Nouvelle adresse demandée : <strong>{{ row.newEmail }}</strong></p>
            <p>Motif : {{ row.reason }}</p>
            <p>Écoles du compte : {{ row.affectedSchools.join(', ') }}</p>
            @if (row.studentId) { <a [routerLink]="[support() ? '/admin/eleves' : '/proprietaire/eleves', row.studentId]">Consulter le dossier pour vérifier l’identité</a> }
            @if (row.status === 'SUPPORT_REQUIRED' && !support()) {
              <p>Cette demande nécessite le support : le compte dépasse votre périmètre d’établissement. Elle est disponible dans la file de l’administration de la plateforme.</p>
            }
            @if (row.status === 'PENDING' || row.status === 'SUPPORT_REQUIRED') {
              <form #decisionForm="ngForm" (ngSubmit)="decisionForm.valid && decide(row, true)">
                <label>Vérifications effectuées ou motif du refus
                  <textarea pInputText name="note" [(ngModel)]="notes[row.id]" rows="3" minlength="10" maxlength="1000" required></textarea>
                </label>
                @if (support() || row.status === 'PENDING') {
                  <label class="check"><input type="checkbox" name="verified" [(ngModel)]="verified[row.id]" /> J’ai vérifié l’identité par les coordonnées et informations déjà connues de l’école.</label>
                  <button pButton type="submit" [disabled]="busy() || decisionForm.invalid || !verified[row.id]">Autoriser et envoyer le lien</button>
                }
                <button pButton type="button" severity="danger" variant="outlined" [disabled]="busy() || decisionForm.invalid" (click)="decide(row, false)">Refuser la demande</button>
              </form>
            }
            @if (row.status === 'APPROVED') {
              <p>{{ row.deliveryStatus === 'SENT' ? 'Lien envoyé à la nouvelle adresse.' : 'Le lien n’a pas pu être envoyé.' }} Expiration : {{ row.expiresAt | date:'dd/MM/yyyy HH:mm' }}. Le courriel actuel reste inchangé jusqu’à la confirmation.</p>
              @if (row.oldNotificationStatus === 'FAILED') { <p>La notification à l’ancienne adresse n’a pas pu être envoyée.</p> }
              <button pButton type="button" severity="secondary" variant="outlined" [disabled]="busy()" (click)="resend(row)">Renvoyer un nouveau lien</button>
              <form #cancelForm="ngForm" (ngSubmit)="cancelForm.valid && decide(row, false)">
                <label>Motif de l’annulation<textarea pInputText name="cancelNote" [(ngModel)]="notes[row.id]" rows="2" minlength="10" maxlength="1000" required></textarea></label>
                <button pButton type="submit" severity="danger" variant="outlined" [disabled]="busy() || cancelForm.invalid">Annuler la récupération et invalider le lien</button>
              </form>
            }
            @if (row.verificationNote) { <p>Décision : {{ row.verificationNote }} · {{ row.decidedAt | date:'dd/MM/yyyy HH:mm' }}</p> }
            @if (row.completedAt) { <p>Récupération terminée le {{ row.completedAt | date:'dd/MM/yyyy HH:mm' }}.</p> }
            <details><summary>Historique de la récupération</summary>
              @for (event of row.history; track $index) { <p>{{ event.createdAt | date:'dd/MM/yyyy HH:mm' }} · {{ event.actorId ? 'Compte #' + event.actorId : 'Formulaire public' }} · {{ event.details }}</p> }
            </details>
          </article>
        } @empty { @if (!loading()) { <p>Aucune demande de récupération.</p> } }
        <p>Les 100 demandes les plus récentes sont affichées. L’historique est conservé.</p>
      </section>
    }
  `,
  styles: [`:host{display:block}.recovery-queue{padding:1.25rem;margin:1.25rem 0;border:1px solid var(--p-content-border-color,#ddd);border-radius:1rem;background:var(--p-content-background,#fff)}article{margin-top:1rem;padding:1rem;border:1px solid var(--p-content-border-color,#ddd);border-radius:.75rem;overflow-wrap:anywhere}h3{margin-top:0}label{display:grid;gap:.5rem;margin:1rem 0}textarea{width:100%;box-sizing:border-box}label.check{display:flex;align-items:flex-start;gap:.5rem}button{margin:.25rem .5rem .25rem 0}`],
})
export class AccountRecoveryQueue {
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  readonly rows = signal<AccountRecoveryView[]>([]);
  readonly visible = signal(false);
  readonly support = signal(false);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly message = signal<string | null>(null);
  readonly reload = signal(0);
  notes: Record<number, string> = {};
  verified: Record<number, boolean> = {};
  constructor() {
    effect(onCleanup => {
      this.reload();
      const support = this.auth.user()?.rawRoles?.includes('SUPER_ADMIN') === true;
      const schoolId = this.auth.schoolContextId?.() ?? null;
      const owner = this.auth.ownerAccess?.()?.some(access => access.schoolId === schoolId && access.owner) === true;
      this.support.set(support); this.visible.set(support || owner); this.rows.set([]);
      if (!support && !owner) return;
      this.loading.set(true); this.error.set(null);
      const sub = this.auth.getAccountRecoveries(support ? null : schoolId).subscribe({
        next: rows => { this.rows.set(rows); this.loading.set(false); },
        error: err => { this.loading.set(false); this.error.set(apiError(err, 'Impossible de charger les récupérations.')); },
      });
      onCleanup(() => sub.unsubscribe());
    });
  }
  decide(row: AccountRecoveryView, approve: boolean): void {
    const note = this.notes[row.id]?.trim() ?? '';
    if (this.busy() || note.length < 10 || (approve && !this.verified[row.id])) return;
    this.busy.set(true); this.error.set(null); this.message.set(null);
    this.auth.decideAccountRecovery(row.id, approve, !!this.verified[row.id], note).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: updated => { this.update(updated); this.busy.set(false); this.message.set(updated.status === 'SUPPORT_REQUIRED' ? 'Demande orientée vers le support.' : updated.status === 'REJECTED' ? (row.status === 'APPROVED' ? 'Récupération annulée. Le lien ne peut plus être utilisé.' : 'Demande refusée.') : updated.deliveryStatus === 'SENT' ? 'Récupération autorisée et lien envoyé. Le compte reste inchangé jusqu’à sa confirmation.' : 'Récupération autorisée mais envoi échoué. Vous pouvez renvoyer le lien.'); },
      error: err => { this.busy.set(false); this.error.set(apiError(err, 'Impossible de traiter cette récupération.')); },
    });
  }
  resend(row: AccountRecoveryView): void {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(null); this.message.set(null);
    this.auth.resendAccountRecovery(row.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: updated => { this.update(updated); this.busy.set(false); this.message.set(updated.status === 'SUPPORT_REQUIRED' ? 'Une validation du support est nécessaire.' : updated.deliveryStatus === 'SENT' ? 'Nouveau lien envoyé. Le précédent est invalidé.' : 'L’envoi du nouveau lien a échoué. Réessayez plus tard.'); },
      error: err => { this.busy.set(false); this.error.set(apiError(err, 'Impossible de renvoyer le lien.')); },
    });
  }
  private update(row: AccountRecoveryView): void { this.rows.update(rows => rows.map(r => r.id === row.id ? row : r)); }
  statusLabel(status: AccountRecoveryView['status']): string {
    return ({ PENDING:'Identité à vérifier', SUPPORT_REQUIRED:'Validation du support nécessaire', APPROVED:'Lien en attente de confirmation', REJECTED:'Refusée', COMPLETED:'Terminée', SUPERSEDED:'Remplacée' })[status];
  }
}
