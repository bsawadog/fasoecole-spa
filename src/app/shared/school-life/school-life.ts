import { DatePipe } from '@angular/common';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { AuthService } from '../../core/auth';
import { ConfirmationService } from '../confirmation/confirmation.service';
import { apiError, SelfSpaceService } from '../self-space/self-space.service';
import { FormValidationDirective } from '../form-validation.directive';
import { CalendarEvent, DocumentRequest, HomeworkProgress, LibraryLoan, LifeModule, LifeOverview, LifeScope,
  LIFE_LABELS, LIFE_TITLES, Observation, SchoolLifeService } from './school-life.service';

const empty = (): LifeOverview => ({ students: [], events: [], observations: [], requests: [], books: [], loans: [], homeworks: [] });

@Component({
  selector: 'app-school-life', standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, FormValidationDirective],
  templateUrl: './school-life.html', styleUrls: ['../self-space/self-space.scss', './school-life.scss'],
})
export class SchoolLifePage implements OnInit {
  private readonly api = inject(SchoolLifeService);
  private readonly self = inject(SelfSpaceService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroy = inject(DestroyRef);
  private readonly confirmation = inject(ConfirmationService);
  readonly module = signal<LifeModule>('calendrier');
  readonly title = computed(() => LIFE_TITLES[this.module()]);
  readonly scope = signal<LifeScope>('students');
  readonly contextId = signal<number | null>(null);
  readonly contexts = signal<{ id: number; name: string }[]>([]);
  readonly data = signal<LifeOverview>(empty());
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly owner = computed(() => this.scope() === 'schools');
  readonly teacher = computed(() => this.scope() === 'classes');
  readonly canObserve = computed(() => this.owner() || this.teacher());
  readonly labels = LIFE_LABELS;
  readonly authRole = this.auth.user()?.role;
  readonly today = new Date().toLocaleDateString('en-CA');
  readonly classChoices = computed(() => [...new Map(this.data().students.map(s => [s.classId, { id: s.classId, name: s.className }])).values()]);
  readonly visibleBooks = computed(() => {
    const query = this.bookSearch().trim().toLocaleLowerCase();
    return this.data().books.filter(book => `${book.title} ${book.author} ${book.reference}`.toLocaleLowerCase().includes(query));
  });
  readonly bookSearch = signal('');
  event = { classId: null as number | null, title: '', description: '', kind: 'EVENT', startsOn: '', endsOn: '' };
  observation = { studentId: null as number | null, kind: 'INCIDENT', observedOn: this.today, description: '', action: '', sharedWithFamily: false };
  document = { kind: 'SCHOOL_CERTIFICATE', reason: '' };
  book = { title: '', author: '', reference: '', copies: 1 };
  loan = { bookId: null as number | null, studentId: null as number | null, dueOn: '' };
  responses: Record<number, string> = {};
  observationActions: Record<number, string> = {};
  feedback: Record<string, string> = {};
  statuses: Record<string, string> = {};
  private version = 0;

  ngOnInit(): void {
    this.route.data.pipe(takeUntilDestroyed(this.destroy)).subscribe(route => {
      this.module.set(route['lifeModule'] as LifeModule);
      this.scope.set(route['lifeScope'] as LifeScope);
      this.loadContexts();
    });
  }
  private loadContexts(): void {
    this.contexts.set([]); this.contextId.set(null); this.data.set(empty()); this.loading.set(true);
    const version = ++this.version;
    if (this.owner()) {
      const userId = this.auth.user()?.id;
      if (!userId) { this.loading.set(false); return; }
      this.auth.getOwnedSchools(userId, 'STUDENTS').pipe(takeUntilDestroyed(this.destroy)).subscribe({
        next: schools => { if (version === this.version) this.initialize(schools); },
        error: err => this.contextFailure(err, version),
      });
    } else if (this.teacher()) {
      this.self.teacherClasses().pipe(takeUntilDestroyed(this.destroy)).subscribe({
        next: classes => { if (version === this.version) this.initialize(classes.filter(c => c.currentYear).map(c => ({ id: c.classId, name: `${c.className} · ${c.schoolName}` }))); },
        error: err => this.contextFailure(err, version),
      });
    } else {
      this.self.myStudents().pipe(takeUntilDestroyed(this.destroy)).subscribe({
        next: children => { if (version === this.version) this.initialize(children.map(c => ({ id: c.studentId, name: `${c.fullName} · ${c.schoolName}` }))); },
        error: err => this.contextFailure(err, version),
      });
    }
  }
  private contextFailure(err: unknown, version: number): void {
    if (version !== this.version) return;
    this.loading.set(false); this.error.set(apiError(err, 'Impossible de charger les établissements ou les élèves.'));
  }
  private initialize(contexts: { id: number; name: string }[]): void {
    this.contexts.set(contexts);
    if (contexts[0]) this.choose(contexts[0].id); else this.loading.set(false);
  }
  choose(id: number): void {
    if (this.saving() || !this.contexts().some(c => c.id === id)) return;
    this.contextId.set(id); this.data.set(empty()); this.success.set(null); this.error.set(null);
    this.event = { classId: null, title: '', description: '', kind: 'EVENT', startsOn: '', endsOn: '' };
    this.observation = { studentId: null, kind: 'INCIDENT', observedOn: this.today, description: '', action: '', sharedWithFamily: false };
    this.document = { kind: 'SCHOOL_CERTIFICATE', reason: '' };
    this.book = { title: '', author: '', reference: '', copies: 1 }; this.loan = { bookId: null, studentId: null, dueOn: '' };
    this.responses = {}; this.observationActions = {}; this.feedback = {}; this.statuses = {};
    this.reload();
  }
  reload(): void {
    const id = this.contextId(); if (id === null) return;
    const version = ++this.version; this.loading.set(true); this.error.set(null);
    this.api.overview(this.scope(), id, this.module()).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: data => {
        if (version !== this.version) return;
        this.data.set(data); this.loading.set(false);
        for (const item of data.observations) this.observationActions[item.id] = item.action;
        for (const item of data.homeworks) { this.feedback[this.key(item)] = item.feedback; this.statuses[this.key(item)] = item.status; }
      },
      error: err => { if (version === this.version) { this.loading.set(false); this.error.set(apiError(err, 'Chargement impossible. Réessayez lorsque la connexion revient.')); } },
    });
  }
  private save(action: Observable<void>, message: string, reset: () => void = () => {}): void {
    if (this.saving()) return;
    this.saving.set(true); this.error.set(null); this.success.set(null);
    const id = this.contextId(); const scope = this.scope();
    action.pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: () => {
        this.saving.set(false);
        if (id !== this.contextId() || scope !== this.scope()) return;
        reset(); this.success.set(message); this.reload();
      },
      error: err => { this.saving.set(false); this.error.set(apiError(err, 'Enregistrement impossible. Votre saisie est conservée : vous pouvez réessayer.')); },
    });
  }
  createEvent(): void {
    const id = this.contextId(); if (id === null || !this.owner()) return;
    if (this.event.endsOn < this.event.startsOn) { this.error.set('La date de fin doit suivre la date de début.'); return; }
    this.save(this.api.create('schools', id, 'events', { ...this.event }), 'Événement ajouté.', () => { this.event.title = ''; this.event.description = ''; });
  }
  async deleteEvent(event: CalendarEvent): Promise<void> {
    const id = this.contextId(); if (id === null || this.saving()) return;
    if (!await this.confirmation.confirm({ title: 'Retirer cet événement ?', message: event.title, confirmLabel: 'Retirer' })) return;
    if (id !== this.contextId()) return;
    this.save(this.api.removeEvent(id, event.id), 'Événement retiré.');
  }
  createObservation(): void {
    const id = this.contextId(); const student = this.data().students.find(s => s.id === this.observation.studentId);
    if (id === null || !student) return;
    this.save(this.api.create(this.scope(), id, 'observations', { ...this.observation, classId: student.classId }), 'Observation enregistrée.',
      () => { this.observation.description = ''; this.observation.action = ''; });
  }
  resolve(item: Observation, share = item.sharedWithFamily): void {
    const id = this.contextId(); if (id === null) return;
    this.save(this.api.update('schools', id, `observations/${item.id}`, {
      action: this.observationActions[item.id] ?? item.action, sharedWithFamily: share, resolved: true,
    }), 'Observation mise à jour.');
  }
  requestDocument(): void {
    const id = this.contextId(); if (id === null) return;
    this.save(this.api.create('students', id, 'requests', { ...this.document }), 'Demande transmise à l’établissement.', () => { this.document.reason = ''; });
  }
  decide(item: DocumentRequest, status: string): void {
    const id = this.contextId(); if (id === null) return;
    const response = this.responses[item.id]?.trim();
    if (!response) { this.error.set('Ajoutez une réponse ou les modalités de retrait.'); return; }
    this.save(this.api.update('schools', id, `requests/${item.id}`, { status, response }), 'Demande mise à jour.');
  }
  cancel(item: DocumentRequest): void {
    const id = this.contextId(); if (id !== null) this.save(this.api.action('students', id, `requests/${item.id}/cancel`), 'Demande annulée.');
  }
  createBook(): void {
    const id = this.contextId(); if (id === null) return;
    this.save(this.api.create('schools', id, 'books', { ...this.book }), 'Livre ajouté au catalogue.', () => { this.book = { title: '', author: '', reference: '', copies: 1 }; });
  }
  lend(): void {
    const id = this.contextId(); if (id === null || !this.loan.bookId || !this.loan.studentId) return;
    this.save(this.api.create('schools', id, 'loans', { ...this.loan }), 'Prêt enregistré.', () => { this.loan = { bookId: null, studentId: null, dueOn: '' }; });
  }
  returnBook(loan: LibraryLoan): void {
    const id = this.contextId(); if (id !== null) this.save(this.api.action('schools', id, `loans/${loan.id}/return`), 'Retour enregistré.');
  }
  overdue(loan: LibraryLoan): boolean { return !loan.returnedOn && loan.dueOn < this.today; }
  key(item: HomeworkProgress): string { return `${item.postId}:${item.studentId}`; }
  homework(item: HomeworkProgress): void {
    const id = this.contextId(); if (id === null || !item.editable) return;
    this.save(this.api.update(this.scope(), id, `homeworks/${item.postId}/students/${item.studentId}`, {
      status: this.statuses[this.key(item)], feedback: this.feedback[this.key(item)] ?? '',
    }), 'Suivi du devoir enregistré.');
  }
}
