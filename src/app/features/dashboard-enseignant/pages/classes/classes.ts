import { ErrorAlert } from '../../../../shared/error-alert';
import { TeacherDailyTools } from '../../../../shared/self-space/teacher-daily-tools';
import { ModuleHelpButton } from '../../../../shared/help/module-help-button';
import { DateField } from '../../../../shared/ui/date-field';
import { LoadingState } from '../../../../shared/ui/loading-state';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { FormValidationDirective } from '../../../../shared/form-validation.directive';
import { DatePipe } from '@angular/common';
import { Component, computed, DestroyRef, effect, inject, OnInit, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ScheduleView } from '../../../../shared/self-space/schedule-view';
import { Subscription } from 'rxjs';
import { SchoolDataSyncService } from '../../../../shared/school-data-sync.service';
import { OfflineAttendanceService } from '../../../../shared/offline/offline-attendance.service';
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
  imports: [ErrorAlert, TeacherDailyTools, ModuleHelpButton, DateField, LoadingState, InputTextModule, TextareaModule, ButtonModule, MessageModule, FormValidationDirective, DatePipe, FormsModule, RouterLink, ScheduleView],
  templateUrl: './classes.html',
  styleUrl: '../../../../shared/self-space/self-space.scss',
})
export class EnseignantClasses implements OnInit {
  readonly offline = inject(OfflineAttendanceService);
  readonly offlineMode = computed(() => this.offline.enabled() && !this.offline.online());
  readonly rosterUnavailable = signal(false);
  readonly scheduleUnavailable = signal(false);
  private initialized = false;
  private readonly api = inject(SelfSpaceService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly sync = inject(SchoolDataSyncService);
  private syncSubscription?: Subscription;

  readonly supportOpen=signal(false);
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
  readonly reportUnavailable = signal(false);
  readonly reportSuccess = signal<string | null>(null);
  readonly reportDate = signal(new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10));
  readonly conversations = signal<ConversationSummary[]>([]);
  readonly conversation = signal<ConversationThread | null>(null);
  readonly conversationError = signal<string | null>(null);
  readonly conversationUnavailable = signal(false);
  readonly replyText = signal('');
  readonly replyBusy = signal(false);

  readonly selected = computed(() => this.classes().find((c) => c.classId === this.selectedId()) ?? null);
  readonly filteredStudents = computed(() => {
    const q = this.filter().trim().toLowerCase();
    return q
      ? this.students().filter((s) => `${s.fullName} ${s.registrationNumber}`.toLowerCase().includes(q))
      : this.students();
  });

  constructor() {
    let wasOnline = this.offline.online(), wasUnlocked = this.offline.unlocked();
    effect(() => {
      const online = this.offline.online(), unlocked = this.offline.unlocked(), enabled = this.offline.enabled();
      untracked(() => {
        const restored = !wasOnline && online || !wasUnlocked && unlocked;
        wasOnline = online; wasUnlocked = unlocked;
        if (!this.initialized) return;
        if (enabled && !unlocked) {
          this.classes.set([]); this.students.set([]); this.schedule.set([]); this.selectedId.set(null);
          this.familyReports.set([]); this.conversations.set([]); this.conversation.set(null);
          this.loading.set(false);
        } else if (restored) this.load();
        if (enabled && !online) {
          this.error.set(null); this.studentsError.set(null); this.reportError.set(null); this.conversationError.set(null);
        }
      });
    });
  }

  ngOnInit(): void {
    this.initialized = true;
    this.load();
  }

  private acceptClasses(classes: TeacherClass[]): void {
    this.classes.set(classes); this.loading.set(false);
    const selected = this.selectedId() ?? this.offline.cachedClassSelection();
    const classId = classes.find(cls => cls.classId === selected)?.classId ?? classes[0]?.classId;
    if (classId) this.select(classId);
    else { this.selectedId.set(null); this.students.set([]); }
  }

  private load(): void {
    this.error.set(null);
    if (this.offlineMode()) {
      const classes = this.offline.cachedClasses();
      const schedule = this.offline.cachedSchedule();
      if (classes.length || !this.offline.unlocked()) {
        this.acceptClasses(classes);
        this.schedule.set(schedule ?? []); this.scheduleUnavailable.set(schedule === undefined);
        if (schedule === undefined && this.offline.unlocked()) this.api.teacherSchedule().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
          next: entries => { this.schedule.set(entries); this.scheduleUnavailable.set(false); }, error: () => this.scheduleUnavailable.set(true),
        });
        return;
      }
    }
    this.api.teacherClasses().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (classes) => {
        this.offline.rememberClasses(classes);
        this.acceptClasses(classes);
      },
      error: (err) => {
        this.loading.set(false);
        if (this.offlineMode()) { this.acceptClasses(this.offline.cachedClasses()); return; }
        this.error.set(apiError(err, 'Impossible de charger vos classes.'));
      },
    });
    this.api.teacherSchedule().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (entries) => { this.schedule.set(entries); this.scheduleUnavailable.set(false); this.offline.rememberSchedule(entries); },
      error: () => {
        const entries = this.offlineMode() ? this.offline.cachedSchedule() : undefined;
        this.schedule.set(entries ?? []); this.scheduleUnavailable.set(entries === undefined && this.offlineMode());
      },
    });
  }

  select(classId: number): void {
    if (!this.classes().some(cls => cls.classId === classId)) return;
    this.syncSubscription?.unsubscribe();
    this.selectedId.set(classId);
    this.offline.rememberClassSelection(classId);
    const schoolId = this.selected()?.schoolId;
    if (schoolId) this.syncSubscription = this.sync.watch(schoolId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (!this.reportBusyId()) this.loadFamilyReports();
    });
    this.filter.set('');
    this.studentsLoading.set(true);
    this.studentsError.set(null);
    this.rosterUnavailable.set(false);
    this.students.set([]);
    if (this.offlineMode()) {
      const students = this.offline.cachedRoster(classId);
      if (students !== undefined) {
        this.students.set(students); this.rosterUnavailable.set(false);
        this.studentsLoading.set(false); this.reportsLoading.set(false);
        this.loadFamilyReports(); this.loadConversations(); return;
      }
    }
    this.api.classStudents(classId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (students) => {
        if (classId !== this.selectedId()) return;
        this.students.set(students);
        this.offline.rememberRoster(classId, students);
        this.studentsLoading.set(false);
      },
      error: (err) => {
        if (classId !== this.selectedId()) return;
        this.studentsLoading.set(false);
        if (this.offlineMode()) {
          const students = this.offline.cachedRoster(classId);
          this.students.set(students ?? []); this.rosterUnavailable.set(students === undefined); return;
        }
        this.students.set([]);
        this.studentsError.set(apiError(err, 'Impossible de charger les élèves.'));
      },
    });
    this.loadFamilyReports();
    this.loadConversations();
  }

  private loadConversations(): void {
    const classId = this.selectedId();
    if (!classId) return;
    this.conversation.set(null);
    this.conversationError.set(null);
    this.conversationUnavailable.set(false);
    this.api.teacherConversations(classId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (items) => this.conversations.set(items),
      error: (err) => {
        if (this.offlineMode()) { this.conversationUnavailable.set(true); return; }
        this.conversationError.set(apiError(err, 'Impossible de charger les messages des parents.'));
      },
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
    this.reportUnavailable.set(false);
    const date = this.reportDate();
    this.api.teacherFamilyReports(classId, date).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (reports) => {
        if (classId !== this.selectedId() || date !== this.reportDate()) return;
        this.familyReports.set(reports);
        this.reportsLoading.set(false);
      },
      error: (err) => {
        if (classId !== this.selectedId() || date !== this.reportDate()) return;
        if (this.offlineMode()) { this.reportUnavailable.set(true); this.reportsLoading.set(false); return; }
        this.reportError.set(apiError(err, 'Impossible de charger les signalements des parents.'));
        this.reportsLoading.set(false);
      },
    });
  }

  recordFamilyReport(report: AbsenceReport): void {
    if (this.offlineMode()) return;
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
    if (this.offlineMode()) return;
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
