import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { apiError, SelfSpaceService, StudentOverview } from './self-space.service';

/**
 * Dossiers d'élève accessibles à l'utilisateur connecté (son propre dossier ; plusieurs si l'élève est inscrit
 * dans plusieurs établissements). À fournir au niveau du composant.
 */
@Injectable()
export class MyStudentsState {
  private readonly api = inject(SelfSpaceService);
  private readonly destroyRef = inject(DestroyRef);

  readonly students = signal<StudentOverview[]>([]);
  readonly selectedId = signal<number | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  load(): void {
    this.api.myStudents().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (students) => {
        this.students.set(students);
        this.selectedId.set(students[0]?.studentId ?? null);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(apiError(err, 'Impossible de charger votre dossier.'));
      },
    });
  }
}
