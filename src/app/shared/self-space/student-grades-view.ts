import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { apiError, PeriodGrades, SelfSpaceService, StudentGrades } from './self-space.service';

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Notes provisoires', LOCKED: 'En cours de validation', PUBLISHED: 'Résultats publiés',
};

/** Notes et bulletins d'un élève, par période (lecture seule). */
@Component({
  selector: 'app-student-grades-view',
  standalone: true,
  imports: [DatePipe, DecimalPipe],
  templateUrl: './student-grades-view.html',
  styleUrl: './self-space.scss',
  host: { class: 'ss', style: 'padding:0;background:transparent' },
})
export class StudentGradesView {
  private readonly api = inject(SelfSpaceService);
  private readonly destroyRef = inject(DestroyRef);

  readonly studentId = input.required<number>();
  readonly data = signal<StudentGrades | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly selectedPeriodId = signal<number | null>(null);
  readonly statusLabels = STATUS_LABELS;

  readonly period = computed<PeriodGrades | null>(() => {
    const periods = this.data()?.periods ?? [];
    return periods.find((p) => p.periodId === this.selectedPeriodId()) ?? null;
  });

  constructor() {
    effect(() => this.load(this.studentId()));
  }

  private load(studentId: number): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.studentGrades(studentId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (data) => {
        this.data.set(data);
        this.loading.set(false);
        // Par défaut : la dernière période publiée, sinon la période en cours (dernière ayant des notes).
        const published = [...data.periods].reverse().find((p) => p.published);
        const withGrades = [...data.periods].reverse().find((p) => p.grades.length);
        this.selectedPeriodId.set((published ?? withGrades ?? data.periods[0])?.periodId ?? null);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(apiError(err, 'Impossible de charger les notes.'));
      },
    });
  }

  on20(value: number, max: number): number {
    return max ? (value / max) * 20 : value;
  }
}
