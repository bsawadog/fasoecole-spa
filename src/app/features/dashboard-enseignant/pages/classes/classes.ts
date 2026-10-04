import { FormValidationDirective } from '../../../../shared/form-validation.directive';
import { DatePipe } from '@angular/common';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ScheduleView } from '../../../../shared/self-space/schedule-view';
import { Subscription } from 'rxjs';
import { SchoolDataSyncService } from '../../../../shared/school-data-sync.service';
import {
  apiError,
  AbsenceReport,
  ConversationSummary,
  ConversationThread,
  FAMILY_ATTENDANCE_LABELS,
  RosterStudent,
  ScheduleEntry,
  SelfSpaceService,
  TeacherClass,
} from '../../../../shared/self-space/self-space.service';

@Component({
  selector: 'app-enseignant-classes',
  standalone: true,
  imports: [FormValidationDirective, DatePipe, FormsModule, RouterLink, ScheduleView],
  templateUrl: './classes.html',
  styleUrl: '../../../../shared/self-space/self-space.scss',
})
export class EnseignantClasses implements OnInit {
  private readonly api = inject(SelfSpaceService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly sync = inject(SchoolDataSyncService);
  private syncSubscription?: Subscription;

  readonly classes = signal<TeacherClass[]>([]);
  readonly schedule = signal<ScheduleEntry[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly selectedId = signal<number | null>(null);
  readonly students = signal<RosterStudent[]>([]);
  readonly studentsLoading = signal(false);
  readonly studentsError = signal<string | null>(null);
  readonly filter = signal('');
  readonly familyAttendanceLabels = FAMILY_ATTENDANCE_LABELS;
  readonly familyReports = signal<AbsenceReport[]>([]);
  readonly reportsLoading = signal(false);
  readonly reportBusyId = signal<number | null>(null);
  readonly reportError = signal<string | null>(null);
  readonly reportSuccess = signal<string | null>(null);
  readonly reportDate = signal(new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10));
  readonly conversations = signal<ConversationSummary[]>([]);
  readonly conversation = signal<ConversationThread | null>(null);
  readonly conversationError = signal<string | null>(null);
  readonly replyText = signal('');
  readonly replyBusy = signal(false);

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
    this.syncSubscription?.unsubscribe();
    this.selectedId.set(classId);
    const schoolId = this.selected()?.schoolId;
    if (schoolId) this.syncSubscription = this.sync.watch(schoolId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (!this.reportBusyId()) this.loadFamilyReports();
    });
    this.filter.set('');
    this.studentsLoading.set(true);
    this.studentsError.set(null);
    this.api.classStudents(classId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (students) => {
        if (classId !== this.selectedId()) return;
        this.students.set(students);
        this.studentsLoading.set(false);
      },
      error: (err) => {
        if (classId !== this.selectedId()) return;
        this.students.set([]);
        this.studentsLoading.set(false);
        this.studentsError.set(apiError(err, 'Impossible de charger les élèves.'));
      },
    });
    this.loadFamilyReports();
    this.conversation.set(null);
    this.conversationError.set(null);
    this.api.teacherConversations(classId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (items) => this.conversations.set(items),
      error: (err) => this.conversationError.set(apiError(err, 'Impossible de charger les messages des parents.')),
    });
  }

  changeReportDate(date: string): void {
    this.reportDate.set(date);
    this.loadFamilyReports();
  }

  refreshFamilyReports(): void {
    this.loadFamilyReports();
  }

  private loadFamilyReports(): void {
    const classId = this.selectedId();
    if (!classId) return;
    this.reportsLoading.set(true);
    this.reportError.set(null);
    const date = this.reportDate();
    this.api.teacherFamilyReports(classId, date).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (reports) => {
        if (classId !== this.selectedId() || date !== this.reportDate()) return;
        this.familyReports.set(reports);
        this.reportsLoading.set(false);
      },
      error: (err) => {
        if (classId !== this.selectedId() || date !== this.reportDate()) return;
        this.reportError.set(apiError(err, 'Impossible de charger les signalements des parents.'));
        this.reportsLoading.set(false);
      },
    });
  }

  recordFamilyReport(report: AbsenceReport): void {
    const classId = this.selectedId();
    if (!classId) return;
    this.reportError.set(null);
    this.reportSuccess.set(null);
    this.reportBusyId.set(report.id);
    this.api.recordTeacherFamilyReport(classId, report.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.familyReports.update((items) => items.filter((item) => item.id !== report.id));
        this.reportSuccess.set(`Présence enregistrée pour ${report.studentName}.`);
        this.reportBusyId.set(null);
      },
      error: (err) => {
        this.reportError.set(apiError(err, 'Impossible d’enregistrer ce signalement.'));
        this.reportBusyId.set(null);
      },
    });
  }

  openConversation(item: ConversationSummary): void {
    const classId = this.selectedId();
    if (!classId) return;
    this.conversationError.set(null);
    this.api.teacherConversation(classId, item.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (thread) => {
        this.conversation.set(thread);
        this.replyText.set('');
        this.conversations.update((items) => items.map((entry) => entry.id === item.id
          ? { ...entry, unread: false } : entry));
      },
      error: (err) => this.conversationError.set(apiError(err, 'Impossible d’ouvrir cette conversation.')),
    });
  }

  sendReply(): void {
    const classId = this.selectedId();
    const current = this.conversation();
    if (!classId || !current || !this.replyText().trim()) return;
    this.replyBusy.set(true);
    this.conversationError.set(null);
    this.api.teacherReply(classId, current.conversation.id, this.replyText().trim())
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (thread) => {
          this.conversation.set(thread);
          this.replyText.set('');
          this.replyBusy.set(false);
        },
        error: (err) => {
          this.conversationError.set(apiError(err, 'Impossible d’envoyer la réponse.'));
          this.replyBusy.set(false);
        },
      });
  }

  genderLabel(gender: string | null): string {
    if (!gender) return '—';
    return gender.toUpperCase().startsWith('F') ? 'F' : 'M';
  }
}
