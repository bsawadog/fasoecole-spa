import { FormValidationDirective } from '../../../../shared/form-validation.directive';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, of, Subscription } from 'rxjs';
import { SchoolDataSyncService } from '../../../../shared/school-data-sync.service';
import { ParentChildDetail } from '../child-detail/child-detail';
import { apiError, ConversationRecipient, SelfSpaceService, StudentOverview } from '../../../../shared/self-space/self-space.service';
import { APPOINTMENT_LABELS, ParentAppointment, ParentEvaluation, ParentPayment, ParentPortalService, PortalPost, PostKind } from '../../../../shared/self-space/parent-portal.service';
import { PortalPosts } from '../../../../shared/self-space/portal-posts';

type Module = 'notes' | 'absences' | 'frais' | 'emploi' | 'devoirs' | 'annonces' | 'documents' | 'rendez-vous';
const TITLES: Record<Module, string> = { notes: 'Notes et bulletins', absences: 'Présences et retards', frais: 'Frais et paiements', emploi: 'Emploi du temps', devoirs: 'Devoirs et évaluations', annonces: 'Annonces de l’établissement', documents: 'Documents', 'rendez-vous': 'Rendez-vous' };

@Component({
  selector: 'app-parent-module', standalone: true,
  imports: [FormValidationDirective, DatePipe, DecimalPipe, FormsModule, ParentChildDetail, PortalPosts],
  templateUrl: './modules.html', styleUrls: ['../../../../shared/self-space/self-space.scss', './modules.scss'],
})
export class ParentModule implements OnInit {
  private readonly api = inject(SelfSpaceService);
  private readonly portal = inject(ParentPortalService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly sync = inject(SchoolDataSyncService);
  private syncSubscription?: Subscription;
  readonly module = signal<Module>('notes');
  readonly title = computed(() => TITLES[this.module()]);
  readonly children = signal<StudentOverview[]>([]);
  readonly selectedId = signal<number | null>(null);
  readonly selected = computed(() => this.children().find(child => child.studentId === this.selectedId()));
  private readonly refreshVersion = signal(0);
  readonly detail = computed(() => {
    const module = this.module(); const child = this.selected();
    return child && (module === 'notes' || module === 'absences' || module === 'frais' || module === 'emploi')
      ? [{ key: `${child.studentId}:${module}:${this.refreshVersion()}`, id: child.studentId, tab: module }] : [];
  });
  readonly loadingChildren = signal(true);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly posts = signal<PortalPost[]>([]);
  readonly evaluations = signal<ParentEvaluation[]>([]);
  readonly payments = signal<ParentPayment[]>([]);
  readonly appointments = signal<ParentAppointment[]>([]);
  readonly teachers = signal<ConversationRecipient[]>([]);
  readonly receipt = signal<ParentPayment | null>(null);
  readonly appointmentLabels = APPOINTMENT_LABELS;
  readonly paymentLabels: Record<string,string> = { CASH: 'Espèces', BANK_TRANSFER: 'Virement', MOBILE_MONEY: 'Mobile Money', CARD: 'Carte', CHECK: 'Chèque' };
  teacherUserId: number | null = null;
  proposedAt = '';
  reason = '';
  private requestVersion = 0;

  ngOnInit(): void {
    this.route.data.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(data => {
      this.module.set(data['module'] as Module); this.receipt.set(null); this.load();
    });
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const id = Number(params.get('studentId'));
      if (this.children().length) {
        this.selectedId.set(this.children().some(child => child.studentId === id) ? id : this.children()[0].studentId);
        this.load();
      }
    });
    this.api.myStudents().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: children => {
        this.children.set(children); this.loadingChildren.set(false);
        const id = Number(this.route.snapshot.queryParamMap.get('studentId'));
        this.selectedId.set(children.find(child => child.studentId === id)?.studentId ?? children[0]?.studentId ?? null);
        this.load();
      },
      error: err => { this.loadingChildren.set(false); this.error.set(apiError(err, 'Impossible de charger vos enfants.')); },
    });
  }
  choose(id: string): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { studentId: Number(id) }, queryParamsHandling: 'merge' });
  }
  load(background = false): void {
    const child = this.selected(); if (!child) return;
    const version = ++this.requestVersion; const module = this.module();
    if (!background) {
      this.refreshVersion.update(value => value + 1);
      this.error.set(null); this.success.set(null); this.receipt.set(null);
      this.teacherUserId = null; this.proposedAt = ''; this.reason = '';
      this.posts.set([]); this.payments.set([]); this.evaluations.set([]); this.appointments.set([]); this.teachers.set([]);
      this.syncSubscription?.unsubscribe();
      this.syncSubscription = this.sync.watch(child.schoolId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => { if (!this.saving()) this.load(true); });
    }
    const kinds: Partial<Record<Module,PostKind>> = { devoirs: 'HOMEWORK', annonces: 'ANNOUNCEMENT', documents: 'DOCUMENT' };
    const kind = kinds[module]; if (!background) this.loading.set(true);
    forkJoin({
      posts: kind ? this.portal.posts(child.studentId, kind) : of([] as PortalPost[]),
      evaluations: module === 'devoirs' ? this.portal.evaluations(child.studentId) : of([] as ParentEvaluation[]),
      payments: module === 'frais' ? this.portal.payments(child.studentId) : of([] as ParentPayment[]),
      appointments: module === 'rendez-vous' ? this.portal.appointments(child.studentId) : of([] as ParentAppointment[]),
      teachers: module === 'rendez-vous' ? this.api.conversationRecipients(child.schoolId, child.studentId) : of([] as ConversationRecipient[]),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: data => {
        if (version !== this.requestVersion) return;
        this.posts.set(data.posts); this.evaluations.set(data.evaluations); this.payments.set(data.payments);
        this.appointments.set(data.appointments); this.teachers.set(data.teachers.filter(item => item.role === 'ENSEIGNANT'));
        this.loading.set(false);
      },
      error: err => { if (version === this.requestVersion) { this.error.set(apiError(err, 'Impossible de charger ce module.')); this.loading.set(false); } },
    });
  }
  requestAppointment(): void {
    const id = this.selectedId(); if (id === null || this.saving()) return;
    if (!this.proposedAt || new Date(this.proposedAt).getTime() <= Date.now() || !this.reason.trim()) {
      this.error.set('Indiquez une date future et le motif du rendez-vous.'); return;
    }
    this.saving.set(true); this.error.set(null);
    this.portal.request(id, { teacherUserId: this.teacherUserId, proposedAt: this.proposedAt, reason: this.reason.trim() }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: appointment => {
        this.saving.set(false);
        if (id !== this.selectedId()) return;
        this.appointments.update(items => [appointment, ...items]); this.reason = ''; this.proposedAt = '';
        this.success.set('Votre demande a été envoyée à l’établissement. Le rendez-vous doit être confirmé.');
      },
      error: err => { this.saving.set(false); if (id === this.selectedId()) this.error.set(apiError(err, 'Impossible d’envoyer cette demande.')); },
    });
  }
  cancel(appointment: ParentAppointment): void {
    const id = this.selectedId(); if (id === null || this.saving()) return;
    this.saving.set(true); this.error.set(null);
    this.portal.cancel(id, appointment.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.saving.set(false); if (id === this.selectedId()) this.appointments.update(items => items.map(item => item.id === appointment.id ? { ...item, status: 'CANCELLED' } : item)); },
      error: err => { this.saving.set(false); this.error.set(apiError(err, 'Impossible d’annuler ce rendez-vous.')); },
    });
  }
  printReceipt(): void { window.print(); }
}
