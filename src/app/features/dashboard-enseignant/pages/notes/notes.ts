import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';
import {
  apiError,
  EvaluationInfo,
  GradePeriod,
  GradeSheet,
  SelfSpaceService,
  TeacherClass,
} from '../../../../shared/self-space/self-space.service';

export const EVALUATION_TYPES: { value: string; label: string }[] = [
  { value: 'DEVOIR', label: 'Devoir' },
  { value: 'INTERROGATION', label: 'Interrogation' },
  { value: 'COMPOSITION', label: 'Composition' },
  { value: 'EXAMEN', label: 'Examen' },
  { value: 'ORAL', label: 'Oral' },
  { value: 'TP', label: 'Travaux pratiques' },
  { value: 'PROJET', label: 'Projet' },
];

const PERIOD_STATUS: Record<string, string> = { OPEN: 'Ouverte', LOCKED: 'Verrouillée', PUBLISHED: 'Publiée' };

interface EvaluationForm {
  classSubjectTeacherId: number | null;
  title: string;
  type: string;
  evalDate: string;
  maxValue: number;
  weight: number;
}

@Component({
  selector: 'app-enseignant-notes',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule],
  templateUrl: './notes.html',
  styleUrl: '../../../../shared/self-space/self-space.scss',
})
export class EnseignantNotes implements OnInit {
  private readonly api = inject(SelfSpaceService);
  private readonly route = inject(ActivatedRoute);
  private readonly confirmation = inject(ConfirmationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly types = EVALUATION_TYPES;
  readonly periodStatus = PERIOD_STATUS;
  readonly classes = signal<TeacherClass[]>([]);
  readonly periods = signal<GradePeriod[]>([]);
  readonly evaluations = signal<EvaluationInfo[]>([]);
  readonly sheet = signal<GradeSheet | null>(null);
  readonly classId = signal<number | null>(null);
  readonly periodId = signal<number | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly showForm = signal(false);

  form: EvaluationForm = this.emptyForm();
  /** Valeurs saisies dans la feuille, par élève ('' = pas de note). */
  values: Record<number, string> = {};
  appreciations: Record<number, string> = {};
  reason = '';

  readonly selectedClass = computed(() => this.classes().find((c) => c.classId === this.classId()) ?? null);
  readonly selectedPeriod = computed(() => this.periods().find((p) => p.id === this.periodId()) ?? null);
  readonly editable = computed(() => this.selectedPeriod()?.status === 'OPEN');

  ngOnInit(): void {
    const requested = Number(this.route.snapshot.queryParamMap.get('classe')) || null;
    this.api.teacherClasses().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (classes) => {
        this.classes.set(classes);
        this.loading.set(false);
        const initial = classes.find((c) => c.classId === requested) ?? classes[0];
        if (initial) this.selectClass(initial.classId);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(apiError(err, 'Impossible de charger vos classes.'));
      },
    });
  }

  selectClass(classId: number): void {
    this.classId.set(classId);
    this.periodId.set(null);
    this.periods.set([]);
    this.evaluations.set([]);
    this.sheet.set(null);
    this.showForm.set(false);
    this.api.classPeriods(classId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (periods) => {
        this.periods.set(periods);
        const open = periods.find((p) => p.status === 'OPEN') ?? periods[periods.length - 1];
        if (open) this.selectPeriod(open.id);
      },
      error: (err) => this.error.set(apiError(err, 'Impossible de charger les périodes.')),
    });
  }

  selectPeriod(periodId: number): void {
    this.periodId.set(periodId);
    this.sheet.set(null);
    this.loadEvaluations();
  }

  private loadEvaluations(): void {
    const classId = this.classId();
    const periodId = this.periodId();
    if (!classId || !periodId) return;
    this.api.evaluations(classId, periodId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (evaluations) => this.evaluations.set(evaluations),
      error: (err) => this.error.set(apiError(err, 'Impossible de charger les évaluations.')),
    });
  }

  openForm(): void {
    this.form = this.emptyForm();
    const subjects = this.selectedClass()?.subjects ?? [];
    if (subjects.length === 1) this.form.classSubjectTeacherId = subjects[0].classSubjectTeacherId;
    const period = this.selectedPeriod();
    const today = new Date().toISOString().slice(0, 10);
    if (period && (today < period.startDate || today > period.endDate)) this.form.evalDate = period.startDate;
    this.showForm.set(true);
  }

  createEvaluation(): void {
    const classId = this.classId();
    const periodId = this.periodId();
    if (!classId || !periodId) return;
    if (!this.form.classSubjectTeacherId || !this.form.title.trim() || !this.form.evalDate) {
      this.error.set('Choisissez la matière et renseignez l’intitulé et la date.');
      return;
    }
    this.busy.set(true);
    this.clearMessages();
    this.api.createEvaluation(classId, {
      classSubjectTeacherId: this.form.classSubjectTeacherId,
      periodId,
      title: this.form.title.trim(),
      type: this.form.type,
      evalDate: this.form.evalDate,
      maxValue: Number(this.form.maxValue) || 20,
      weight: Number(this.form.weight) || 1,
    }).subscribe({
      next: (evaluation) => {
        this.busy.set(false);
        this.showForm.set(false);
        this.success.set(`Évaluation « ${evaluation.title} » créée. Saisissez maintenant les notes.`);
        this.loadEvaluations();
        this.openSheet(evaluation.id);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(apiError(err, 'Impossible de créer l’évaluation.'));
      },
    });
  }

  openSheet(evaluationId: number): void {
    this.reason = '';
    this.api.gradeSheet(evaluationId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (sheet) => {
        this.sheet.set(sheet);
        this.values = Object.fromEntries(sheet.rows.map((r) => [r.studentId, r.value === null ? '' : String(r.value)]));
        this.appreciations = Object.fromEntries(sheet.rows.map((r) => [r.studentId, r.appreciation ?? '']));
      },
      error: (err) => this.error.set(apiError(err, 'Impossible d’ouvrir la feuille de notes.')),
    });
  }

  /** Vrai si une note déjà enregistrée est modifiée ou effacée (motif obligatoire). */
  altersExisting(): boolean {
    const sheet = this.sheet();
    if (!sheet) return false;
    return sheet.rows.some((r) => r.value !== null && this.parse(this.values[r.studentId]) !== r.value);
  }

  saveSheet(): void {
    const sheet = this.sheet();
    if (!sheet) return;
    const max = sheet.evaluation.maxValue;
    const grades: { studentId: number; value: number | null; appreciation: string }[] = [];
    for (const row of sheet.rows) {
      const value = this.parse(this.values[row.studentId]);
      if (Number.isNaN(value) || (value !== null && (value < 0 || value > max))) {
        this.error.set(`Note invalide pour ${row.fullName} : elle doit être comprise entre 0 et ${max}.`);
        return;
      }
      grades.push({ studentId: row.studentId, value, appreciation: this.appreciations[row.studentId] ?? '' });
    }
    if (this.altersExisting() && !this.reason.trim()) {
      this.error.set('Indiquez le motif de la modification des notes déjà saisies.');
      return;
    }
    this.busy.set(true);
    this.clearMessages();
    this.api.saveGrades(sheet.evaluation.id, grades, this.reason.trim() || null).subscribe({
      next: (result) => {
        this.busy.set(false);
        this.success.set(`Notes enregistrées : ${result.created} ajoutée(s), ${result.updated} modifiée(s), `
          + `${result.deleted} supprimée(s).`);
        this.loadEvaluations();
        this.openSheet(sheet.evaluation.id);
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(apiError(err, 'Impossible d’enregistrer les notes.'));
      },
    });
  }

  async deleteEvaluation(evaluation: EvaluationInfo): Promise<void> {
    let reason: string | undefined;
    if (evaluation.gradedCount > 0) {
      reason = this.reason.trim();
      if (!reason) {
        this.openSheet(evaluation.id);
        this.error.set('Des notes sont déjà saisies : indiquez un motif dans la feuille de notes avant de supprimer.');
        return;
      }
    }
    const confirmed = await this.confirmation.confirm({
      title: 'Supprimer l’évaluation',
      message: `Supprimer « ${evaluation.title} » et ses ${evaluation.gradedCount} note(s) ?`,
      confirmLabel: 'Supprimer',
      destructive: true,
    });
    if (!confirmed) return;
    this.clearMessages();
    this.api.deleteEvaluation(evaluation.id, reason).subscribe({
      next: () => {
        if (this.sheet()?.evaluation.id === evaluation.id) this.sheet.set(null);
        this.success.set('Évaluation supprimée.');
        this.loadEvaluations();
      },
      error: (err) => this.error.set(apiError(err, 'Impossible de supprimer l’évaluation.')),
    });
  }

  typeLabel(type: string): string {
    return EVALUATION_TYPES.find((t) => t.value === type)?.label ?? type;
  }

  private parse(raw: string | undefined): number | null {
    const text = (raw ?? '').toString().trim().replace(',', '.');
    return text === '' ? null : Number(text);
  }

  private clearMessages(): void {
    this.error.set(null);
    this.success.set(null);
  }

  private emptyForm(): EvaluationForm {
    return {
      classSubjectTeacherId: null,
      title: '',
      type: 'DEVOIR',
      evalDate: new Date().toISOString().slice(0, 10),
      maxValue: 20,
      weight: 1,
    };
  }
}
