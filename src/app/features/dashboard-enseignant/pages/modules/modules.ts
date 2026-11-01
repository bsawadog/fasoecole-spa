import { ErrorAlert } from '../../../../shared/error-alert';
import { ModuleHelpButton } from '../../../../shared/help/module-help-button';
import { TooltipModule } from 'primeng/tooltip';
import { DateField } from '../../../../shared/ui/date-field';
import { SelectField } from '../../../../shared/ui/select-field';
import { SelectOption } from '../../../../shared/ui/select-field';
import { LoadingState } from '../../../../shared/ui/loading-state';
import { TableRow } from '../../../../shared/ui/table-row';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { FormValidationDirective } from '../../../../shared/form-validation.directive';
import { Component, computed, DestroyRef, effect, inject, OnInit, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { forkJoin, of, Subscription } from 'rxjs';
import { SchoolDataSyncService } from '../../../../shared/school-data-sync.service';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';
import { apiError, AbsenceReport, AttendanceItem, FAMILY_ATTENDANCE_LABELS, ScheduleEntry, SelfSpaceService, TeacherAttendanceItem, TeacherClass } from '../../../../shared/self-space/self-space.service';
import { APPOINTMENT_LABELS, ParentAppointment, ParentPortalService, PortalPost, PostKind } from '../../../../shared/self-space/parent-portal.service';
import { ConversationFiles } from '../../../../shared/self-space/message-attachments';
import { PortalPosts } from '../../../../shared/self-space/portal-posts';
import { ScheduleView } from '../../../../shared/self-space/schedule-view';
import { TeacherDailyTools } from '../../../../shared/self-space/teacher-daily-tools';
import { HomeworkTracking } from '../../../../shared/school-life/homework-tracking';
import { Appointments } from '../../../../shared/appointments/appointments';
import { OfflineAttendanceService, OfflineEntry } from '../../../../shared/offline/offline-attendance.service';
import { OfflineAttendancePanel } from '../../../../shared/offline/offline-attendance-panel';
import { packMessage } from '../../../../shared/offline/message-outbox';
import { LocalPublication, PublicationPayload } from '../../../../shared/offline/publication-outbox';
import { AuthService } from '../../../../core/auth';

type Module = 'emploi' | 'presences' | 'signalements' | 'devoirs' | 'documents' | 'annonces' | 'rendez-vous';
type Status = AttendanceItem['status'];
const TITLES: Record<Module,string> = { emploi: 'Mon emploi du temps', presences: 'Présences et retards', signalements: 'Signalements des parents', devoirs: 'Devoirs de maison', documents: 'Cours et ressources', annonces: 'Annonces de classe', 'rendez-vous': 'Rendez-vous parents' };
const today = () => new Date(Date.now()-new Date().getTimezoneOffset()*60_000).toISOString().slice(0,10);

@Component({
  selector: 'app-teacher-module', standalone: true,
  imports: [OfflineAttendancePanel, ErrorAlert, TeacherDailyTools, HomeworkTracking, ModuleHelpButton, TooltipModule, DateField, SelectField, SelectOption, TableRow, LoadingState, InputTextModule, TextareaModule, ButtonModule, MessageModule, TableModule, FormValidationDirective, FormsModule, ConversationFiles, PortalPosts, ScheduleView, Appointments],
  templateUrl: './modules.html', styleUrl: '../../../../shared/self-space/self-space.scss',
})
export class TeacherModule implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly publicationUserId = this.auth.user()?.id;
  readonly offline = inject(OfflineAttendanceService);
  readonly pendingCall = computed(() => this.offline.pending().find(call => call.classId === this.classId() && call.date === this.date()));
  private readonly api = inject(SelfSpaceService);
  private readonly portal = inject(ParentPortalService);
  private readonly route = inject(ActivatedRoute);
  private readonly confirmation = inject(ConfirmationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly sync = inject(SchoolDataSyncService);
  private syncSubscription?: Subscription;
  readonly lessonsOpen=signal(false);
  readonly availabilityOpen=signal(false);
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
  readonly attendanceMaxDate = computed(() => {
    const end = this.selected()?.academicYearEndDate;
    return end && end < this.today ? end : this.today;
  });
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
  readonly draftStatus = signal<string | null>(null);
  readonly localPublications = computed(() => this.offline.publications().filter(item => item.payload.classId === this.classId() && item.payload.kind === this.kind()));
  private draftId: string | null = null;
  private draftTimer?: ReturnType<typeof setTimeout>;
  private draftSave: Promise<void> = Promise.resolve();
  private version = 0;
  private refreshPending = false;
  private displayedPending: string | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => { clearTimeout(this.draftTimer); if (!this.saving()) this.persistDraft(); });
    effect(() => {
      this.offline.revision();
      if (this.offline.unlocked() && this.module() === 'presences' && this.classId() !== null) untracked(() => this.restoreOfflineCall());
    });
    effect(() => {
      const unlocked = this.offline.unlocked();
      untracked(() => {
        if (this.module() !== 'presences') return;
        if (!unlocked && this.offline.enabled()) { this.attendance.set([]); this.attendanceDrafts = {}; }
        if (unlocked && !this.loadingClasses()) {
          if (this.classes().length) { this.offline.rememberClasses(this.classes()); this.reload(true); }
          else this.loadClasses();
        }
      });
    });
    effect(() => {
      if (this.offline.unlocked() && this.module() === 'presences' && !this.loading() && this.attendance().length) {
        const schoolId = this.selected()?.schoolId, id = this.classId(), date = this.date(), rows = this.attendance();
        if (schoolId && id) untracked(() => { void this.offline.remember(schoolId, id, date, rows).catch(err => this.error.set(apiError(err, 'Impossible de conserver cet appel sur l’appareil.'))); });
      }
    });
    effect(() => {
      if (!this.saving() && this.refreshPending) {
        this.refreshPending = false;
        untracked(() => this.reload(true));
      }
    });
  }

  ngOnInit(): void {
    this.route.data.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(data => {
      if (this.module() !== data['module']) {
        clearTimeout(this.draftTimer); this.persistDraft(); this.draftId = null;
        this.postTitle = ''; this.content = ''; this.dueDate = ''; this.files = []; this.draftStatus.set(null);
      }
      this.module.set(data['module'] as Module); this.reload();
    });
    this.loadClasses();
  }
  private loadClasses(): void {
    this.loadingClasses.set(true);
    this.error.set(null);
    if (this.offline.enabled() && !this.offline.online()) {
      const cached = this.offline.cachedClasses();
      if (cached.length || !this.offline.unlocked()) { this.acceptClasses(cached); return; }
    }
    this.api.teacherClasses().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: classes => {
        if (this.offline.unlocked()) this.offline.rememberClasses(classes);
        this.acceptClasses(classes);
      }, error: err => {
        const cached = this.offline.enabled() ? this.offline.cachedClasses() : [];
        if (cached.length && !err?.status) { this.acceptClasses(cached); return; }
        this.loadingClasses.set(false);
        if (!(this.offline.enabled() && !this.offline.online())) this.error.set(apiError(err, 'Impossible de charger vos classes.'));
      },
    });
  }
  private acceptClasses(classes: TeacherClass[]): void {
    this.error.set(null);
    this.classes.set(classes); this.loadingClasses.set(false);
    const view = this.offline.enabled() ? this.offline.cachedView() : null;
    const requested = Number(this.route.snapshot.queryParamMap.get('classe'));
    const id = classes.find(item => item.classId === requested)?.classId
      ?? classes.find(item => item.classId === view?.classId)?.classId ?? classes[0]?.classId ?? null;
    this.classId.set(id);
    if (this.module() === 'presences' && view?.classId === id) this.date.set(view.date);
    this.reload(); this.watchSchool();
  }
  choose(value: string): void {
    const id = Number(value); if (!this.classes().some(item => item.classId === id)) return;
    clearTimeout(this.draftTimer); this.persistDraft(); this.draftId = null; this.draftStatus.set(null);
    this.classId.set(id); this.filter.set(''); this.postTitle = ''; this.content = ''; this.dueDate = ''; this.files = []; this.reload(); this.watchSchool();
  }
  private watchSchool(): void {
    this.syncSubscription?.unsubscribe(); const schoolId = this.selected()?.schoolId;
    const domains = this.module() === 'presences' || this.module() === 'signalements' ? ['attendance', 'structure']
      : this.module() === 'emploi' || this.module() === 'rendez-vous' ? ['calendar', 'structure'] : ['resources', 'structure'];
    if (schoolId) this.syncSubscription = this.sync.watch(schoolId, domains).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (this.saving()) this.refreshPending = true;
      else this.reload(true);
    });
  }
  changeDate(date: string): void { this.date.set(date); this.reload(); }
  reload(background = false): void {
    if (this.loadingClasses()) return;
    const id = this.classId(); const module = this.module();
    if (module === 'presences' && id !== null && this.offline.unlocked()) this.offline.rememberView(id, this.date());
    if (module === 'presences' && this.offline.unlocked() && (!this.offline.online() || this.pendingCall())) { this.restoreOfflineCall(!background); return; }
    if (module === 'presences' && this.offline.enabled() && !this.offline.unlocked() && !this.offline.online()) { this.loading.set(false); this.error.set(null); return; }
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
          const dirty = background && old && draft && (draft.status !== (old.status ?? 'PRESENT') || draft.justification !== (old.justification ?? ''));
          if (!dirty) this.attendanceDrafts[row.studentId] = {status: row.status ?? 'PRESENT', justification: row.justification ?? ''};
        }
        this.schedule.set(data.schedule); this.attendance.set(data.attendance); this.reports.set(data.reports); this.posts.set(data.posts); this.appointments.set(data.appointments);
        this.loading.set(false);
      }, error: err => { if (version === this.version) { this.loading.set(false); this.error.set(apiError(err, 'Impossible de charger ces informations.')); } },
    });
  }
  saveCall(): void {
    const id=this.classId();const version=this.version;
    if(id===null || this.saving() || this.loading() || !this.attendance().length)return;
    if (!this.validAttendanceDate()) return;
    const entries=this.attendance().filter(row=>{
      const draft=this.attendanceDrafts[row.studentId];
      return draft && (row.status===null || draft.status!==row.status || (draft.justification.trim()||null)!==(row.justification||null));
    }).map(row=>({studentId:row.studentId,status:this.attendanceDrafts[row.studentId].status,justification:this.attendanceDrafts[row.studentId].justification.trim()||null,expectedStatus:row.status}));
    if(!entries.length){this.success.set('L’appel est déjà enregistré.');return;}
    if(entries.some(entry=>!entry.status)){this.error.set('Choisissez un statut pour chaque élève avant d’enregistrer l’appel.');return;}
    if (this.offline.enabled()) { void this.saveOffline(entries as OfflineEntry[]); return; }
    this.saving.set(true);this.error.set(null);this.success.set(null);
    this.api.saveTeacherAttendanceBatch(id,{date:this.date(),entries:entries as {studentId:number;status:Status;justification:string|null;expectedStatus:Status|null}[]}).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next:rows=>{this.saving.set(false);if(version!==this.version)return;this.attendance.set(rows);for(const row of rows)this.attendanceDrafts[row.studentId]={status:row.status??'PRESENT',justification:row.justification??''};this.success.set('Appel enregistré pour toute la classe.');},
      error:err=>{this.saving.set(false);if(version===this.version)this.error.set(apiError(err,'Impossible d’enregistrer l’appel. Vos modifications sont conservées.'));},
    });
  }
  saveAttendance(row: TeacherAttendanceItem): void {
    const id = this.classId(); const draft = this.attendanceDrafts[row.studentId]; const version = this.version;
    if (id === null || !draft?.status || this.saving()) return;
    if (!this.validAttendanceDate()) return;
    if (this.offline.enabled()) { void this.saveOffline([{ studentId: row.studentId, status: draft.status, justification: draft.justification.trim() || null } as OfflineEntry]); return; }
    this.saving.set(true); this.error.set(null); this.success.set(null);
    const payload = { date: this.date(), status: draft.status, justification: draft.justification.trim() || null };
    this.api.saveTeacherAttendance(id,row.studentId,payload).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.saving.set(false); if (version !== this.version) return; this.attendance.update(items => items.map(item => item.studentId === row.studentId ? {...item,status: payload.status,justification: payload.justification} : item)); this.success.set(`Présence enregistrée pour ${row.fullName}.`); },
      error: err => { this.saving.set(false); if (version === this.version) this.error.set(apiError(err, 'Impossible d’enregistrer la présence.')); },
    });
  }
  private validAttendanceDate(): boolean {
    const date = this.date(), cls = this.selected();
    let message: string | null = null;
    if (!date || date > today()) message = 'Choisissez une date passée ou actuelle pour cet appel.';
    if (cls?.academicYearStartDate && cls.academicYearEndDate && (date < cls.academicYearStartDate || date > cls.academicYearEndDate))
      message = `La date de cet appel (${date}) doit être comprise entre le ${cls.academicYearStartDate} et le ${cls.academicYearEndDate}, dans l’année scolaire ${cls.academicYearLabel}.`;
    if (message) { this.success.set(null); this.error.set(message); return false; }
    return true;
  }
  private restoreOfflineCall(force = false): void {
    const id = this.classId(), school = this.selected()?.schoolId;
    if (!id || !school) return;
    const snapshot = this.offline.snapshot(school, id, this.date());
    if (!snapshot) {
      if (!this.offline.online()) { this.attendance.set([]); this.attendanceDrafts = {}; this.loading.set(false); this.error.set('Cet appel n’a pas été téléchargé. Reconnectez-vous pour charger cette date.'); }
      return;
    }
    const call = this.pendingCall();
    const previous = new Map(this.attendance().map(row => [row.studentId, row]));
    const changed = JSON.stringify(this.attendance()) !== JSON.stringify(snapshot.rows);
    if (changed || call || force || this.displayedPending && !call) {
      if (changed) this.attendance.set(snapshot.rows);
      for (const row of snapshot.rows) {
        const old = this.attendanceDrafts[row.studentId], original = previous.get(row.studentId);
        const dirty = !force && old && original && (old.status !== (original.status ?? 'PRESENT') || old.justification !== (original.justification ?? ''));
        if (!dirty) this.attendanceDrafts[row.studentId] = { status: row.status ?? 'PRESENT', justification: row.justification ?? '' };
      }
    }
    this.displayedPending = call?.operationId ?? null;
    this.loading.set(false);
  }
  private async saveOffline(entries: OfflineEntry[]): Promise<void> {
    const id = this.classId(), school = this.selected()?.schoolId, date = this.date();
    if (!id || !school) return;
    if (!this.offline.unlocked()) { this.error.set('Reconnectez-vous avec Internet pour déverrouiller le stockage local.'); return; }
    const version = this.version;
    this.saving.set(true); this.error.set(null); this.success.set(null);
    try {
      await this.offline.queue(school, id, date, this.attendance(), entries.map(entry => {
        const original = this.attendance().find(row => row.studentId === entry.studentId)!;
        return { ...entry, expectedStatus: original.status, expectedJustification: original.justification, expectedVersion: original.version ?? null };
      }), { className: this.selected()?.className, schoolName: this.selected()?.schoolName });
      if (version === this.version) {
        this.restoreOfflineCall();
        this.success.set(this.pendingCall() ? 'Appel conservé sur cet appareil. Envoi en attente de synchronisation.' : 'Appel enregistré pour toute la classe.');
      }
    } catch (err) { this.error.set(apiError(err, 'La conservation locale a échoué. Gardez cette page ouverte et réessayez.')); }
    finally { this.saving.set(false); }
  }
  record(report: AbsenceReport): void {
    const id = this.classId(); const version = this.version; if (id === null || this.saving()) return;
    this.saving.set(true); this.error.set(null); this.success.set(null);
    this.api.recordTeacherFamilyReport(id,report.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.saving.set(false); if (version !== this.version) return; this.reports.update(items => items.filter(item => item.id !== report.id)); this.success.set(`${this.familyLabels[report.attendanceType]} enregistré pour ${report.studentName}. Le signalement est pris en compte.`); },
      error: err => { this.saving.set(false); if (version === this.version) this.error.set(apiError(err, 'Impossible de traiter ce signalement.')); },
    });
  }
  draftChanged(): void {
    if (!this.offline.enabled() || !this.offline.unlocked() || !this.kind()) return;
    this.draftStatus.set('Conservation du brouillon…');
    clearTimeout(this.draftTimer);
    this.draftTimer = setTimeout(() => this.persistDraft(), 700);
  }
  private publication(draft: boolean): { item: LocalPublication; files: File[] } | null {
    const classId = this.classId(), kind = this.kind();
    const userId = this.auth.user()?.id;
    if (!userId || userId !== this.publicationUserId || !classId || !kind) return null;
    const payload: PublicationPayload = { kind, classId, studentId: null, title: this.postTitle, content: this.content, dueDate: kind === 'HOMEWORK' ? this.dueDate || null : null };
    const operationId = this.draftId ??= crypto.randomUUID();
    return { item: { operationId, userId, payload, draft, path: `/me/teacher/classes/${classId}/portal/posts`, files: [],
      className: this.selected()?.className ?? '', subject: payload.title || 'Sans titre', role: 'enseignant',
      school: String(this.selected()?.schoolId ?? ''), year: String(this.selected()?.academicYearId ?? ''), createdAt: new Date().toISOString() }, files: [...this.files] };
  }
  private persistDraft(): void {
    if (!this.offline.enabled() || !this.offline.unlocked() || (!this.draftId && !this.postTitle && !this.content && !this.files.length && !this.dueDate)) return;
    const snapshot = this.publication(true); if (!snapshot) return;
    this.draftSave = this.draftSave.then(async () => {
      const body = new FormData(); body.append('request', new Blob([JSON.stringify(snapshot.item.payload)], { type: 'application/json' }));
      snapshot.files.forEach(file => body.append('files', file));
      snapshot.item.files = (await packMessage(body)).files;
      await this.offline.savePublication(snapshot.item);
      if (this.draftId === snapshot.item.operationId) this.draftStatus.set('Brouillon conservé sur cet appareil · non publié.');
    }).catch(err => this.draftStatus.set(apiError(err, 'Brouillon non conservé. Gardez cette page ouverte.')));
  }
  async editLocal(item: LocalPublication): Promise<void> {
    if (this.saving()) return;
    clearTimeout(this.draftTimer); this.persistDraft(); await this.draftSave;
    try {
      await this.offline.savePublication({ ...item, draft: true, issue: undefined });
      this.draftId = item.operationId; this.postTitle = item.payload.title; this.content = item.payload.content; this.dueDate = item.payload.dueDate ?? '';
      this.files = item.files.map(file => new File([Uint8Array.from(atob(file.data), c => c.charCodeAt(0))], file.name, { type: file.type }));
      this.draftStatus.set('Brouillon chargé · non publié.');
    } catch (err) { this.error.set(apiError(err, 'Impossible de modifier cet envoi.')); }
  }
  async cancelLocal(item: LocalPublication): Promise<void> {
    if (!await this.confirmation.confirm({ title: 'Supprimer la publication locale ?', message: 'Ce contenu et ses pièces jointes seront supprimés de cet appareil.', confirmLabel: 'Supprimer', destructive: true })) return;
    try {
      clearTimeout(this.draftTimer); await this.draftSave;
      await this.offline.removePublication(item.operationId);
      if (this.draftId === item.operationId) { this.draftId = null; this.postTitle = ''; this.content = ''; this.files = []; this.dueDate = ''; this.draftStatus.set(null); }
    } catch (err) { this.error.set(apiError(err, 'Impossible de supprimer cet envoi.')); }
  }
  async retryLocal(item: LocalPublication): Promise<void> {
    try { await this.offline.retryPublication(item.operationId); }
    catch (err) { this.error.set(apiError(err, 'Impossible de relancer la publication.')); }
  }
  async publish(form?: NgForm): Promise<void> {
    const id = this.classId(); const kind = this.kind(); const version = this.version;
    if (id === null || !kind || this.saving()) return;
    if (!this.postTitle.trim() || !this.content.trim() || (kind === 'DOCUMENT' && !this.files.length) || (kind === 'HOMEWORK' && !this.dueDate)) {
      this.error.set('Complétez le titre, le contenu et la date de remise du devoir ou le fichier du document.'); return;
    }
    this.saving.set(true); this.error.set(null); this.success.set(null);
    if (this.offline.enabled()) {
      clearTimeout(this.draftTimer);
      try {
        await this.draftSave;
        const snapshot = this.publication(false);
        if (!snapshot) throw new Error('La session a changé. Reconnectez-vous avant de publier.');
        const body = new FormData(); body.append('request', new Blob([JSON.stringify(snapshot.item.payload)], { type: 'application/json' }));
        snapshot.files.forEach(file => body.append('files', file));
        snapshot.item.files = (await packMessage(body)).files;
        await this.offline.savePublication(snapshot.item);
        this.draftId = null; this.postTitle = ''; this.content = ''; this.dueDate = ''; this.files = []; form?.resetForm(); this.draftStatus.set(null);
        this.success.set('Publication conservée sur cet appareil · en attente d’envoi. Elle n’est pas encore visible par les élèves.');
        if (this.offline.online()) await this.offline.synchronize();
        if (this.offline.publicationConfirmed(snapshot.item.operationId)) { this.success.set('Publication confirmée par le serveur.'); this.reload(true); }
      } catch (err) { this.error.set(apiError(err, 'Impossible de conserver la publication. Votre saisie reste dans le formulaire.')); }
      finally { this.saving.set(false); }
      return;
    }
    this.portal.teacherPublish(id,{kind,title: this.postTitle.trim(),content: this.content.trim(),dueDate: kind === 'HOMEWORK' ? this.dueDate : null},this.files)
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: post => { this.saving.set(false); if (version !== this.version) return; this.posts.update(items => [post,...items]); this.postTitle = ''; this.content = ''; this.dueDate = ''; this.files = []; form?.resetForm(); this.success.set('Publication disponible dans les espaces des parents et des élèves de cette classe.'); },
        error: err => { this.saving.set(false); if (version === this.version) this.error.set(apiError(err, 'Impossible de publier.')); },
      });
  }
  async remove(post: PortalPost): Promise<void> {
    const id = this.classId(); const version = this.version; if (id === null || this.saving()) return;
    if (!await this.confirmation.confirm({title:'Retirer cette publication ?',message:'Elle ne sera plus visible par les parents et les élèves.',confirmLabel:'Retirer',destructive:true})) return;
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
