import { ErrorAlert } from '../error-alert';
import { Component, DestroyRef, inject, input, OnChanges, SimpleChanges, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { TextareaModule } from 'primeng/textarea';
import { SelectField, SelectOption } from '../ui/select-field';
import { apiError } from '../self-space/self-space.service';
import { HomeworkProgress, LIFE_LABELS, SchoolLifeService } from './school-life.service';

@Component({
  selector: 'app-homework-tracking', standalone: true,
  imports: [ErrorAlert, DatePipe, FormsModule, ButtonModule, MessageModule, TextareaModule, SelectField, SelectOption],
  styleUrl: '../self-space/self-space.scss',
  template: `
    <section aria-label="Suivi des devoirs">
      <h2>Remises et corrections</h2>
      <p class="ss__muted">Le professeur renseigne la remise et la correction en classe. Les parents et les élèves consultent le même suivi.</p>
      @if (error()) { <app-error-alert [message]="error()" (dismissed)="error.set(null)">{{ error() }}</app-error-alert> }
      @if (success()) { <p-message severity="success" role="status">{{ success() }}</p-message> }
      <button pButton type="button" severity="secondary" variant="outlined" (click)="load()" [disabled]="loading() || saving()">Actualiser le suivi</button>
      @if (loading()) { <p role="status">Chargement du suivi…</p> }
      @for (item of rows(); track key(item)) {
        <article class="ss__card ss__body">
          <h3>{{ item.title }} · {{ item.studentName }}</h3>
          <p>À remettre le {{ item.dueOn | date:'dd/MM/yyyy' }}</p>
          <span class="ss__chip">{{ labels[item.status] }}</span>
          @if (item.feedback) { <p style="white-space:pre-wrap;overflow-wrap:anywhere">Retour : {{ item.feedback }}</p> }
          @if (item.editable && scope() === 'classes') {
            <label class="ss__field">Statut<app-select-field [name]="'status-' + key(item)" [(ngModel)]="statuses[key(item)]" ariaLabel="Statut" [disabled]="saving()">
              <app-select-option value="TO_DO" label="À faire" /><app-select-option value="SUBMITTED" label="Remis" /><app-select-option value="CORRECTED" label="Corrigé" />
            </app-select-field></label>
            <label class="ss__field">Retour de correction<textarea pTextarea [name]="'feedback-' + key(item)" [(ngModel)]="feedback[key(item)]" maxlength="2000" rows="2" [disabled]="saving()"></textarea></label>
            <button pButton type="button" (click)="save(item)" [disabled]="saving() || loading()">Enregistrer le suivi</button>
          }
        </article>
      } @empty { @if (!loading() && !error()) { <p>Aucun devoir à suivre.</p> } }
    </section>
  `,
})
export class HomeworkTracking implements OnChanges {
  private readonly api = inject(SchoolLifeService);
  private readonly destroy = inject(DestroyRef);
  readonly scope = input.required<'classes' | 'students'>();
  readonly contextId = input.required<number>();
  readonly revision = input<unknown>();
  readonly rows = signal<HomeworkProgress[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly labels = LIFE_LABELS;
  statuses: Record<string, string> = {};
  feedback: Record<string, string> = {};
  private version = 0;
  private pendingRefresh = false;
  ngOnChanges(changes: SimpleChanges): void {
    const contextChanged = !!changes['contextId'] || !!changes['scope'];
    if (contextChanged) { this.rows.set([]); this.statuses = {}; this.feedback = {}; this.success.set(null); }
    if (this.saving() && !contextChanged) { this.pendingRefresh = true; return; }
    this.load(!contextChanged);
  }
  key(item: HomeworkProgress): string { return item.postId + ':' + item.studentId; }
  load(preserveDrafts = false): void {
    const previous = new Map(this.rows().map(row => [this.key(row), row]));
    const version = ++this.version; this.loading.set(true); this.error.set(null);
    this.api.overview(this.scope(), this.contextId(), 'suivi-devoirs').pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: data => {
        if (version !== this.version) return;
        this.rows.set(data.homeworks);
        const statuses: Record<string, string> = {}, feedback: Record<string, string> = {};
        for (const item of data.homeworks) {
          const key = this.key(item), old = previous.get(key);
          const dirty = preserveDrafts && old && (this.statuses[key] !== old.status || this.feedback[key] !== old.feedback);
          statuses[key] = dirty ? this.statuses[key] : item.status;
          feedback[key] = dirty ? this.feedback[key] : item.feedback;
        }
        this.statuses = statuses; this.feedback = feedback;
        this.loading.set(false);
      },
      error: err => { if (version === this.version) { this.loading.set(false); this.error.set(apiError(err, 'Impossible de charger le suivi.')); } },
    });
  }
  save(item: HomeworkProgress): void {
    if (!item.editable || this.scope() !== 'classes' || this.saving() || this.loading()) return;
    const version = this.version; this.saving.set(true); this.error.set(null); this.success.set(null);
    const payload = { status: this.statuses[this.key(item)], feedback: this.feedback[this.key(item)] ?? '' };
    this.api.update('classes', this.contextId(), 'homeworks/' + item.postId + '/students/' + item.studentId, payload)
      .pipe(takeUntilDestroyed(this.destroy)).subscribe({
        next: () => { this.saving.set(false); if (version !== this.version) return;
          this.rows.update(rows => rows.map(row => this.key(row) === this.key(item) ? { ...row, ...payload } : row));
          this.success.set('Suivi enregistré et disponible pour la famille.');
          if (this.pendingRefresh) { this.pendingRefresh = false; this.load(true); } },
        error: err => { this.saving.set(false); if (version === this.version) this.error.set(apiError(err, 'Enregistrement impossible. Votre saisie est conservée.')); this.pendingRefresh = false; },
      });
  }
}
