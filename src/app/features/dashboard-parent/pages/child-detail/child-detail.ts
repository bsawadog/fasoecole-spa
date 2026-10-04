import { FormValidationDirective } from '../../../../shared/form-validation.directive';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, DestroyRef, inject, input, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ScheduleView } from '../../../../shared/self-space/schedule-view';
import {
  apiError,
  ABSENCE_REPORT_LABELS,
  AbsenceReport,
  AttendanceItem,
  InvoiceItem,
  ScheduleEntry,
  SelfSpaceService,
  FamilyAttendanceType,
  FAMILY_ATTENDANCE_LABELS,
  StudentOverview,
} from '../../../../shared/self-space/self-space.service';
import { StudentGradesView } from '../../../../shared/self-space/student-grades-view';
import { SchoolDataSyncService } from '../../../../shared/school-data-sync.service';

type Tab = 'notes' | 'emploi' | 'absences' | 'frais';

const localToday = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

const ATTENDANCE_LABELS: Record<string, string> = {
  ABSENT: 'Absence', EXCUSED: 'Absence excusée', LATE: 'Retard', PRESENT: 'Présent',
};
const INVOICE_LABELS: Record<string, string> = {
  PENDING: 'À payer', PAID: 'Payée', OVERDUE: 'En retard', CANCELLED: 'Annulée',
};

@Component({
  selector: 'app-parent-child-detail',
  standalone: true,
  imports: [FormValidationDirective, DatePipe, DecimalPipe, FormsModule, RouterLink, ScheduleView, StudentGradesView],
  templateUrl: './child-detail.html',
  styleUrl: '../../../../shared/self-space/self-space.scss',
})
export class ParentChildDetail implements OnInit {
  private readonly api = inject(SelfSpaceService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly sync = inject(SchoolDataSyncService);
  readonly selectedStudentId = input<number | null>(null);
  readonly initialTab = input<Tab>('notes');
  readonly embedded = input(false);
  get studentId(): number { return this.selectedStudentId() ?? Number(this.route.snapshot.paramMap.get('studentId')); }
  readonly attendanceLabels = ATTENDANCE_LABELS;
  readonly invoiceLabels = INVOICE_LABELS;
  readonly absenceReportLabels = ABSENCE_REPORT_LABELS;
  readonly familyAttendanceLabels = FAMILY_ATTENDANCE_LABELS;
  readonly child = signal<StudentOverview | null>(null);
  readonly error = signal<string | null>(null);
  readonly tab = signal<Tab>('notes');
  readonly schedule = signal<ScheduleEntry[] | null>(null);
  readonly attendance = signal<AttendanceItem[] | null>(null);
  readonly absenceReports = signal<AbsenceReport[] | null>(null);
  readonly invoices = signal<InvoiceItem[] | null>(null);
  readonly tabError = signal<string | null>(null);
  readonly reportSuccess = signal<string | null>(null);
  reportDate = localToday;
  reportType: FamilyAttendanceType = 'ABSENT';
  reportReason = '';
  reportSaving = false;

  ngOnInit(): void {
    this.open(this.initialTab());
    this.api.student(this.studentId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (child) => {
        this.child.set(child);
        this.sync.watch(child.schoolId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.refresh());
      },
      error: (err) => this.error.set(apiError(err, 'Impossible d’ouvrir le dossier de cet enfant.')),
    });
  }

  open(tab: Tab): void {
    this.tab.set(tab);
    this.tabError.set(null);
    this.reportSuccess.set(null);
    const fail = (err: unknown) => this.tabError.set(apiError(err, 'Impossible de charger ces informations.'));
    if (tab === 'emploi' && !this.schedule()) {
      this.api.studentSchedule(this.studentId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (v) => this.schedule.set(v), error: fail });
    } else if (tab === 'absences') {
      this.attendance.set(null);
      this.absenceReports.set(null);
      this.api.studentAttendance(this.studentId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (v) => this.attendance.set(v), error: fail,
      });
      this.api.absenceReports(this.studentId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (v) => this.absenceReports.set(v), error: fail,
      });
    } else if (tab === 'frais' && !this.invoices()) {
      this.api.studentInvoices(this.studentId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (v) => this.invoices.set(v), error: fail });
    }
  }

  private refresh(): void {
    this.api.student(this.studentId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: value => this.child.set(value), error: err => this.tabError.set(apiError(err,'Actualisation indisponible.')) });
    if (this.tab() === 'absences') {
      this.api.studentAttendance(this.studentId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: value => this.attendance.set(value), error: () => this.tabError.set('Actualisation des présences indisponible.') });
      this.api.absenceReports(this.studentId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: value => this.absenceReports.set(value), error: () => this.tabError.set('Actualisation des signalements indisponible.') });
    }
    if (this.tab() === 'frais') this.api.studentInvoices(this.studentId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: value => this.invoices.set(value), error: () => this.tabError.set('Actualisation des frais indisponible.') });
  }

  reportAbsence(): void {
    this.tabError.set(null);
    this.reportSuccess.set(null);
    if (!this.reportDate) {
      this.tabError.set('Choisissez la date concernée.');
      return;
    }
    if (!this.reportReason.trim()) {
      this.tabError.set('Veuillez indiquer le motif de l’absence.');
      return;
    }
    this.reportSaving = true;
    this.api.reportAbsence(this.studentId, {
      startDate: this.reportDate,
      endDate: this.reportDate,
      attendanceType: this.reportType,
      reason: this.reportReason.trim(),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (report) => {
        this.absenceReports.update((reports) => [report, ...(reports ?? [])]);
        this.reportReason = '';
        this.reportSuccess.set('Le signalement a été envoyé à l’établissement.');
        this.reportSaving = false;
      },
      error: (err) => {
        this.tabError.set(apiError(err, 'Impossible d’envoyer le signalement. Réessayez.'));
        this.reportSaving = false;
      },
    });
  }
}
