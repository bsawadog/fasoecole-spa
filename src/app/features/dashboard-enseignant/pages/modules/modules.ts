import { FormValidationDirective } from '../../../../shared/form-validation.directive';
import { DatePipe } from '@angular/common';
import { Component, computed, DestroyRef, effect, inject, OnInit, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { forkJoin, of, Subscription } from 'rxjs';
import { SchoolDataSyncService } from '../../../../shared/school-data-sync.service';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';
import { apiError, AbsenceReport, AttendanceItem, FAMILY_ATTENDANCE_LABELS, ScheduleEntry, SelfSpaceService, TeacherAttendanceItem, TeacherClass } from '../../../../shared/self-space/self-space.service';
import { APPOINTMENT_LABELS, ParentAppointment, ParentPortalService, PortalPost, PostKind } from '../../../../shared/self-space/parent-portal.service';
import { ConversationFiles } from '../../../../shared/self-space/message-attachments';
import { PortalPosts } from '../../../../shared/self-space/portal-posts';
import { ScheduleView } from '../../../../shared/self-space/schedule-view';

type Module = 'emploi' | 'presences' | 'signalements' | 'devoirs' | 'documents' | 'annonces' | 'rendez-vous';
type Status = AttendanceItem['status'];
const TITLES: Record<Module,string> = { emploi: 'Mon emploi du temps', presences: 'Présences et retards', signalements: 'Signalements des parents', devoirs: 'Devoirs', documents: 'Documents de classe', annonces: 'Annonces de classe', 'rendez-vous': 'Rendez-vous parents' };
const today = () => new Date(Date.now()-new Date().getTimezoneOffset()*60_000).toISOString().slice(0,10);

@Component({
  selector: 'app-teacher-module', standalone: true,
  imports: [FormValidationDirective, DatePipe, FormsModule, ConversationFiles, PortalPosts, ScheduleView],
  templateUrl: './modules.html', styleUrl: '../../../../shared/self-space/self-space.scss',
})
export class TeacherModule implements OnInit {
  private readonly api = inject(SelfSpaceService);
  private readonly portal = inject(ParentPortalService);
  private readonly route = inject(ActivatedRoute);
  private readonly confirmation = inject(ConfirmationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly sync = inject(SchoolDataSyncService);
  private syncSubscription?: Subscription;
  readonly module = signal<Module>('emploi');
  readonly title = computed(() => TITLES[this.module()]);
  readonly classes = signal<TeacherClass[]>([]);
  readonly classId = signal<number | null>(null);
  readonly selected = computed(() => this.classes().find(item => item.classId === this.classId()));
  readonly loadingClasses = signal(true);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly schedule = signal<ScheduleEntry[]>([]);
  readonly attendance = signal<TeacherAttendanceItem[]>([]);
  readonly reports = signal<AbsenceReport[]>([]);
  readonly posts = signal<PortalPost[]>([]);
  readonly appointments = signal<ParentAppointment[]>([]);
  readonly filter = signal('');
  readonly date = signal(today());
  readonly today = today();
  readonly familyLabels = FAMILY_ATTENDANCE_LABELS;
  readonly appointmentLabels = APPOINTMENT_LABELS;
  readonly attendanceLabels: Record<Status,string> = { PRESENT: 'Présent', ABSENT: 'Absent', LATE: 'En retard', EXCUSED: 'Absence excusée' };
  readonly attendanceStatuses: Status[] = ['PRESENT','ABSENT','LATE','EXCUSED'];
  readonly kind = computed<PostKind | null>(() => ({ devoirs: 'HOMEWORK', documents: 'DOCUMENT', annonces: 'ANNOUNCEMENT' } as Partial<Record<Module,PostKind>>)[this.module()] ?? null);
  readonly filteredAttendance = computed(() => {
    const normalize = (value: string) => value.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
    const terms = normalize(this.filter()).trim().split(/\s+/).filter(Boolean);
    return this.attendance().filter(row => terms.every(term => normalize(`${row.fullName} ${row.registrationNumber}`).includes(term)));
  });
  attendanceDrafts: Record<number,{status: Status | ''; justification: string}> = {};
  responses: Record<number,string> = {};
  postTitle = ''; content = ''; dueDate = ''; files: File[] = [];
  private version = 0;
  private refreshPending = false;

  constructor() {
    effect(() => {
      if (!this.saving() && this.refreshPending) {
        this.refreshPending = false;
        untracked(() => this.reload(true));
      }
    });
  }

  ngOnInit(): void {
    this.route.data.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(data => { this.module.set(data['module'] as Module); this.reload(); });
    this.api.teacherClasses().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: classes => {
        this.classes.set(classes); this.loadingClasses.set(false);
        const id = Number(this.route.snapshot.queryParamMap.get('classe'));
        this.classId.set(classes.find(item => item.classId === id)?.classId ?? classes[0]?.classId ?? null); this.reload(); this.watchSchool();
      }, error: err => { this.loadingClasses.set(false); this.error.set(apiError(err, 'Impossible de charger vos classes.')); },
    });
  }
  choose(value: string): void {
    const id = Number(value); if (!this.classes().some(item => item.classId === id)) return;
    this.classId.set(id); this.filter.set(''); this.postTitle = ''; this.content = ''; this.dueDate = ''; this.files = []; this.reload(); this.watchSchool();
  }
  private watchSchool(): void {
    this.syncSubscription?.unsubscribe(); const schoolId = this.selected()?.schoolId;
    if (schoolId) this.syncSubscription = this.sync.watch(schoolId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (this.saving()) this.refreshPending = true;
      else this.reload(true);
    });
  }
  changeDate(date: string): void { this.date.set(date); this.reload(); }
  reload(background = false): void {
    if (this.loadingClasses()) return;
    const id = this.classId(); const module = this.module();
    if (module !== 'emploi' && id === null) return;
    const version = ++this.version; const kind = this.kind();
    if (!background) {
      this.loading.set(true); this.error.set(null); this.success.set(null);
      this.attendance.set([]); this.reports.set([]); this.posts.set([]); this.appointments.set([]); this.attendanceDrafts = {};
    }
    forkJoin({
      schedule: module === 'emploi' ? this.api.teacherSchedule() : of([] as ScheduleEntry[]),
      attendance: module === 'presences' && id !== null ? this.api.teacherAttendance(id,this.date()) : of([] as TeacherAttendanceItem[]),
      reports: module === 'signalements' && id !== null ? this.api.teacherFamilyReports(id,this.date()) : of([] as AbsenceReport[]),
      posts: kind && id !== null ? this.portal.teacherPosts(id,kind) : of([] as PortalPost[]),
      appointments: module === 'rendez-vous' && id !== null ? this.portal.teacherAppointments(id) : of([] as ParentAppointment[]),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: data => {
        if (version !== this.version) return;
        const previous = new Map(this.attendance().map(row => [row.studentId,row]));
        for (const row of data.attendance) {
          const old = previous.get(row.studentId); const draft = this.attendanceDrafts[row.studentId];
          const dirty = background && old && draft && (draft.status !== (old.status ?? '') || draft.justification !== (old.justification ?? ''));
          if (!dirty) this.attendanceDrafts[row.studentId] = {status: row.status ?? '', justification: row.justification ?? ''};
        }
        this.schedule.set(data.schedule); this.attendance.set(data.attendance); this.reports.set(data.reports); this.posts.set(data.posts); this.appointments.set(data.appointments);
        this.loading.set(false);
      }, error: err => { if (version === this.version) { this.loading.set(false); this.error.set(apiError(err, 'Impossible de charger ces informations.')); } },
    });
  }
  saveAttendance(row: TeacherAttendanceItem): void {
    const id = this.classId(); const draft = this.attendanceDrafts[row.studentId]; const version = this.version;
    if (id === null || !draft?.status || this.saving()) return;
    this.saving.set(true); this.error.set(null); this.success.set(null);
    const payload = { date: this.date(), status: draft.status, justification: draft.justification.trim() || null };
    this.api.saveTeacherAttendance(id,row.studentId,payload).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.saving.set(false); if (version !== this.version) return; this.attendance.update(items => items.map(item => item.studentId === row.studentId ? {...item,status: payload.status,justification: payload.justification} : item)); this.success.set(`Présence enregistrée pour ${row.fullName}.`); },
      error: err => { this.saving.set(false); if (version === this.version) this.error.set(apiError(err, 'Impossible d’enregistrer la présence.')); },
    });
  }
  record(report: AbsenceReport): void {
    const id = this.classId(); const version = this.version; if (id === null || this.saving()) return;
    this.saving.set(true); this.error.set(null); this.success.set(null);
    this.api.recordTeacherFamilyReport(id,report.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.saving.set(false); if (version !== this.version) return; this.reports.update(items => items.filter(item => item.id !== report.id)); this.success.set(`${this.familyLabels[report.attendanceType]} enregistré pour ${report.studentName}. Le signalement est pris en compte.`); },
      error: err => { this.saving.set(false); if (version === this.version) this.error.set(apiError(err, 'Impossible de traiter ce signalement.')); },
    });
  }
  publish(): void {
    const id = this.classId(); const kind = this.kind(); const version = this.version;
    if (id === null || !kind || this.saving()) return;
    if (!this.postTitle.trim() || !this.content.trim() || (kind === 'DOCUMENT' && !this.files.length) || (kind === 'HOMEWORK' && !this.dueDate)) {
      this.error.set('Complétez le titre, le contenu et la date de remise du devoir ou le fichier du document.'); return;
    }
    this.saving.set(true); this.error.set(null); this.success.set(null);
    this.portal.teacherPublish(id,{kind,title: this.postTitle.trim(),content: this.content.trim(),dueDate: kind === 'HOMEWORK' ? this.dueDate : null},this.files)
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: post => { this.saving.set(false); if (version !== this.version) return; this.posts.update(items => [post,...items]); this.postTitle = ''; this.content = ''; this.dueDate = ''; this.files = []; this.success.set('Publication disponible dans l’espace parent pour cette classe.'); },
        error: err => { this.saving.set(false); if (version === this.version) this.error.set(apiError(err, 'Impossible de publier.')); },
      });
  }
  async remove(post: PortalPost): Promise<void> {
    const id = this.classId(); const version = this.version; if (id === null || this.saving()) return;
    if (!await this.confirmation.confirm({title:'Retirer cette publication ?',message:'Elle ne sera plus visible par les parents.',confirmLabel:'Retirer',destructive:true})) return;
    if (version !== this.version || this.saving()) return;
    this.saving.set(true); this.error.set(null);
    this.portal.teacherDelete(id,post.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.saving.set(false); if (version === this.version) this.posts.update(items => items.filter(item => item.id !== post.id)); },
      error: err => { this.saving.set(false); if (version === this.version) this.error.set(apiError(err, 'Impossible de retirer cette publication.')); },
    });
  }
  decide(appointment: ParentAppointment, status: 'ACCEPTED' | 'REJECTED'): void {
    const id = this.classId(); const version = this.version; const response = this.responses[appointment.id]?.trim();
    if (id === null || this.saving()) return;
    if (!response) { this.error.set('Indiquez le lieu de rencontre ou le motif du refus.'); return; }
    this.saving.set(true); this.error.set(null);
    this.portal.teacherDecide(id,appointment.id,status,response).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.saving.set(false); if (version !== this.version) return; this.appointments.update(items => items.map(item => item.id === appointment.id ? {...item,status,response} : item)); this.success.set('La réponse est disponible pour le parent.'); },
      error: err => { this.saving.set(false); if (version === this.version) this.error.set(apiError(err, 'Impossible de répondre à cette demande.')); },
    });
  }
}
