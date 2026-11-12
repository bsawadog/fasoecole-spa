import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { OfflineAttendanceService } from './offline-attendance.service';
import { PendingAction } from './action-outbox';
import { ConfirmationService } from '../confirmation/confirmation.service';

const FIELDS: Record<string, { label: string; type?: string; max?: number }> = {
  name: { label: 'Nom', max: 150 }, label: { label: 'Libellé', max: 150 },
  firstName: { label: 'Prénom', max: 100 }, lastName: { label: 'Nom de famille', max: 100 },
  email: { label: 'Courriel', max: 150 }, phone: { label: 'Téléphone', max: 30 },
  jobTitle: { label: 'Fonction', max: 80 }, employeeNumber: { label: 'Numéro d’employé', max: 50 },
  specialty: { label: 'Spécialité', max: 150 }, hireDate: { label: 'Date d’embauche', type: 'date' },
  monthlySalary: { label: 'Salaire mensuel', type: 'number' }, hourlyRate: { label: 'Taux horaire', type: 'number' },
  rateEffectiveFrom: { label: 'Date d’effet du tarif', type: 'date' },
  code: { label: 'Code', max: 40 }, location: { label: 'Emplacement', max: 150 },
  custodian: { label: 'Responsable', max: 150 }, unit: { label: 'Unité', max: 30 },
  amount: { label: 'Montant', type: 'number' }, quantity: { label: 'Quantité', type: 'number' },
  minimumQuantity: { label: 'Seuil minimum', type: 'number' },
  unitValue: { label: 'Valeur unitaire', type: 'number' }, unitCost: { label: 'Coût unitaire', type: 'number' },
  notes: { label: 'Remarques', max: 500 }, supplier: { label: 'Fournisseur', max: 150 },
  creditor: { label: 'Organisme', max: 150 }, recipient: { label: 'Destinataire', max: 150 },
  date: { label: 'Date', type: 'date' }, expenseDate: { label: 'Date de dépense', type: 'date' },
  dueDate: { label: 'Échéance', type: 'date' }, evalDate: { label: 'Date de l’évaluation', type: 'date' },
  periodStart: { label: 'Début de période', type: 'date' }, periodEnd: { label: 'Fin de période', type: 'date' },
  startMonth: { label: 'Premier mois', type: 'month' }, dueDay: { label: 'Jour d’échéance', type: 'number' },
  maxValue: { label: 'Barème', type: 'number' }, weight: { label: 'Poids', type: 'number' },
  title: { label: 'Titre', max: 160 }, description: { label: 'Description' }, action: { label: 'Mesures prises' },
  reason: { label: 'Motif' }, content: { label: 'Contenu' }, objectives: { label: 'Objectifs', max: 2000 },
  details: { label: 'Détails' }, dueOn: { label: 'Échéance', type: 'date' },
  nextWork: { label: 'Prochaine séance', max: 2000 }, author: { label: 'Auteur' }, reference: { label: 'Référence' },
  observedOn: { label: 'Date de l’observation', type: 'date' }, startsOn: { label: 'Date de début', type: 'date' },
  endsOn: { label: 'Date de fin', type: 'date' }, lessonOn: { label: 'Date de la séance', type: 'date' },
  remindOn: { label: 'Date du rappel', type: 'date' }, copies: { label: 'Nombre d’exemplaires', type: 'number' },
  sharedWithFamily: { label: 'Partager avec la famille', type: 'checkbox' }, shared: { label: 'Partager avec les familles', type: 'checkbox' },
};
@Component({
  selector: 'app-action-outbox', standalone: true, imports: [DatePipe],
  template: `
    @if (offline.enabled() && (offline.pendingActions().length || offline.lastActionSync())) {
      <section class="outbox" aria-label="File d’attente des actions">
        <h2>File d’attente des actions</h2>
        <p>Les ajouts ci-dessous sont conservés sur cet appareil. Ils seront enregistrés au retour d’Internet, après vérification par le serveur.</p>
        @for (item of offline.pendingActions(); track item.operationId) {
          <article>
            <strong>{{ item.label }}</strong> · {{ item.createdAt | date:'dd/MM/yyyy HH:mm' }}
            <p class="pending">{{ item.issue || (item.paused ? 'Modification en cours · envoi suspendu' : 'En attente de confirmation du serveur') }}</p>
            @if (editing() === item.operationId) {
              <form (submit)="$event.preventDefault(); save(item)">
                @for (field of fields(item); track field.key) {
                  <label>{{ field.label }}
                    @if (field.type === 'checkbox') {
                      <input type="checkbox" [checked]="values[field.key]" (change)="values[field.key] = $any($event.target).checked" />
                    } @else if (field.type) {
                      <input [type]="field.type" [attr.step]="field.type === 'number' ? 'any' : null" [value]="values[field.key] ?? ''" (input)="values[field.key] = $any($event.target).value" />
                    } @else {
                      <textarea [value]="values[field.key] ?? ''" [maxLength]="field.max ?? 4000" (input)="values[field.key] = $any($event.target).value" rows="3"></textarea>
                    }
                  </label>
                }
                <button type="submit" [disabled]="working() || offline.busy()">Conserver les corrections</button>
                <button type="button" (click)="close(item)" [disabled]="working()">Fermer sans modifier</button>
              </form>
            } @else {
              @for (field of fields(item); track field.key) {
                <p><strong>{{ field.label }} :</strong> {{ display(item, field.key) }}</p>
              }
              <div class="actions">
                <button type="button" [disabled]="working() || offline.busy() || item.attempted" (click)="edit(item)">Modifier</button>
                <button type="button" [disabled]="working() || offline.busy() || item.attempted" (click)="cancel(item)">Annuler cet ajout</button>
                <button type="button" [disabled]="working() || offline.busy() || !offline.online()" (click)="retry(item)">{{ item.paused ? 'Reprendre l’envoi' : 'Réessayer' }}</button>
              </div>
            }
            @if (item.attempted) { <p>Envoi déjà tenté. La modification et l’annulation attendent une confirmation ou un refus explicite du serveur.</p> }
          </article>
        }
        @if (offline.lastActionSync(); as confirmed) { <p role="status">Dernier ajout confirmé : {{ confirmed.label }} · {{ confirmed.at | date:'dd/MM/yyyy HH:mm' }}.</p> }
        @if (error()) { <p role="alert">{{ error() }}</p> }
      </section>
    }
  `,
  styles: [`:host{display:block}.outbox{margin:.75rem 0;padding:1rem 1.25rem;border:1px solid #f97316;border-radius:.75rem;background:var(--theme-surface,#fff)}h2{font-size:1rem;margin:0 0 .5rem}article{padding:1rem 0;border-top:1px solid var(--theme-border,#ddd)}p{margin:.5rem 0;white-space:pre-wrap;overflow-wrap:anywhere}.pending{color:light-dark(#b45309,#fb923c)}.actions{display:flex;gap:.5rem;flex-wrap:wrap}button{padding:.5rem .75rem;cursor:pointer}label{display:grid;gap:.3rem;margin:.75rem 0}textarea,input{max-width:100%;box-sizing:border-box;padding:.5rem}input[type=checkbox]{justify-self:start}`],
})
export class ActionOutboxPanel {
  readonly offline = inject(OfflineAttendanceService);
  private readonly confirmation = inject(ConfirmationService);
  readonly editing = signal<string | null>(null);
  readonly working = signal(false);
  readonly error = signal<string | null>(null);
  values: Record<string, unknown> = {};
  fields(item: PendingAction) { return Object.keys(item.payload && typeof item.payload === 'object' ? item.payload : {}).filter(key => FIELDS[key]).map(key => ({ key, ...FIELDS[key] })); }
  display(item: PendingAction, key: string): string {
    const value = (item.payload as Record<string, unknown>)[key];
    return typeof value === 'boolean' ? value ? 'Oui' : 'Non' : String(value ?? '—');
  }
  async edit(item: PendingAction): Promise<void> {
    this.working.set(true); this.error.set(null);
    try {
      const snapshot = await this.offline.editAction(item.operationId);
      this.values = structuredClone(snapshot.payload) as Record<string, unknown>; this.editing.set(item.operationId);
    } catch (err) { this.error.set(err instanceof Error ? err.message : 'Impossible d’ouvrir cet ajout.'); }
    finally { this.working.set(false); }
  }
  async close(item: PendingAction): Promise<void> { await this.run(() => this.offline.closeActionEditor(item.operationId)); }
  private async run(action: () => Promise<void>): Promise<void> {
    this.working.set(true); this.error.set(null);
    try { await action(); this.editing.set(null); }
    catch (err) { this.error.set(err instanceof Error ? err.message : 'Impossible de modifier la file. Votre ajout reste conservé.'); }
    finally { this.working.set(false); }
  }
  async save(item: PendingAction): Promise<void> {
    const payload = { ...this.values };
    for (const field of this.fields(item)) {
      if (field.type === 'number') payload[field.key] = payload[field.key] === '' || payload[field.key] == null ? null : Number(payload[field.key]);
      if (field.type === 'date' && !payload[field.key]) payload[field.key] = null;
    }
    await this.run(() => this.offline.updateAction(item.operationId, payload));
  }
  async cancel(item: PendingAction): Promise<void> {
    if (!await this.confirmation.confirm({ title: 'Annuler cet ajout ?', message: item.label, confirmLabel: 'Annuler l’ajout', destructive: true })) return;
    await this.run(() => this.offline.removeAction(item.operationId));
  }
  async retry(item: PendingAction): Promise<void> { await this.run(() => this.offline.retryAction(item.operationId)); }
}
