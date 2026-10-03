import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { forkJoin, Subscription } from 'rxjs';
import { SchoolDataSyncService } from '../../../../shared/school-data-sync.service';
import { AuthService, RegistrationSchool } from '../../../../core/auth';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';
import { apiError } from '../../../../shared/self-space/self-space.service';
import { APPOINTMENT_LABELS, ParentAppointment, ParentPortalService, PortalPost, PostKind } from '../../../../shared/self-space/parent-portal.service';
import { ConversationFiles } from '../../../../shared/self-space/message-attachments';
import { PortalPosts } from '../../../../shared/self-space/portal-posts';
import { ClassRecord, ClassRosterRow, OwnerManagementService } from '../../owner-management.service';

@Component({
  selector: 'app-owner-parent-portal', standalone: true,
  imports: [DatePipe, FormsModule, ConversationFiles, PortalPosts],
  templateUrl: './parent-portal.html', styleUrl: '../../../../shared/self-space/self-space.scss',
})
export class OwnerParentPortal implements OnInit {
  private readonly api = inject(ParentPortalService);
  private readonly management = inject(OwnerManagementService);
  private readonly auth = inject(AuthService);
  private readonly confirmation = inject(ConfirmationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly sync = inject(SchoolDataSyncService);
  private syncSubscription?: Subscription;
  readonly schools = signal<RegistrationSchool[]>([]);
  readonly schoolId = signal<number | null>(null);
  readonly classes = signal<ClassRecord[]>([]);
  readonly students = signal<ClassRosterRow[]>([]);
  readonly loadingStudents = signal(false);
  readonly posts = signal<PortalPost[]>([]);
  readonly appointments = signal<ParentAppointment[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly labels = APPOINTMENT_LABELS;
  readonly responses: Record<number, string> = {};
  kind: PostKind = 'ANNOUNCEMENT';
  classId: number | null = null;
  studentId: number | null = null;
  title = ''; content = ''; dueDate = '';
  files: File[] = [];
  private version = 0;
  ngOnInit(): void {
    const userId = this.auth.user()?.id;
    if (!userId) { this.loading.set(false); this.error.set('Compte introuvable.'); return; }
    this.auth.getOwnedSchools(userId, 'STUDENTS').pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: schools => {
        this.schools.set(schools);
        const stored = Number(localStorage.getItem('fasoecole_owner_school'));
        const school = schools.find(item => item.id === stored) ?? schools[0];
        if (school) this.selectSchool(school.id); else this.loading.set(false);
      }, error: err => { this.loading.set(false); this.error.set(apiError(err, 'Impossible de charger les établissements.')); },
    });
  }
  selectSchool(id: number): void {
    if (!this.schools().some(school => school.id === id)) return;
    this.syncSubscription?.unsubscribe();
    this.schoolId.set(id); this.auth.selectSchoolContext(id);
    this.classId = null; this.studentId = null; this.students.set([]); this.loadingStudents.set(false);
    this.title = ''; this.content = ''; this.dueDate = ''; this.files = [];
    this.classes.set([]); this.posts.set([]); this.appointments.set([]); this.reload();
    this.syncSubscription = this.sync.watch(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (!this.saving()) this.reload(true);
    });
  }
  chooseClass(classId: number | null): void {
    this.classId = classId; this.studentId = null; this.students.set([]);
    if (classId === null) { this.loadingStudents.set(false); return; }
    const schoolId = this.schoolId(); this.loadingStudents.set(true);
    this.management.getClassRoster(classId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: students => { if (this.schoolId() === schoolId && this.classId === classId) { this.students.set(students); this.loadingStudents.set(false); } },
      error: err => { if (this.schoolId() === schoolId && this.classId === classId) { this.loadingStudents.set(false); this.error.set(apiError(err, 'Impossible de charger les enfants de cette classe.')); } },
    });
  }
  reload(background = false): void {
    const id = this.schoolId(); if (id === null) return;
    const version = ++this.version;
    if (!background) { this.loading.set(true); this.error.set(null); }
    forkJoin({ classes: this.management.getClasses(id), posts: this.api.schoolPosts(id), appointments: this.api.schoolAppointments(id) })
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: data => {
          if (version !== this.version) return;
          this.classes.set(data.classes); this.posts.set(data.posts); this.appointments.set(data.appointments); this.loading.set(false);
        }, error: err => { if (version === this.version) { this.loading.set(false); this.error.set(apiError(err, 'Impossible de charger le portail parents.')); } },
      });
  }
  publish(): void {
    const id = this.schoolId(); if (id === null || this.saving()) return;
    if (!this.title.trim() || !this.content.trim() || (this.kind === 'DOCUMENT' && !this.files.length) || (this.kind === 'HOMEWORK' && (!this.classId || !this.dueDate))) {
      this.error.set('Complétez le titre et le contenu. Un devoir nécessite une classe et une date ; un document nécessite un fichier.'); return;
    }
    this.saving.set(true); this.error.set(null); this.success.set(null);
    this.api.publish(id, { kind: this.kind, classId: this.classId, studentId: this.studentId, title: this.title.trim(), content: this.content.trim(), dueDate: this.kind === 'HOMEWORK' ? this.dueDate || null : null }, this.files)
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: post => { this.saving.set(false); if (id !== this.schoolId()) return; this.posts.update(items => [post, ...items]); this.title = ''; this.content = ''; this.dueDate = ''; this.files = []; this.success.set('La publication est disponible dans l’espace parent.'); },
        error: err => { this.saving.set(false); this.error.set(apiError(err, 'Impossible de publier.')); },
      });
  }
  async deletePost(post: PortalPost): Promise<void> {
    const id = this.schoolId(); if (id === null || this.saving()) return;
    const confirmed = await this.confirmation.confirm({ title: 'Retirer cette publication ?', message: 'Elle ne sera plus accessible aux parents.', confirmLabel: 'Retirer' });
    if (!confirmed || id !== this.schoolId() || this.saving()) return;
    this.saving.set(true); this.error.set(null);
    this.api.delete(id, post.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.saving.set(false); if (id === this.schoolId()) this.posts.update(items => items.filter(item => item.id !== post.id)); },
      error: err => { this.saving.set(false); this.error.set(apiError(err, 'Impossible de retirer cette publication.')); },
    });
  }
  decide(appointment: ParentAppointment, status: 'ACCEPTED' | 'REJECTED'): void {
    const id = this.schoolId(); const response = this.responses[appointment.id]?.trim();
    if (id === null || this.saving()) return;
    if (!response) { this.error.set('Ajoutez une réponse précisant le lieu ou le motif du refus.'); return; }
    this.saving.set(true); this.error.set(null);
    this.api.decide(id, appointment.id, status, response).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.saving.set(false); if (id === this.schoolId()) { this.appointments.update(items => items.map(item => item.id === appointment.id ? { ...item, status, response } : item)); this.success.set('La réponse est disponible pour le parent.'); } },
      error: err => { this.saving.set(false); this.error.set(apiError(err, 'Impossible de traiter cette demande.')); },
    });
  }
}
