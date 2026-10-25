import { ErrorAlert } from '../error-alert';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { SchoolDataSyncService } from '../school-data-sync.service';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { SelectField, SelectOption } from '../ui/select-field';
import { LoadingState } from '../ui/loading-state';
import { ModuleHelpButton } from '../help/module-help-button';
import { HomeworkTracking } from '../school-life/homework-tracking';
import { apiError, SelfSpaceService, StudentOverview } from './self-space.service';
import { ParentPortalService, PortalPost } from './parent-portal.service';
import { FamilyLearning } from './family-learning';
import { PortalPosts } from './portal-posts';

@Component({
  selector: 'app-learning-resources-page', standalone: true,
  imports: [ErrorAlert, FamilyLearning, FormsModule, ButtonModule, MessageModule, SelectField, SelectOption, LoadingState, ModuleHelpButton, HomeworkTracking, PortalPosts],
  styleUrl: './self-space.scss',
  template: `
    <div class="ss ui-academic-blue">
      <header class="module-help-header ss__header"><app-module-help /><div>
        <h1>{{ homework() ? 'Devoirs de maison' : 'Cours et ressources' }}</h1>
        <p>{{ homework() ? 'Consignes, pièces jointes, dates de remise et retours du professeur.' : 'Supports de cours et exercices partagés avec votre classe.' }}</p>
      </div></header>
      @if (error()) { <app-error-alert [message]="error()" (dismissed)="error.set(null)">{{ error() }}</app-error-alert>
        @if (!students().length) { <button pButton type="button" (click)="loadStudents()" [disabled]="loading()">Réessayer</button> } }
      @if (students().length) {
        <label class="ss__field">Élève<app-select-field [ngModel]="studentId()" (ngModelChange)="choose(+$event)" ariaLabel="Élève">
          @for (student of students(); track student.studentId) { <app-select-option [value]="student.studentId" [label]="student.fullName + ' · ' + student.schoolName" /> }
        </app-select-field></label>
        <button pButton type="button" severity="secondary" variant="outlined" (click)="load()" [disabled]="loading()">Actualiser</button>
      }
      @if (loading()) { <app-loading-state message="Chargement…" /> }
      @else if (studentId(); as id) {
        <app-portal-posts [posts]="posts()" [scopeId]="id" />
        @if(!homework()){<app-family-learning [studentId]="id"/>}
        @if (homework()) { <app-homework-tracking scope="students" [contextId]="id" [revision]="posts()" /> }
      } @else if (!error()) { <p class="ss__state">Aucun élève accessible.</p> }
    </div>
  `,
})
export class LearningResourcesPage implements OnInit {
  private readonly self = inject(SelfSpaceService);
  private readonly portal = inject(ParentPortalService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroy = inject(DestroyRef);
  readonly students = signal<StudentOverview[]>([]);
  readonly studentId = signal<number | null>(null);
  readonly homework = signal(true);
  readonly posts = signal<PortalPost[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  private readonly sync = inject(SchoolDataSyncService);
  private syncSubscription?: Subscription;
  private version = 0;
  ngOnInit(): void {
    this.route.data.pipe(takeUntilDestroyed(this.destroy)).subscribe(data => { this.homework.set(data['resourceKind'] !== 'DOCUMENT'); if (this.studentId()) this.load(); });
    this.loadStudents();
  }
  loadStudents(): void {
    this.loading.set(true); this.error.set(null);
    this.self.myStudents().pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: students => { this.students.set(students); const id = Number(this.route.snapshot.queryParamMap.get('studentId'));
        this.studentId.set(students.find(student => student.studentId === id)?.studentId ?? students[0]?.studentId ?? null); this.watchSchool(); this.load(); },
      error: err => { this.loading.set(false); this.error.set(apiError(err, 'Impossible de charger les élèves accessibles.')); },
    });
  }
  choose(id: number): void { if (this.students().some(student => student.studentId === id)) { this.studentId.set(id); this.watchSchool(); this.load(); } }
  private watchSchool(): void {
    this.syncSubscription?.unsubscribe();
    const schoolId = this.students().find(student => student.studentId === this.studentId())?.schoolId;
    if (schoolId) this.syncSubscription = this.sync.watch(schoolId).pipe(takeUntilDestroyed(this.destroy)).subscribe(() => this.load(true));
  }
  load(background = false): void {
    const id = this.studentId(); const version = ++this.version;
    if (!background) { this.posts.set([]); this.error.set(null); }
    if (id === null) { this.loading.set(false); return; }
    if (!background) this.loading.set(true);
    this.portal.posts(id, this.homework() ? 'HOMEWORK' : 'DOCUMENT').pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: posts => { if (version === this.version) { this.posts.set(posts); this.loading.set(false); } },
      error: err => { if (version === this.version) { this.loading.set(false); this.error.set(apiError(err, 'Impossible de charger les publications.')); } },
    });
  }
}
