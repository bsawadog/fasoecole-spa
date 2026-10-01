import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService, RegistrationSchool } from '../../../../core/auth';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';
import {
  ClassPlan,
  DECISION_LABELS,
  DecisionItem,
  EnrollmentDecision,
  EnrollmentService,
  PromotionPlan,
  StudentPlan,
  TargetClass,
  YearInfo,
} from '../../enrollment.service';

interface Draft {
  decision: EnrollmentDecision;
  targetClassId: number | null;
  selected: boolean;
}

@Component({
  selector: 'app-enrollment',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './enrollment.html',
  styleUrl: './enrollment.scss',
})
export class EnrollmentPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly api = inject(EnrollmentService);
  private readonly confirmation = inject(ConfirmationService);

  readonly decisions = (Object.keys(DECISION_LABELS) as EnrollmentDecision[])
    .map((code) => ({ code, label: DECISION_LABELS[code] }));

  readonly schools = signal<RegistrationSchool[]>([]);
  readonly schoolId = signal<number | null>(null);
  readonly years = signal<YearInfo[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly skipped = signal<{ studentName: string | null; reason: string }[]>([]);

  readonly yearFormOpen = signal(false);
  yearForm = this.emptyYearForm();

  readonly fromYearId = signal<number | null>(null);
  readonly toYearId = signal<number | null>(null);
  readonly plan = signal<PromotionPlan | null>(null);
  readonly planLoading = signal(false);
  readonly classFilter = signal<number | 'all'>('all');
  /** Choix en cours, par inscription (non encore enregistrés). */
  readonly drafts = signal<Map<number, Draft>>(new Map());

  readonly visibleClasses = computed<ClassPlan[]>(() => {
    const plan = this.plan();
    if (!plan) return [];
    const filter = this.classFilter();
    return plan.classes.filter((c) => filter === 'all' || c.classId === filter);
  });

  readonly selectedCount = computed(() => [...this.drafts().values()].filter((d) => d.selected).length);

  /** Effectif prévu par classe d'arrivée : déjà inscrits + élèves sélectionnés vers cette classe. */
  readonly plannedByClass = computed(() => {
    const planned = new Map<number, number>();
    for (const t of this.plan()?.targetClasses ?? []) planned.set(t.id, t.enrolled);
    for (const d of this.drafts().values()) {
      if (d.selected && d.targetClassId && this.continues(d.decision)) {
        planned.set(d.targetClassId, (planned.get(d.targetClassId) ?? 0) + 1);
      }
    }
    return planned;
  });

  readonly nextYearCandidates = computed(() => {
    const from = this.years().find((y) => y.id === this.fromYearId());
    return this.years().filter((y) => !from || y.startDate > from.startDate);
  });

  ngOnInit(): void {
    const ownerId = this.auth.user()?.id;
    if (!ownerId) {
      this.loading.set(false);
      this.error.set('Impossible d’identifier votre compte.');
      return;
    }
    this.auth.getOwnedSchools(ownerId, 'ENROLLMENT').subscribe({
      next: (schools) => {
        this.schools.set(schools);
        if (!schools.length) {
          this.loading.set(false);
          return;
        }
        const stored = Number(localStorage.getItem('fasoecole_owner_school'));
        this.selectSchool(schools.find((s) => s.id === stored)?.id ?? schools[0].id);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Impossible de charger vos établissements.');
      },
    });
  }

  changeSchool(event: Event): void {
    const id = Number((event.target as HTMLSelectElement).value);
    if (this.schools().some((s) => s.id === id)) this.selectSchool(id);
  }

  label(decision: EnrollmentDecision | null): string {
    return decision ? DECISION_LABELS[decision] : '';
  }

  continues(decision: EnrollmentDecision): boolean {
    return decision === 'PROMOTED' || decision === 'REPEATED';
  }

  formatDate(value: string): string {
    const [y, m, d] = value.split('-');
    return `${d}/${m}/${y}`;
  }

  // ------------------------------------------------------------------ années scolaires

  openYearForm(): void {
    this.yearForm = this.suggestedYearForm();
    this.yearFormOpen.set(true);
    this.clearMessages();
  }

  createYear(): void {
    const schoolId = this.schoolId();
    const f = this.yearForm;
    if (!schoolId) return;
    if (!f.label.trim() || !f.startDate || !f.endDate) {
      this.error.set('Le nom et les dates de la nouvelle année sont obligatoires.');
      return;
    }
    if (f.endDate <= f.startDate) {
      this.error.set('La date de fin doit suivre la date de début.');
      return;
    }
    const sourceYearId = f.sourceYearId ? Number(f.sourceYearId) : null;
    this.busy.set(true);
    this.clearMessages();
    this.api.createYear(schoolId, {
      label: f.label.trim(),
      startDate: f.startDate,
      endDate: f.endDate,
      sourceYearId,
      copyClasses: !!sourceYearId && f.copyClasses,
      copyTeachers: !!sourceYearId && f.copyClasses && f.copyTeachers,
      copyPeriods: !!sourceYearId && f.copyPeriods,
      makeCurrent: f.makeCurrent,
    }).subscribe({
      next: (result) => {
        this.busy.set(false);
        this.yearFormOpen.set(false);
        const parts = [`Année ${result.year.label} créée`];
        if (result.classesCopied) parts.push(`${result.classesCopied} classe(s) reprise(s)`);
        if (result.assignmentsCopied) parts.push(`${result.assignmentsCopied} affectation(s) d’enseignants`);
        if (result.periodsCopied) parts.push(`${result.periodsCopied} période(s) de notes`);
        this.success.set(parts.join(' · ') + '.');
        this.reloadYears(sourceYearId, result.year.id);
      },
      error: (err) => this.fail(err, 'Impossible de créer cette année scolaire.'),
    });
  }

  async setCurrent(year: YearInfo): Promise<void> {
    const ok = await this.confirmation.confirm({
      title: 'Changer d’année en cours',
      message: `${year.label} deviendra l’année en cours de l’établissement : le tableau de bord, la facturation et les notes s’y référeront par défaut.`,
      confirmLabel: 'Définir comme année en cours',
    });
    if (!ok) return;
    this.busy.set(true);
    this.clearMessages();
    this.api.setCurrent(year.id).subscribe({
      next: (overview) => {
        this.busy.set(false);
        this.years.set(overview.years);
        this.success.set(`${year.label} est maintenant l’année en cours.`);
      },
      error: (err) => this.fail(err, 'Impossible de changer l’année en cours.'),
    });
  }

  // ------------------------------------------------------------------ passage d'année

  changeFromYear(value: number | null): void {
    this.fromYearId.set(value ? Number(value) : null);
    if (!this.nextYearCandidates().some((y) => y.id === this.toYearId())) {
      this.toYearId.set(this.closestNext(this.fromYearId()));
    }
    this.loadPlan();
  }

  changeToYear(value: number | null): void {
    this.toYearId.set(value ? Number(value) : null);
    this.loadPlan();
  }

  loadPlan(): void {
    const schoolId = this.schoolId();
    this.plan.set(null);
    this.drafts.set(new Map());
    this.skipped.set([]);
    const from = this.fromYearId();
    const to = this.toYearId();
    if (!schoolId || !from || !to) return;
    this.planLoading.set(true);
    this.api.plan(schoolId, from, to).subscribe({
      next: (plan) => {
        this.planLoading.set(false);
        this.setPlan(plan, new Map());
        if (this.classFilter() !== 'all' && !plan.classes.some((c) => c.classId === this.classFilter())) {
          this.classFilter.set('all');
        }
      },
      error: (err) => {
        this.planLoading.set(false);
        this.error.set(err?.error?.message ?? 'Impossible de préparer le passage d’année.');
      },
    });
  }

  changeClassFilter(value: number | 'all'): void {
    this.classFilter.set(value === 'all' ? 'all' : Number(value));
  }

  draft(row: StudentPlan): Draft | undefined {
    return this.drafts().get(row.enrollmentId);
  }

  targetsFor(cls: ClassPlan, decision: EnrollmentDecision): TargetClass[] {
    const targets = this.plan()?.targetClasses ?? [];
    if (decision === 'REPEATED') {
      const same = targets.filter((t) => t.levelId === cls.levelId);
      return same.length ? same : targets;
    }
    return targets;
  }

  setDecision(row: StudentPlan, cls: ClassPlan, decision: EnrollmentDecision): void {
    this.patch(row.enrollmentId, (d) => {
      d.decision = decision;
      if (!this.continues(decision)) {
        d.targetClassId = null;
      } else if (decision === row.suggestedDecision) {
        d.targetClassId = row.suggestedClassId;
      } else if (decision === 'REPEATED') {
        d.targetClassId = this.targetsFor(cls, decision).find((t) => t.levelId === cls.levelId)?.id ?? null;
      } else {
        d.targetClassId = null;
      }
      d.selected = true;
    });
  }

  setTarget(row: StudentPlan, value: number | null): void {
    this.patch(row.enrollmentId, (d) => {
      d.targetClassId = value ? Number(value) : null;
      d.selected = true;
    });
  }

  toggleRow(row: StudentPlan, checked: boolean): void {
    this.patch(row.enrollmentId, (d) => (d.selected = checked));
  }

  pendingOf(cls: ClassPlan): StudentPlan[] {
    return cls.students.filter((s) => !s.decided);
  }

  allSelected(cls: ClassPlan): boolean {
    const pending = this.pendingOf(cls);
    return pending.length > 0 && pending.every((s) => this.draft(s)?.selected);
  }

  toggleClass(cls: ClassPlan, checked: boolean): void {
    const next = new Map(this.drafts());
    for (const s of this.pendingOf(cls)) {
      const d = next.get(s.enrollmentId);
      if (d) next.set(s.enrollmentId, { ...d, selected: checked });
    }
    this.drafts.set(next);
  }

  /** Remet les propositions calculées (moyenne annuelle) pour les élèves non traités d'une classe. */
  resetSuggestions(cls: ClassPlan): void {
    const next = new Map(this.drafts());
    for (const s of this.pendingOf(cls)) {
      next.set(s.enrollmentId, { decision: s.suggestedDecision, targetClassId: s.suggestedClassId, selected: true });
    }
    this.drafts.set(next);
  }

  planned(target: TargetClass): number {
    return this.plannedByClass().get(target.id) ?? 0;
  }

  overCapacity(target: TargetClass): boolean {
    return target.capacity != null && this.planned(target) > target.capacity;
  }

  missingTarget(row: StudentPlan): boolean {
    const d = this.draft(row);
    return !!d && this.continues(d.decision) && !d.targetClassId;
  }

  async applySelected(): Promise<void> {
    const schoolId = this.schoolId();
    const plan = this.plan();
    if (!schoolId || !plan) return;
    const items: DecisionItem[] = [];
    let missing = 0;
    for (const [enrollmentId, d] of this.drafts()) {
      if (!d.selected) continue;
      if (this.continues(d.decision) && !d.targetClassId) {
        missing++;
        continue;
      }
      items.push({ enrollmentId, decision: d.decision, targetClassId: this.continues(d.decision) ? d.targetClassId : null });
    }
    if (missing) {
      this.error.set(`${missing} élève(s) sélectionné(s) sans classe d’arrivée : choisissez-la ou créez la classe pour ${plan.toYearLabel}.`);
      return;
    }
    if (!items.length) {
      this.error.set('Sélectionnez au moins un élève.');
      return;
    }
    const count = (code: EnrollmentDecision) => items.filter((i) => i.decision === code).length;
    const ok = await this.confirmation.confirm({
      title: 'Enregistrer les décisions',
      message: `${items.length} élève(s) : ${count('PROMOTED')} admis, ${count('REPEATED')} redoublant(s), `
        + `${count('GRADUATED')} fin de cycle, ${count('LEFT')} départ(s). Les admis et redoublants seront réinscrits pour ${plan.toYearLabel}.`,
      confirmLabel: 'Enregistrer',
    });
    if (!ok) return;
    this.busy.set(true);
    this.clearMessages();
    this.api.apply(schoolId, plan.fromYearId, plan.toYearId, items).subscribe({
      next: (result) => {
        this.busy.set(false);
        this.success.set(`${result.applied} décision(s) enregistrée(s).`);
        this.skipped.set(result.skipped);
        this.refresh(new Set(result.skipped.map((s) => s.enrollmentId)));
      },
      error: (err) => this.fail(err, 'Impossible d’enregistrer les décisions.'),
    });
  }

  async undo(row: StudentPlan): Promise<void> {
    const ok = await this.confirmation.confirm({
      title: 'Annuler la décision',
      message: `La décision « ${this.label(row.decision)} » de ${row.firstName} ${row.lastName} sera annulée`
        + (row.targetClassName ? ` et sa réinscription en ${row.targetClassName} supprimée.` : '.'),
      confirmLabel: 'Annuler la décision',
      destructive: true,
    });
    if (!ok) return;
    this.busy.set(true);
    this.clearMessages();
    this.skipped.set([]);
    this.api.undo(row.enrollmentId).subscribe({
      next: () => {
        this.busy.set(false);
        this.success.set(`Décision annulée pour ${row.firstName} ${row.lastName}.`);
        this.refresh(new Set());
      },
      error: (err) => this.fail(err, 'Impossible d’annuler cette décision.'),
    });
  }

  // ------------------------------------------------------------------ interne

  private selectSchool(id: number): void {
    this.schoolId.set(id);
    localStorage.setItem('fasoecole_owner_school', String(id));
    this.yearFormOpen.set(false);
    this.plan.set(null);
    this.fromYearId.set(null);
    this.toYearId.set(null);
    this.classFilter.set('all');
    this.loading.set(true);
    this.reloadYears(null, null);
  }

  private reloadYears(fromId: number | null, toId: number | null): void {
    const schoolId = this.schoolId();
    if (!schoolId) return;
    this.api.overview(schoolId).subscribe({
      next: (overview) => {
        this.loading.set(false);
        this.years.set(overview.years);
        const ids = new Set(overview.years.map((y) => y.id));
        const current = overview.years.find((y) => y.current);
        const keepFrom = this.fromYearId();
        this.fromYearId.set(fromId && ids.has(fromId) ? fromId
          : keepFrom && ids.has(keepFrom) ? keepFrom
          : (current?.id ?? overview.years[overview.years.length - 1]?.id ?? null));
        const candidates = this.nextYearCandidates();
        const keepTo = this.toYearId();
        this.toYearId.set(toId && candidates.some((y) => y.id === toId) ? toId
          : keepTo && candidates.some((y) => y.id === keepTo) ? keepTo
          : this.closestNext(this.fromYearId()));
        this.loadPlan();
      },
      error: (err) => {
        this.loading.set(false);
        this.years.set([]);
        this.error.set(err?.error?.message ?? 'Impossible de charger les années scolaires.');
      },
    });
  }

  /** Recharge plan et compteurs en conservant les choix des élèves refusés par le serveur. */
  private refresh(keepIds: Set<number>): void {
    const kept = new Map([...this.drafts()].filter(([id]) => keepIds.has(id)));
    const schoolId = this.schoolId();
    const from = this.fromYearId();
    const to = this.toYearId();
    if (!schoolId || !from || !to) return;
    this.api.plan(schoolId, from, to).subscribe({ next: (plan) => this.setPlan(plan, kept) });
    this.api.overview(schoolId).subscribe({ next: (o) => this.years.set(o.years) });
  }

  private setPlan(plan: PromotionPlan, kept: Map<number, Draft>): void {
    this.plan.set(plan);
    const drafts = new Map<number, Draft>();
    for (const cls of plan.classes) {
      for (const s of cls.students) {
        if (!s.decided) {
          drafts.set(s.enrollmentId, kept.get(s.enrollmentId)
            ?? { decision: s.suggestedDecision, targetClassId: s.suggestedClassId, selected: false });
        }
      }
    }
    this.drafts.set(drafts);
  }

  private closestNext(fromId: number | null): number | null {
    const from = this.years().find((y) => y.id === fromId);
    if (!from) return null;
    return [...this.years()]
      .filter((y) => y.startDate > from.startDate)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0]?.id ?? null;
  }

  private patch(enrollmentId: number, change: (d: Draft) => void): void {
    const current = this.drafts().get(enrollmentId);
    if (!current) return;
    const copy = { ...current };
    change(copy);
    const next = new Map(this.drafts());
    next.set(enrollmentId, copy);
    this.drafts.set(next);
  }

  private suggestedYearForm() {
    const latest = [...this.years()].sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
    if (!latest) {
      const y = new Date().getFullYear();
      return { ...this.emptyYearForm(), label: `${y}-${y + 1}`, startDate: `${y}-10-01`, endDate: `${y + 1}-07-31`,
        makeCurrent: true };
    }
    const shift = (date: string) => {
      const [y, m, d] = date.split('-');
      return `${Number(y) + 1}-${m}-${m === '02' && d === '29' ? '28' : d}`;
    };
    const match = /^(\d{4})\s*[-–/]\s*(\d{4})$/.exec(latest.label.trim());
    return {
      label: match ? `${Number(match[1]) + 1}-${Number(match[2]) + 1}` : '',
      startDate: shift(latest.startDate),
      endDate: shift(latest.endDate),
      sourceYearId: latest.id as number | null,
      copyClasses: true,
      copyTeachers: true,
      copyPeriods: true,
      makeCurrent: false,
    };
  }

  private emptyYearForm() {
    return {
      label: '', startDate: '', endDate: '', sourceYearId: null as number | null,
      copyClasses: true, copyTeachers: true, copyPeriods: true, makeCurrent: false,
    };
  }

  private fail(err: { error?: { message?: string } } | null, fallback: string): void {
    this.busy.set(false);
    this.error.set(err?.error?.message ?? fallback);
  }

  private clearMessages(): void {
    this.error.set(null);
    this.success.set(null);
  }
}
