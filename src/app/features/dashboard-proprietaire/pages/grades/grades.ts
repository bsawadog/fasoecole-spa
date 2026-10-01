import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin, Observable, Subscription } from 'rxjs';
import { AuthService, RegistrationSchool } from '../../../../core/auth';
import { AcademicYearRecord, ClassRecord, LevelRecord, OwnerManagementService } from '../../owner-management.service';
import {
  BulletinBatch, ClassResults, ClassSubject, EVALUATION_TYPES, EvaluationInfo, GradePeriod, GradeSheet, GradesService,
  HistoryEntry, PERIOD_STATUS_LABELS, PeriodStatus, SchoolSummary,
} from '../../grades.service';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';

type Tab = 'overview' | 'periods' | 'entry' | 'results' | 'bulletins' | 'history';
type SheetValue = number | string | null;

@Component({
  selector: 'app-grades',
  standalone: true,
  imports: [FormsModule, DecimalPipe, DatePipe],
  templateUrl: './grades.html',
  styleUrl: './grades.scss',
})
export class GradesPage implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly management = inject(OwnerManagementService);
  private readonly grades = inject(GradesService);
  private readonly confirmation = inject(ConfirmationService);
  private requests = new Subscription();

  readonly statusLabels = PERIOD_STATUS_LABELS;
  readonly evaluationTypes = EVALUATION_TYPES;
  readonly typeKeys = Object.keys(EVALUATION_TYPES);
  readonly mentionKeys = ['Très bien', 'Bien', 'Assez bien', 'Passable', 'Insuffisant'];
  readonly tabs: { id: Tab; label: string; needsClass: boolean }[] = [
    { id: 'overview', label: 'Synthèse', needsClass: false },
    { id: 'periods', label: 'Périodes', needsClass: false },
    { id: 'entry', label: 'Évaluations & saisie', needsClass: true },
    { id: 'results', label: 'Résultats & classement', needsClass: true },
    { id: 'bulletins', label: 'Bulletins', needsClass: true },
    { id: 'history', label: 'Historique des notes', needsClass: true },
  ];

  readonly schools = signal<RegistrationSchool[]>([]);
  readonly schoolId = signal<number | null>(null);
  readonly years = signal<AcademicYearRecord[]>([]);
  readonly levels = signal<LevelRecord[]>([]);
  readonly classes = signal<ClassRecord[]>([]);
  readonly periods = signal<GradePeriod[]>([]);
  readonly periodId = signal<number | null>(null);
  readonly classId = signal<number | null>(null);
  readonly tab = signal<Tab>('overview');
  readonly summary = signal<SchoolSummary | null>(null);
  readonly subjects = signal<ClassSubject[]>([]);
  readonly evaluations = signal<EvaluationInfo[]>([]);
  readonly sheet = signal<GradeSheet | null>(null);
  readonly results = signal<ClassResults | null>(null);
  readonly batch = signal<BulletinBatch | null>(null);
  readonly history = signal<HistoryEntry[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly printTarget = signal<number | 'all' | null>(null);

  periodForm = this.emptyPeriod();
  editingPeriodId: number | null = null;
  defaults = { academicYearId: 0, scheme: 'TRIMESTRE' as 'TRIMESTRE' | 'SEMESTRE' };
  evalForm = this.emptyEvaluation();
  editingEvalId: number | null = null;
  sheetValues: Record<number, SheetValue> = {};
  sheetReason = '';
  coefficients: Record<number, number> = {};
  comments: Record<number, string> = {};

  readonly period = computed(() => this.periods().find(p => p.id === this.periodId()) ?? null);
  readonly periodClasses = computed(() => {
    const period = this.period();
    return this.classes()
      .filter(c => !period || c.academicYearId === period.academicYearId)
      .sort((a, b) => this.classLabel(a).localeCompare(this.classLabel(b), 'fr'));
  });
  readonly editable = computed(() => this.period()?.status === 'OPEN');
  readonly activeAssignments = computed(() => this.subjects().flatMap(s => s.assignments
    .filter(a => a.active)
    .map(a => ({ id: a.classSubjectTeacherId, label: `${s.subjectName} — ${a.teacherName}` }))));
  readonly currentTab = computed(() => this.tabs.find(t => t.id === this.tab())!);

  ngOnInit(): void {
    const ownerId = this.auth.user()?.id;
    if (!ownerId) {
      this.loading.set(false);
      this.error.set('Impossible d’identifier votre compte propriétaire.');
      return;
    }
    this.auth.getOwnedSchools(ownerId).subscribe({
      next: schools => {
        this.schools.set(schools);
        if (!schools.length) { this.loading.set(false); return; }
        const stored = Number(localStorage.getItem('fasoecole_owner_school'));
        this.selectSchool(schools.find(s => s.id === stored)?.id ?? schools[0].id);
      },
      error: () => { this.loading.set(false); this.error.set('Impossible de charger vos établissements.'); },
    });
  }

  ngOnDestroy(): void {
    this.requests.unsubscribe();
  }

  // ------------------------------------------------------------ navigation

  changeSchool(event: Event): void {
    const id = Number((event.target as HTMLSelectElement).value);
    if (this.schools().some(s => s.id === id)) this.selectSchool(id);
  }

  changePeriod(event: Event): void {
    this.periodId.set(Number((event.target as HTMLSelectElement).value) || null);
    if (!this.periodClasses().some(c => c.id === this.classId())) {
      this.classId.set(this.periodClasses()[0]?.id ?? null);
    }
    this.resetEvaluation();
    this.loadTab();
  }

  changeClass(event: Event): void {
    this.classId.set(Number((event.target as HTMLSelectElement).value) || null);
    this.resetEvaluation();
    this.loadTab();
  }

  setTab(tab: Tab): void {
    this.tab.set(tab);
    this.success.set(null);
    this.error.set(null);
    this.loadTab();
  }

  openClass(classId: number): void {
    this.classId.set(classId);
    this.setTab('results');
  }

  classLabel(schoolClass: ClassRecord | undefined): string {
    if (!schoolClass) return '';
    const level = this.levels().find(item => item.id === schoolClass.levelId);
    return level ? `${level.name} · ${schoolClass.name}` : schoolClass.name;
  }

  periodLabel(period: GradePeriod): string {
    return `${period.name} · ${period.academicYearLabel}`;
  }

  // ------------------------------------------------------------ périodes

  editPeriod(period: GradePeriod): void {
    this.editingPeriodId = period.id;
    this.periodForm = { academicYearId: period.academicYearId, code: period.code, name: period.name,
      startDate: period.startDate, endDate: period.endDate, passMark: period.passMark };
  }

  resetPeriod(): void {
    this.editingPeriodId = null;
    this.periodForm = this.emptyPeriod();
  }

  savePeriod(): void {
    const schoolId = this.schoolId();
    const f = this.periodForm;
    if (!schoolId || !Number(f.academicYearId) || !f.code.trim() || !f.name.trim() || !f.startDate || !f.endDate) {
      this.error.set('Renseignez l’année, le code, le libellé et les dates de la période.');
      return;
    }
    this.run(this.grades.savePeriod(schoolId, {
      academicYearId: Number(f.academicYearId), code: f.code.trim(), name: f.name.trim(),
      startDate: f.startDate, endDate: f.endDate, passMark: f.passMark == null ? null : Number(f.passMark),
    }, this.editingPeriodId ?? undefined), this.editingPeriodId ? 'Période mise à jour.' : 'Période créée.',
    () => this.resetPeriod());
  }

  createDefaults(): void {
    const schoolId = this.schoolId();
    if (!schoolId || !Number(this.defaults.academicYearId)) {
      this.error.set('Choisissez l’année scolaire à découper.');
      return;
    }
    this.run(this.grades.createDefaultPeriods(schoolId, Number(this.defaults.academicYearId), this.defaults.scheme),
      this.defaults.scheme === 'TRIMESTRE' ? 'Trimestres créés.' : 'Semestres créés.');
  }

  async setStatus(period: GradePeriod, status: PeriodStatus): Promise<void> {
    const messages: Record<PeriodStatus, { title: string; message: string; label: string }> = {
      LOCKED: { title: 'Verrouiller la période ?', label: 'Verrouiller',
        message: `Plus aucune note de « ${period.name} » ne pourra être saisie ou modifiée tant que la période restera verrouillée.` },
      PUBLISHED: { title: 'Publier les résultats ?', label: 'Publier',
        message: `Les moyennes, rangs et bulletins de « ${period.name} » seront figés et validés pour toutes les classes.` },
      OPEN: { title: 'Rouvrir la saisie ?', label: 'Rouvrir',
        message: period.status === 'PUBLISHED'
          ? `Les bulletins de « ${period.name} » repasseront en brouillon et les notes redeviendront modifiables.`
          : `Les notes de « ${period.name} » redeviendront modifiables.` },
    };
    const m = messages[status];
    const ok = await this.confirmation.confirm({ title: m.title, message: m.message, confirmLabel: m.label,
      destructive: status === 'OPEN' && period.status === 'PUBLISHED' });
    if (ok) {
      this.run(this.grades.changeStatus(period.id, status),
        `Période « ${period.name} » : ${this.statusLabels[status].toLowerCase()}.`, () => this.reloadPeriods());
    }
  }

  async deletePeriod(period: GradePeriod): Promise<void> {
    const ok = await this.confirmation.confirm({
      title: 'Supprimer la période ?',
      message: `« ${period.name} » (${period.academicYearLabel}) sera supprimée.`,
      confirmLabel: 'Supprimer',
      destructive: true,
    });
    if (ok) this.run(this.grades.deletePeriod(period.id), 'Période supprimée.');
  }

  // ------------------------------------------------------------ évaluations

  editEvaluation(evaluation: EvaluationInfo): void {
    this.editingEvalId = evaluation.id;
    this.evalForm = { classSubjectTeacherId: evaluation.classSubjectTeacherId, title: evaluation.title,
      type: evaluation.type, evalDate: evaluation.evalDate, maxValue: evaluation.maxValue, weight: evaluation.weight };
  }

  resetEvaluation(): void {
    this.editingEvalId = null;
    this.evalForm = this.emptyEvaluation();
    this.sheet.set(null);
  }

  saveEvaluation(): void {
    const classId = this.classId();
    const periodId = this.periodId();
    const f = this.evalForm;
    if (!classId || !periodId || !Number(f.classSubjectTeacherId) || !f.title.trim() || !f.evalDate) {
      this.error.set('Choisissez la matière, l’intitulé et la date de l’évaluation.');
      return;
    }
    this.run(this.grades.saveEvaluation(classId, {
      classSubjectTeacherId: Number(f.classSubjectTeacherId), periodId, title: f.title.trim(), type: f.type,
      evalDate: f.evalDate, maxValue: Number(f.maxValue) || 20, weight: Number(f.weight) || 1,
    }, this.editingEvalId ?? undefined), this.editingEvalId ? 'Évaluation mise à jour.' : 'Évaluation créée.',
    () => this.resetEvaluation());
  }

  async deleteEvaluation(evaluation: EvaluationInfo): Promise<void> {
    let reason: string | null = null;
    if (evaluation.gradedCount > 0) {
      reason = window.prompt(`« ${evaluation.title} » contient ${evaluation.gradedCount} note(s). Motif de la suppression :`);
      if (reason === null) return;
      if (!reason.trim()) { this.error.set('Le motif est obligatoire pour supprimer des notes saisies.'); return; }
    } else {
      const ok = await this.confirmation.confirm({ title: 'Supprimer l’évaluation ?',
        message: `« ${evaluation.title} » sera supprimée.`, confirmLabel: 'Supprimer', destructive: true });
      if (!ok) return;
    }
    this.run(this.grades.deleteEvaluation(evaluation.id, reason?.trim() ?? null), 'Évaluation supprimée.',
      () => this.resetEvaluation());
  }

  openSheet(evaluation: EvaluationInfo): void {
    this.requests.add(this.grades.sheet(evaluation.id).subscribe({
      next: sheet => {
        this.sheetValues = Object.fromEntries(sheet.rows.map(r => [r.studentId, r.value]));
        this.sheetReason = '';
        this.sheet.set(sheet);
      },
      error: err => this.fail(err, 'Impossible de charger la feuille de notes.'),
    }));
  }

  changedExisting(): number {
    const sheet = this.sheet();
    if (!sheet) return 0;
    return sheet.rows.filter(r => r.value != null && this.normalized(this.sheetValues[r.studentId]) !== r.value).length;
  }

  saveSheet(): void {
    const sheet = this.sheet();
    if (!sheet) return;
    const max = sheet.evaluation.maxValue;
    const entries = sheet.rows.map(r => ({ studentId: r.studentId, value: this.normalized(this.sheetValues[r.studentId]) }));
    if (entries.some(e => e.value != null && (isNaN(e.value) || e.value < 0 || e.value > max))) {
      this.error.set(`Chaque note doit être comprise entre 0 et ${max}.`);
      return;
    }
    if (this.changedExisting() > 0 && !this.sheetReason.trim()) {
      this.error.set('Indiquez le motif : des notes déjà saisies sont modifiées ou effacées.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.success.set(null);
    this.grades.saveGrades(sheet.evaluation.id, entries, this.sheetReason.trim() || null).subscribe({
      next: res => {
        this.done(`Notes enregistrées : ${res.created} ajoutée(s), ${res.updated} modifiée(s), ${res.deleted} effacée(s).`);
        this.openSheet(sheet.evaluation);
      },
      error: err => this.fail(err, 'Impossible d’enregistrer les notes.'),
    });
  }

  saveCoefficient(subject: ClassSubject): void {
    const classId = this.classId();
    const value = Number(this.coefficients[subject.subjectId]);
    if (!classId || !(value >= 0.25 && value <= 20)) {
      this.error.set('Le coefficient doit être compris entre 0,25 et 20.');
      return;
    }
    this.run(this.grades.updateCoefficient(classId, subject.subjectId, value),
      `Coefficient de ${subject.subjectName} : ${value}.`);
  }

  // ------------------------------------------------------------ résultats & bulletins

  generateReportCards(): void {
    const classId = this.classId();
    const periodId = this.periodId();
    if (classId && periodId) {
      this.run(this.grades.generateReportCards(classId, periodId), 'Bulletins générés : moyennes, rangs et mentions figés.');
    }
  }

  saveComment(studentId: number): void {
    const classId = this.classId();
    const periodId = this.periodId();
    if (classId && periodId) {
      this.run(this.grades.saveComment(classId, periodId, studentId, this.comments[studentId] ?? ''),
        'Appréciation enregistrée.');
    }
  }

  subjectAverage(row: { subjectAverages: Record<string, number> }, subjectId: number): number | null {
    return row.subjectAverages[subjectId] ?? null;
  }

  print(target: number | 'all'): void {
    this.printTarget.set(target);
    setTimeout(() => {
      window.print();
      this.printTarget.set(null);
    });
  }

  historyLabel(action: HistoryEntry['action']): string {
    return action === 'CREATE' ? 'Saisie' : action === 'UPDATE' ? 'Modification' : 'Suppression';
  }

  // ------------------------------------------------------------ chargement

  loadTab(): void {
    const periodId = this.periodId();
    const classId = this.classId();
    if (!this.schoolId()) return;
    if (this.tab() === 'periods') { this.reloadPeriods(); return; }
    if (!periodId || (this.currentTab().needsClass && !classId)) return;
    const load = <T>(request: Observable<T>, next: (value: T) => void, message: string) =>
      this.requests.add(request.subscribe({ next, error: err => this.fail(err, message) }));
    switch (this.tab()) {
      case 'overview':
        load(this.grades.summary(periodId), data => this.summary.set(data), 'Impossible de charger la synthèse.');
        break;
      case 'entry':
        load(forkJoin({ subjects: this.grades.subjects(classId!), evaluations: this.grades.evaluations(classId!, periodId) }),
          ({ subjects, evaluations }) => {
            this.subjects.set(subjects);
            this.coefficients = Object.fromEntries(subjects.map(s => [s.subjectId, s.coefficient]));
            this.evaluations.set(evaluations);
          }, 'Impossible de charger les évaluations.');
        break;
      case 'results':
        load(this.grades.results(classId!, periodId), data => {
          this.results.set(data);
          this.comments = Object.fromEntries(data.students.map(s => [s.studentId, s.comment ?? '']));
        }, 'Impossible de calculer les résultats.');
        break;
      case 'bulletins':
        load(this.grades.bulletins(classId!, periodId), data => this.batch.set(data), 'Impossible de préparer les bulletins.');
        break;
      case 'history':
        load(this.grades.history(classId!, periodId), data => this.history.set(data), 'Impossible de charger l’historique.');
        break;
    }
  }

  private reloadPeriods(): void {
    const schoolId = this.schoolId();
    if (!schoolId) return;
    this.requests.add(this.grades.periods(schoolId).subscribe({
      next: periods => {
        this.periods.set(periods);
        if (!periods.some(p => p.id === this.periodId())) this.pickDefaultPeriod();
      },
      error: err => this.fail(err, 'Impossible de charger les périodes.'),
    }));
  }

  private pickDefaultPeriod(): void {
    const current = this.years().find(y => y.isCurrent)?.id;
    const periods = this.periods();
    const today = new Date().toISOString().slice(0, 10);
    const period = periods.find(p => p.academicYearId === current && p.startDate <= today && p.endDate >= today)
      ?? periods.find(p => p.academicYearId === current && p.status === 'OPEN')
      ?? periods.find(p => p.academicYearId === current) ?? periods[0];
    this.periodId.set(period?.id ?? null);
    if (!this.periodClasses().some(c => c.id === this.classId())) {
      this.classId.set(this.periodClasses()[0]?.id ?? null);
    }
  }

  private selectSchool(schoolId: number): void {
    this.requests.unsubscribe();
    this.requests = new Subscription();
    this.schoolId.set(schoolId);
    localStorage.setItem('fasoecole_owner_school', String(schoolId));
    this.loading.set(true);
    this.summary.set(null);
    this.resetEvaluation();
    this.requests.add(forkJoin({
      years: this.management.getAcademicYears(schoolId),
      levels: this.management.getLevels(schoolId),
      classes: this.management.getClasses(schoolId),
      periods: this.grades.periods(schoolId),
    }).subscribe({
      next: ({ years, levels, classes, periods }) => {
        this.years.set(years);
        this.levels.set(levels);
        this.classes.set(classes);
        this.periods.set(periods);
        const currentYear = years.find(y => y.isCurrent)?.id ?? years[0]?.id ?? 0;
        this.defaults.academicYearId = currentYear;
        this.periodForm.academicYearId = currentYear;
        this.classId.set(null);
        this.pickDefaultPeriod();
        if (!periods.length) this.tab.set('periods');
        this.loading.set(false);
        this.loadTab();
      },
      error: () => { this.loading.set(false); this.error.set('Impossible de charger les données de cet établissement.'); },
    }));
  }

  private normalized(value: SheetValue | undefined): number | null {
    if (value === null || value === undefined || value === '') return null;
    return Math.round(Number(String(value).replace(',', '.')) * 100) / 100;
  }

  private run(request: Observable<unknown>, message: string, after?: () => void): void {
    this.busy.set(true);
    this.error.set(null);
    this.success.set(null);
    request.subscribe({
      next: () => { after?.(); this.done(message); },
      error: err => this.fail(err, 'L’opération a échoué.'),
    });
  }

  private done(message: string): void {
    this.busy.set(false);
    this.success.set(message);
    this.loadTab();
  }

  private fail(err: { error?: { message?: string } }, fallback: string): void {
    this.busy.set(false);
    this.error.set(err?.error?.message ?? fallback);
  }

  private emptyPeriod() {
    return { academicYearId: this.years().find(y => y.isCurrent)?.id ?? 0, code: '', name: '', startDate: '',
      endDate: '', passMark: 10 as number | null };
  }

  private emptyEvaluation() {
    return { classSubjectTeacherId: 0, title: '', type: 'DEVOIR', evalDate: new Date().toISOString().slice(0, 10),
      maxValue: 20, weight: 1 };
  }
}
