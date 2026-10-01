import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ScheduleView } from '../../../../shared/self-space/schedule-view';
import {
  apiError,
  AttendanceItem,
  InvoiceItem,
  ScheduleEntry,
  SelfSpaceService,
  StudentOverview,
} from '../../../../shared/self-space/self-space.service';
import { StudentGradesView } from '../../../../shared/self-space/student-grades-view';

type Tab = 'notes' | 'emploi' | 'absences' | 'frais';

const ATTENDANCE_LABELS: Record<string, string> = {
  ABSENT: 'Absence', EXCUSED: 'Absence excusée', LATE: 'Retard', PRESENT: 'Présent',
};
const INVOICE_LABELS: Record<string, string> = {
  PENDING: 'À payer', PAID: 'Payée', OVERDUE: 'En retard', CANCELLED: 'Annulée',
};

@Component({
  selector: 'app-parent-child-detail',
  standalone: true,
  imports: [DatePipe, DecimalPipe, RouterLink, ScheduleView, StudentGradesView],
  templateUrl: './child-detail.html',
  styleUrl: '../../../../shared/self-space/self-space.scss',
})
export class ParentChildDetail implements OnInit {
  private readonly api = inject(SelfSpaceService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly studentId = Number(this.route.snapshot.paramMap.get('studentId'));
  readonly attendanceLabels = ATTENDANCE_LABELS;
  readonly invoiceLabels = INVOICE_LABELS;
  readonly child = signal<StudentOverview | null>(null);
  readonly error = signal<string | null>(null);
  readonly tab = signal<Tab>('notes');
  readonly schedule = signal<ScheduleEntry[] | null>(null);
  readonly attendance = signal<AttendanceItem[] | null>(null);
  readonly invoices = signal<InvoiceItem[] | null>(null);
  readonly tabError = signal<string | null>(null);

  ngOnInit(): void {
    this.api.student(this.studentId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (child) => this.child.set(child),
      error: (err) => this.error.set(apiError(err, 'Impossible d’ouvrir le dossier de cet enfant.')),
    });
  }

  open(tab: Tab): void {
    this.tab.set(tab);
    this.tabError.set(null);
    const fail = (err: unknown) => this.tabError.set(apiError(err, 'Impossible de charger ces informations.'));
    if (tab === 'emploi' && !this.schedule()) {
      this.api.studentSchedule(this.studentId).subscribe({ next: (v) => this.schedule.set(v), error: fail });
    } else if (tab === 'absences' && !this.attendance()) {
      this.api.studentAttendance(this.studentId).subscribe({ next: (v) => this.attendance.set(v), error: fail });
    } else if (tab === 'frais' && !this.invoices()) {
      this.api.studentInvoices(this.studentId).subscribe({ next: (v) => this.invoices.set(v), error: fail });
    }
  }
}
