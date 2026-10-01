import { Component, DestroyRef, effect, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MyStudentsState } from '../../../../shared/self-space/my-students.state';
import { ScheduleView } from '../../../../shared/self-space/schedule-view';
import { apiError, ScheduleEntry, SelfSpaceService } from '../../../../shared/self-space/self-space.service';

@Component({
  selector: 'app-etudiant-schedule',
  standalone: true,
  imports: [FormsModule, ScheduleView],
  providers: [MyStudentsState],
  template: `
    <div class="ss">
      <header class="ss__header">
        <div>
          <h1>Emploi du temps</h1>
          <p>Les cours de votre classe cette semaine.</p>
        </div>
        @if (state.students().length > 1) {
          <label class="ss__picker">Établissement
            <select [ngModel]="state.selectedId()" (ngModelChange)="state.selectedId.set(+$event)">
              @for (s of state.students(); track s.studentId) {
                <option [ngValue]="s.studentId">{{ s.schoolName }}</option>
              }
            </select>
          </label>
        }
      </header>
      @if (state.loading() || loading()) {
        <p class="ss__state">Chargement…</p>
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
        this.entries.set(entries);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(apiError(err, 'Impossible de charger l’emploi du temps.'));
      },
    });
  }
}
