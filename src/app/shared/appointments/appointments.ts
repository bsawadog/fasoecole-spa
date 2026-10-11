import { DatePipe } from '@angular/common';
import { Component, DestroyRef, computed, effect, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin, of, Subscription, timer } from 'rxjs';
import { APPOINTMENT_LABELS, ParentAppointment, ParentPortalService } from '../self-space/parent-portal.service';
import { apiError } from '../self-space/self-space.service';
import { AppointmentRecipient, AppointmentsService, SchoolAppointment } from './appointments.service';
import { SchoolDataSyncService } from '../school-data-sync.service';
import { appointmentGroup, nearestAppointmentFirst, pendingAppointmentCount } from './appointment-state';

interface AppointmentEntry {
  key: string;
  appointment: SchoolAppointment | ParentAppointment;
  parent: boolean;
  sent: boolean;
  name: string;
  context: string;
  studentId: number | null;
  legacy?: boolean;
}

@Component({
  selector: 'app-appointments', standalone: true, imports: [DatePipe, FormsModule, RouterLink],
  templateUrl: './appointments.html', styleUrl: './appointments.scss',
})
export class Appointments {
  readonly schoolId = input<number | null>(null);
  readonly owner = input(false);
  readonly pageLink = input<string | null>(null);
  readonly showHeading = input(true);
  readonly legacyRequests = input<ParentAppointment[]>([]);
  readonly legacyKind = input<'parent' | 'teacher' | null>(null);
  readonly teacherClassId = input<number | null>(null);
  readonly changed = output<void>();
  private readonly api = inject(AppointmentsService);
  private readonly portal = inject(ParentPortalService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly sync = inject(SchoolDataSyncService);
  private request?: Subscription;
  readonly incoming = signal<SchoolAppointment[]>([]);
  readonly parentRequests = signal<ParentAppointment[]>([]);
  readonly sent = signal<SchoolAppointment[]>([]);
  readonly recipients = signal<AppointmentRecipient[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly labels = APPOINTMENT_LABELS;
  readonly now = signal(Date.now());
  readonly entries = computed<AppointmentEntry[]>(() => [
    ...this.legacyRequests().map(a => ({ key: `legacy-${a.id}`, appointment: a, parent: true, legacy: true, sent: this.legacyKind() === 'parent', name: this.legacyKind() === 'parent' ? a.teacherName : a.parentName, context: a.studentName, studentId: null })),
    ...this.parentRequests().map(a => ({ key: `parent-${a.id}`, appointment: a, parent: true, sent: false, name: a.parentName, context: `${a.studentName} · ${a.teacherName}`, studentId: a.studentId })),
    ...this.incoming().map(a => ({ key: `school-${a.id}`, appointment: a, parent: false, sent: false, name: a.organizerName, context: a.schoolName, studentId: null })),
    ...this.sent().map(a => ({ key: `sent-${a.id}`, appointment: a, parent: false, sent: true, name: a.recipientName, context: a.schoolName, studentId: null })),
  ]);
  readonly pendingCount = computed(() => pendingAppointmentCount(this.entries().map(e => e.appointment), this.now()));
  readonly groups = computed(() => [
    { id: 'active' as const, title: 'En cours', description: 'Demandes en attente et rendez-vous confirmés à venir.' },
    { id: 'expired' as const, title: 'Expirés', description: 'Rendez-vous dont la date est passée, du plus récent au plus ancien.' },
    { id: 'rejected' as const, title: 'Refusés', description: 'Demandes refusées et réponses associées.' },
    { id: 'cancelled' as const, title: 'Annulés', description: 'Rendez-vous annulés par leur organisateur.' },
  ].map(group => ({ ...group, entries: this.entries()
    .filter(e => appointmentGroup(e.appointment, this.now()) === group.id)
    .sort((a, b) => nearestAppointmentFirst(a.appointment, b.appointment, this.now()) || a.key.localeCompare(b.key)) })));
  readonly responses: Record<string, string> = {};
  recipientUserId: number | null = null;
  proposedAt = '';
  reason = '';
  showForm = false;
  constructor() {
    timer(0, 30_000).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.now.set(Date.now()));
    effect(onCleanup => {
      const school = this.schoolId();
      this.owner();
      this.request?.unsubscribe();
      this.incoming.set([]); this.parentRequests.set([]); this.sent.set([]); this.recipients.set([]);
      this.recipientUserId = null; this.proposedAt = ''; this.reason = ''; this.showForm = false;
      this.success.set(null);
      this.reload();
      const subscription = school ? this.sync.watch(school).subscribe(() => { if (!this.busy()) this.reload(true); }) : undefined;
      onCleanup(() => subscription?.unsubscribe());
    });
  }
  reload(background = false): void {
    const school = this.schoolId();
    if (this.owner() && !school) { this.loading.set(false); return; }
    this.request?.unsubscribe();
    if (!background) { this.loading.set(true); this.error.set(null); }
    this.request = forkJoin({
      incoming: this.api.received(),
      parents: this.owner() ? this.portal.schoolAppointments(school!) : of([]),
      sent: this.owner() ? this.api.sent(school!) : of([]),
      recipients: this.owner() ? this.api.recipients(school!) : of([]),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: data => {
        this.incoming.set(this.owner() ? data.incoming.filter(a => a.schoolId === school) : data.incoming);
        this.parentRequests.set(data.parents); this.sent.set(data.sent); this.recipients.set(data.recipients);
        this.loading.set(false); this.error.set(null);
      }, error: err => { this.loading.set(false); this.error.set(apiError(err, 'Impossible de charger les rendez-vous.')); },
    });
  }
  refresh(): void {
    this.reload();
    if (this.legacyKind()) this.changed.emit();
  }
  respond(entry: AppointmentEntry, status: 'ACCEPTED' | 'REJECTED'): void {
    if (!entry.legacy) { this.decide(entry.appointment, status, entry.parent); return; }
    const classId = this.teacherClassId();
    if (this.legacyKind() !== 'teacher' || !classId || this.busy() || entry.appointment.status !== 'PENDING'
      || appointmentGroup(entry.appointment, Date.now()) !== 'active') return;
    const response = this.responses[entry.key]?.trim();
    if (!response) { this.error.set('Précisez le lieu de rencontre ou le motif du refus.'); return; }
    this.busy.set(true); this.error.set(null); this.success.set(null);
    this.portal.teacherDecide(classId, entry.appointment.id, status, response).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.busy.set(false); if (classId === this.teacherClassId()) { this.success.set(status === 'ACCEPTED' ? 'Rendez-vous accepté.' : 'Rendez-vous refusé.'); this.changed.emit(); } },
      error: err => { this.busy.set(false); if (classId === this.teacherClassId()) this.error.set(apiError(err, 'Impossible de traiter ce rendez-vous.')); },
    });
  }
  cancelEntry(entry: AppointmentEntry): void {
    if (!entry.legacy) { this.cancel(entry.appointment as SchoolAppointment); return; }
    if (this.legacyKind() !== 'parent' || this.busy() || appointmentGroup(entry.appointment, Date.now()) !== 'active') return;
    const appointment = entry.appointment as ParentAppointment;
    this.busy.set(true); this.error.set(null); this.success.set(null);
    this.portal.cancel(appointment.studentId, appointment.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.busy.set(false); this.success.set('Rendez-vous annulé.'); this.changed.emit(); },
      error: err => { this.busy.set(false); this.error.set(apiError(err, 'Impossible d’annuler ce rendez-vous.')); },
    });
  }
  decide(appointment: SchoolAppointment | ParentAppointment, status: 'ACCEPTED' | 'REJECTED', parent = false): void {
    if (this.busy() || appointment.status !== 'PENDING' || appointmentGroup(appointment, Date.now()) !== 'active') return;
    const response = this.responses[`${parent ? 'parent' : 'school'}-${appointment.id}`]?.trim();
    if (!response) { this.error.set('Précisez le lieu de rencontre ou le motif du refus.'); return; }
    const school = this.schoolId();
    if (parent && !school) return;
    this.busy.set(true); this.error.set(null); this.success.set(null);
    const request = parent ? this.portal.decide(school!, appointment.id, status, response) : this.api.decide(appointment.id, status, response);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.busy.set(false);
        if (school !== this.schoolId()) return;
        if (parent) this.parentRequests.update(items => items.map(a => a.id === appointment.id ? { ...a, status, response } : a));
        else this.incoming.update(items => items.map(a => a.id === appointment.id ? { ...a, status, response } : a));
        this.success.set(status === 'ACCEPTED' ? 'Rendez-vous accepté.' : 'Rendez-vous refusé.');
      }, error: err => { this.busy.set(false); if (school === this.schoolId()) this.error.set(apiError(err, 'Impossible de traiter ce rendez-vous.')); },
    });
  }
  create(): void {
    const school = this.schoolId();
    if (!this.owner() || !school || this.busy()) return;
    if (!this.recipients().some(r => r.userId === this.recipientUserId) || !this.reason.trim() || !this.proposedAt || new Date(this.proposedAt).getTime() <= Date.now()) {
      this.error.set('Choisissez un destinataire, une date future et un motif.'); return;
    }
    this.busy.set(true); this.error.set(null); this.success.set(null);
    this.api.create(school, { recipientUserId: this.recipientUserId!, proposedAt: this.proposedAt, reason: this.reason.trim() })
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: appointment => {
          this.busy.set(false); if (school !== this.schoolId()) return;
          this.sent.update(items => [appointment, ...items]); this.showForm = false; this.reason = ''; this.proposedAt = ''; this.recipientUserId = null;
          this.success.set('Demande de rendez-vous envoyée.');
        }, error: err => { this.busy.set(false); if (school === this.schoolId()) this.error.set(apiError(err, 'Impossible de prendre ce rendez-vous.')); },
      });
  }
  cancel(appointment: SchoolAppointment): void {
    const school = this.schoolId();
    if (!this.owner() || !school || this.busy() || !['PENDING', 'ACCEPTED'].includes(appointment.status)) return;
    this.busy.set(true); this.error.set(null); this.success.set(null);
    this.api.cancel(school, appointment.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.busy.set(false); if (school === this.schoolId()) { this.sent.update(items => items.map(a => a.id === appointment.id ? { ...a, status: 'CANCELLED' } : a)); this.success.set('Rendez-vous annulé.'); } },
      error: err => { this.busy.set(false); if (school === this.schoolId()) this.error.set(apiError(err, 'Impossible d’annuler ce rendez-vous.')); },
    });
  }
}
