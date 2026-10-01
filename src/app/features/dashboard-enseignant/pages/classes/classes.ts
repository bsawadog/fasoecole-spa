import { DatePipe } from '@angular/common';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ScheduleView } from '../../../../shared/self-space/schedule-view';
import {
  apiError,
  RosterStudent,
  ScheduleEntry,
  SelfSpaceService,
  TeacherClass,
} from '../../../../shared/self-space/self-space.service';

@Component({
  selector: 'app-enseignant-classes',
  standalone: true,
  imports: [DatePipe, RouterLink, ScheduleView],
  templateUrl: './classes.html',
  styleUrl: '../../../../shared/self-space/self-space.scss',
})
export class EnseignantClasses implements OnInit {
  private readonly api = inject(SelfSpaceService);
  private readonly destroyRef = inject(DestroyRef);

  readonly classes = signal<TeacherClass[]>([]);
  readonly schedule = signal<ScheduleEntry[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly selectedId = signal<number | null>(null);
  readonly students = signal<RosterStudent[]>([]);
  readonly studentsLoading = signal(false);
  readonly studentsError = signal<string | null>(null);
  readonly filter = signal('');

  readonly selected = computed(() => this.classes().find((c) => c.classId === this.selectedId()) ?? null);
  readonly filteredStudents = computed(() => {
    const q = this.filter().trim().toLowerCase();
    return q
      ? this.students().filter((s) => `${s.fullName} ${s.registrationNumber}`.toLowerCase().includes(q))
      : this.students();
  });

  ngOnInit(): void {
    this.api.teacherClasses().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (classes) => {
        this.classes.set(classes);
        this.loading.set(false);
        if (classes.length) this.select(classes[0].classId);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(apiError(err, 'Impossible de charger vos classes.'));
      },
    });
    this.api.teacherSchedule().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (entries) => this.schedule.set(entries),
      error: () => this.schedule.set([]),
    });
  }

  select(classId: number): void {
    this.selectedId.set(classId);
    this.filter.set('');
    this.studentsLoading.set(true);
    this.studentsError.set(null);
    this.api.classStudents(classId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (students) => {
        this.students.set(students);
        this.studentsLoading.set(false);
      },
      error: (err) => {
        this.students.set([]);
        this.studentsLoading.set(false);
        this.studentsError.set(apiError(err, 'Impossible de charger les élèves.'));
      },
    });
  }

  genderLabel(gender: string | null): string {
    if (!gender) return '—';
    return gender.toUpperCase().startsWith('F') ? 'F' : 'M';
  }
}
