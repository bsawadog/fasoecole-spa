import { ModuleHelpButton } from '../../../../shared/help/module-help-button';
import { SelectField } from '../../../../shared/ui/select-field';
import { SelectOption } from '../../../../shared/ui/select-field';
import { LoadingState } from '../../../../shared/ui/loading-state';
import { Component, DestroyRef, effect, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MyStudentsState } from '../../../../shared/self-space/my-students.state';
import { ScheduleView } from '../../../../shared/self-space/schedule-view';
import { apiError, ScheduleEntry, SelfSpaceService } from '../../../../shared/self-space/self-space.service';

@Component({
  selector: 'app-etudiant-schedule',
  standalone: true,
  imports: [ModuleHelpButton, SelectField, SelectOption, LoadingState, FormsModule, ScheduleView],
  providers: [MyStudentsState],
  template: `
    <div class="ss">
      <header class="module-help-header ss__header">
    <app-module-help />
        <div>
          <h1>Emploi du temps</h1>
          <p>Les cours de votre classe cette semaine.</p>
        </div>
        @if (state.students().length > 1) {
          <label class="ss__picker">Établissement
            <app-select-field [ngModel]="state.selectedId()" (ngModelChange)="state.selectedId.set(+$event)" [ariaLabel]="(&quot;Établissement &quot;).trim()">
              @for (s of state.students(); track s.studentId) {
                <app-select-option [value]="s.studentId" [label]="((&quot;&quot; + ((s.schoolName)) + &quot;&quot;)).trim()" />
              }
            </app-select-field>
          </label>
        }
      </header>
      @if (state.loading() || loading()) {
        <app-loading-state message="Chargement…" />
      } @else if (state.error() || error()) {
        <p class="ss__alert ss__alert--error" role="alert">{{ state.error() || error() }}</p>
      } @else if (state.selectedId()) {
        <app-schedule-view [entries]="entries()" [showTeacher]="true" />
      } @else {
        <p class="ss__state">Aucun dossier élève n’est associé à votre compte.</p>
      }
    </div>
  `,
  styleUrl: '../../../../shared/self-space/self-space.scss',
})
export class EtudiantSchedule implements OnInit {
  private readonly api = inject(SelfSpaceService);
  private readonly destroyRef = inject(DestroyRef);
  readonly state = inject(MyStudentsState);
  readonly entries = signal<ScheduleEntry[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      const id = this.state.selectedId();
      if (id) this.load(id);
    });
  }

  ngOnInit(): void {
    this.state.load();
  }

  private load(studentId: number): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.studentSchedule(studentId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (entries) => {
        if(this.state.selectedId()!==studentId)return;
        this.entries.set(entries);
        this.loading.set(false);
      },
      error: (err) => {
        if(this.state.selectedId()!==studentId)return;
        this.loading.set(false);
        this.error.set(apiError(err, 'Impossible de charger l’emploi du temps.'));
      },
    });
  }
}
