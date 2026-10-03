import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AuthService, RegistrationSchool } from '../../../../core/auth';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';
import {
  ClassPlan,
  DECISION_LABELS,
  DecisionItem,
  EnrollmentDecision,
  EnrollmentFee,
  EnrollmentService,
  GuardianOption,
  PaymentMethodCode,
  PromotionPlan,
  RegistrationResult,
  StudentPlan,
  TargetClass,
  YearInfo,
} from '../../enrollment.service';

/** Classe d'accueil possible, avec son année scolaire. */
export interface HostClass extends TargetClass {
  yearId: number;
  yearLabel: string;
  currentYear: boolean;
}

export interface HostClassGroup {
  yearId: number;
  label: string;
  classes: HostClass[];
}

interface GuardianDraft {
  /** 'new' : saisie d'un nouveau parent ; 'existing' : parent déjà enregistré. */
  mode: 'new' | 'existing';
  selected: GuardianOption | null;
  query: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  relationship: string;
}

interface Draft {
  decision: EnrollmentDecision;
  targetClassId: number | null;
  selected: boolean;
}

@Component({
  selector: 'app-enrollment',
  standalone: true,
  imports: [FormsModule, RouterLink],
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

  readonly newStudentOpen = signal(false);
  readonly newStudentClasses = signal<HostClass[]>([]);
  /** Classes d'accueil regroupées par année : l'année en cours d'abord, puis les suivantes, puis les passées. */
  readonly newStudentClassGroups = computed<HostClassGroup[]>(() => {
    const groups: HostClassGroup[] = [];
    for (const c of this.newStudentClasses()) {
      let group = groups.find((g) => g.yearId === c.yearId);
      if (!group) {
        group = { yearId: c.yearId, label: c.currentYear ? `${c.yearLabel} (en cours)` : c.yearLabel, classes: [] };
        groups.push(group);
      }
      group.classes.push(c);
    }
    return groups;
  });
  readonly newStudentClassesLoading = signal(false);
  readonly lastRegistration = signal<RegistrationResult | null>(null);
  readonly enrollmentFees = signal<EnrollmentFee[]>([]);
  readonly paymentMethods: { code: PaymentMethodCode; label: string }[] = [
    { code: 'CASH', label: 'Espèces' },
    { code: 'MOBILE_MONEY', label: 'Mobile Money' },
    { code: 'BANK_TRANSFER', label: 'Virement bancaire' },
    { code: 'CARD', label: 'Carte' },
  ];
  feeChoices: Record<number, { selected: boolean; amountPaid: number | null }> = {};
  newStudentForm = this.emptyNewStudentForm();
  readonly relationships = ['Père', 'Mère', 'Tuteur', 'Tutrice', 'Autre'];
  guardians: GuardianDraft[] = [this.emptyGuardian()];
  /** Résultats de recherche d'un parent existant, par position du parent dans le formulaire. */
  readonly guardianResults = signal<Record<number, GuardianOption[]>>({});
  readonly guardianSearching = signal<number | null>(null);
  private readonly guardianTimers = new Map<number, ReturnType<typeof setTimeout>>();

  addGuardian(): void {
    if (this.guardians.length < 2) {
      this.guardians = [...this.guardians, { ...this.emptyGuardian(), relationship: this.guardians[0]?.relationship === 'Père' ? 'Mère' : 'Père' }];
    }
  }

  removeGuardian(index: number): void {
    if (index > 0) {
      this.guardians = this.guardians.filter((_, i) => i !== index);
      this.guardianResults.set({});
    }
  }

  setGuardianMode(index: number, mode: GuardianDraft['mode']): void {
    const g = this.guardians[index];
    g.mode = mode;
    g.selected = null;
    g.query = '';
    this.guardianResults.update((r) => ({ ...r, [index]: [] }));
  }

  /** Recherche (différée) d'un parent déjà enregistré dans l'établissement. */
  searchGuardian(index: number, text: string): void {
    const schoolId = this.schoolId();
    clearTimeout(this.guardianTimers.get(index));
    const q = text.trim();
    if (!schoolId || q.length < 2) {
      this.guardianResults.update((r) => ({ ...r, [index]: [] }));
      return;
    }
    this.guardianTimers.set(index, setTimeout(() => {
      this.guardianSearching.set(index);
      this.api.searchGuardians(schoolId, q).subscribe({
        next: (options) => {
          this.guardianSearching.set(null);
          this.guardianResults.update((r) => ({ ...r, [index]: options }));
        },
        error: (err) => {
          this.guardianSearching.set(null);
          this.error.set(err?.error?.message ?? 'Impossible de rechercher les parents.');
        },
      });
    }, 300));
  }

  selectGuardian(index: number, option: GuardianOption): void {
    if (this.guardians.some((g, i) => i !== index && g.selected?.parentId === option.parentId)) {
      this.error.set(`${option.firstName} ${option.lastName} est déjà choisi(e) comme parent de cet élève.`);
      return;
    }
    this.guardians[index].selected = option;
    this.guardianResults.update((r) => ({ ...r, [index]: [] }));
  }

  private emptyGuardian(): GuardianDraft {
    return { mode: 'new', selected: null, query: '', firstName: '', lastName: '', email: '', phone: '', relationship: 'Père' };
  }

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

  // ------------------------------------------------------------------ nouvel élève

  openNewStudent(): void {
    this.clearMessages();
    this.newStudentForm = this.emptyNewStudentForm();
    this.guardians = [this.emptyGuardian()];
    this.newStudentOpen.set(true);
    this.loadHostClasses();
    this.loadEnrollmentFees();
  }

  closeNewStudent(): void {
    this.newStudentOpen.set(false);
  }

  selectedHostClass(): HostClass | null {
    return this.newStudentClasses().find((c) => c.id === Number(this.newStudentForm.classId)) ?? null;
  }

  /** Frais proposés pour la classe choisie : frais généraux + frais propres à son niveau. */
  availableFees(): EnrollmentFee[] {
    const levelId = this.newStudentClasses().find((c) => c.id === Number(this.newStudentForm.classId))?.levelId;
    return this.enrollmentFees().filter((f) => f.levelId == null || f.levelId === levelId);
  }

  toggleFee(fee: EnrollmentFee, selected: boolean): void {
    this.feeChoices[fee.id] = { selected, amountPaid: selected ? fee.amount : null };
  }

  selectedFees(): EnrollmentFee[] {
    return this.availableFees().filter((f) => this.feeChoices[f.id]?.selected);
  }

  totalDue(): number {
    return this.selectedFees().reduce((sum, f) => sum + Number(f.amount), 0);
  }

  totalPaid(): number {
    return this.selectedFees().reduce((sum, f) => sum + (Number(this.feeChoices[f.id]?.amountPaid) || 0), 0);
  }

  remaining(fee: EnrollmentFee): number {
    return Number(fee.amount) - (Number(this.feeChoices[fee.id]?.amountPaid) || 0);
  }

  formatAmount(value: number): string {
    return `${new Intl.NumberFormat('fr-FR').format(Number(value) || 0)} FCFA`;
  }

  paymentMethodLabel(code: string | null): string {
    return this.paymentMethods.find((m) => m.code === code)?.label ?? code ?? '';
  }

  private loadEnrollmentFees(): void {
    const schoolId = this.schoolId();
    if (!schoolId) return;
    this.api.enrollmentFees(schoolId).subscribe({
      next: (fees) => {
        this.enrollmentFees.set(fees);
        this.feeChoices = Object.fromEntries(fees.map((f) => [f.id, { selected: false, amountPaid: null }]));
      },
      error: () => this.enrollmentFees.set([]),
    });
  }

  /** Charge les classes de toutes les années de l'établissement (comme « Élèves par classe »). */
  private loadHostClasses(): void {
    const schoolId = this.schoolId();
    this.newStudentClasses.set([]);
    this.newStudentForm.classId = null;
    const years = this.orderedYears();
    if (!schoolId || !years.length) return;
    this.newStudentClassesLoading.set(true);
    forkJoin(years.map((y) => this.api.yearClasses(schoolId, y.id))).subscribe({
      next: (lists) => {
        this.newStudentClassesLoading.set(false);
        const classes = lists.flatMap((list, i) => list.map((c): HostClass => ({
          ...c, yearId: years[i].id, yearLabel: years[i].label, currentYear: years[i].current,
        })));
        this.newStudentClasses.set(classes);
        this.newStudentForm.classId = classes.find((c) => !this.isFull(c))?.id ?? null;
      },
      error: (err) => {
        this.newStudentClassesLoading.set(false);
        this.error.set(err?.error?.message ?? 'Impossible de charger les classes de l’établissement.');
      },
    });
  }

  /** Année en cours d'abord, puis les années à venir (chronologiquement), puis les années passées (plus récente d'abord). */
  private orderedYears(): YearInfo[] {
    const years = this.years();
    const current = years.find((y) => y.current);
    const ref = current?.startDate ?? '';
    const upcoming = years.filter((y) => !y.current && y.startDate > ref)
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
    const past = years.filter((y) => !y.current && y.startDate <= ref)
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
    return [...(current ? [current] : []), ...upcoming, ...past];
  }
  isFull(target: TargetClass): boolean {
    return target.capacity != null && target.enrolled >= target.capacity;
  }

  registerStudent(): void {
    const schoolId = this.schoolId();
    const f = this.newStudentForm;
    if (!schoolId) return;
    if (!f.classId || !f.firstName.trim() || !f.lastName.trim() || !f.email.trim()
      || f.password.trim().length < 8) {
      this.error.set('Renseignez la classe, le prénom, le nom, le courriel et un mot de passe de 8 caractères minimum.');
      return;
    }
    if (this.guardians.some((g) => g.mode === 'existing' && !g.selected)) {
      this.error.set('Recherchez et choisissez le parent existant, ou saisissez un nouveau parent.');
      return;
    }
    if (this.guardians.some((g) => g.mode === 'new' && (!g.firstName.trim() || !g.lastName.trim()))) {
      this.error.set('Renseignez au moins le prénom et le nom du parent ou tuteur.');
      return;
    }
    const target = this.newStudentClasses().find((c) => c.id === Number(f.classId));
    const fees = this.selectedFees().map((fee) => ({
      fee, amountPaid: Number(this.feeChoices[fee.id]?.amountPaid) || 0,
    }));
    const invalid = fees.find((l) => l.amountPaid < 0 || l.amountPaid > Number(l.fee.amount));
    if (invalid) {
      this.error.set(`Le montant versé pour « ${invalid.fee.name} » doit être compris entre 0 et ${this.formatAmount(invalid.fee.amount)}.`);
      return;
    }
    const paying = fees.some((l) => l.amountPaid > 0);
    if (paying && !f.paymentMethod) {
      this.error.set('Choisissez le mode de paiement.');
      return;
    }
    this.busy.set(true);
    this.clearMessages();
    this.api.registerStudent(schoolId, {
      classId: Number(f.classId),
      firstName: f.firstName.trim(),
      lastName: f.lastName.trim(),
      email: f.email.trim(),
      password: f.password.trim(),
      phone: f.phone.trim() || null,
      registrationNumber: null,
      birthDate: f.birthDate || null,
      gender: f.gender || null,
      fees: fees.map((l) => ({ feeTypeId: l.fee.id, amountPaid: l.amountPaid })),
      paymentMethod: paying ? f.paymentMethod : null,
      paymentDate: paying ? (f.paymentDate || null) : null,
      guardians: this.guardians.map((g) => g.mode === 'existing' && g.selected ? {
        parentId: g.selected.parentId,
        firstName: g.selected.firstName,
        lastName: g.selected.lastName,
        email: null,
        phone: null,
        relationship: g.relationship || null,
      } : {
        parentId: null,
        firstName: g.firstName.trim(),
        lastName: g.lastName.trim(),
        email: g.email.trim() || null,
        phone: g.phone.trim() || null,
        relationship: g.relationship || null,
      }),
    }).subscribe({
      next: (result) => {
        this.busy.set(false);
        const row = result.student;
        const name = `${row.firstName} ${row.lastName}`;
        const paid = result.invoices.reduce((s, i) => s + Number(i.totalPaid), 0);
        this.success.set(`${name} est inscrit(e) en ${result.className} (${result.yearLabel}) sous le matricule ${row.registrationNumber}.`
          + (paid > 0 ? ` Paiement de ${this.formatAmount(paid)} enregistré.` : ''));
        this.lastRegistration.set(result);
        this.newStudentForm = { ...this.emptyNewStudentForm(), classId: f.classId, paymentMethod: f.paymentMethod };
        this.guardians = [this.emptyGuardian()];
        this.feeChoices = Object.fromEntries(this.enrollmentFees().map((fee) => [fee.id, { selected: false, amountPaid: null }]));
        this.newStudentClasses.update((list) => list.map((c) => c.id === target?.id ? { ...c, enrolled: c.enrolled + 1 } : c));
        this.refreshCounts();
        if (paid > 0) this.printEnrollmentReceipt(result);
      },
      error: (err) => this.fail(err, 'L’inscription de l’élève a échoué.'),
    });
  }

  hasPayments(result: RegistrationResult): boolean {
    return result.invoices.some((i) => i.payments.length > 0);
  }

  printEnrollmentReceipt(result: RegistrationResult): void {
    const receipt = window.open('', '_blank', 'width=480,height=680');
    if (!receipt) {
      this.error.set('Autorisez les fenêtres popup pour imprimer le reçu, puis cliquez sur « Imprimer le reçu ».');
      return;
    }
    const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
    const s = result.student;
    const guardianNames = (s.parents ?? [])
      .map((p) => `${esc(p.lastName)} ${esc(p.firstName)}${p.phone ? ` (${esc(p.phone)})` : ''}`).join('<br>');
    const payments = result.invoices.flatMap((i) => i.payments);
    const references = payments.map((p) => p.reference).filter(Boolean).join(', ');
    const method = this.paymentMethodLabel(payments[0]?.method ?? null);
    const date = payments[0]?.paymentDate ? this.formatDate(payments[0].paymentDate) : this.formatDate(new Date().toISOString().slice(0, 10));
    const totalDue = result.invoices.reduce((sum, i) => sum + Number(i.amountDue), 0);
    const totalPaid = result.invoices.reduce((sum, i) => sum + Number(i.totalPaid), 0);
    const totalBalance = result.invoices.reduce((sum, i) => sum + Number(i.balance), 0);
    const rows = result.invoices.map((i) => `<tr><td>${esc(i.feeTypeName)}</td>`
      + `<td class="num">${esc(this.formatAmount(i.amountDue))}</td>`
      + `<td class="num">${esc(this.formatAmount(i.totalPaid))}</td>`
      + `<td class="num">${esc(this.formatAmount(i.balance))}</td></tr>`).join('');
    receipt.document.write(`<html><head><title>Reçu d’inscription ${esc(references)}</title><style>
      body { font-family: Arial, sans-serif; padding: 20px; color: #1e293b; }
      h1 { font-size: 1.15rem; text-align: center; margin: 0 0 .2rem; }
      .sub { text-align: center; color: #64748b; font-size: .85rem; margin-bottom: 1rem; }
      table { width: 100%; border-collapse: collapse; margin-top: .8rem; }
      td, th { padding: .35rem .2rem; font-size: .85rem; border-bottom: 1px dashed #cbd5e1; text-align: left; }
      th { font-size: .75rem; color: #64748b; } .label { color: #64748b; } .value, .num { text-align: right; font-weight: 600; }
      .total { margin-top: .8rem; text-align: right; font-weight: 700; } .balance { color: #b91c1c; } .paid { color: #15803d; }
      .sign { margin-top: 2.5rem; display: flex; justify-content: space-between; font-size: .8rem; color: #475569; }
      .footer { margin-top: 2rem; font-size: .75rem; text-align: center; color: #94a3b8; }
    </style></head><body>
      <h1>Reçu d’inscription</h1>
      <div class="sub">${esc(result.schoolName)} · Année ${esc(result.yearLabel)}</div>
      <table>
        <tr><td class="label">Référence(s)</td><td class="value">${esc(references || '—')}</td></tr>
        <tr><td class="label">Élève</td><td class="value">${esc(s.lastName)} ${esc(s.firstName)}</td></tr>
        <tr><td class="label">Matricule</td><td class="value">${esc(s.registrationNumber)}</td></tr>
        <tr><td class="label">Classe</td><td class="value">${esc(result.className)}</td></tr>
        ${guardianNames ? `<tr><td class="label">Parent / tuteur</td><td class="value">${guardianNames}</td></tr>` : ''}
        <tr><td class="label">Date du paiement</td><td class="value">${esc(date)}</td></tr>
        <tr><td class="label">Mode de paiement</td><td class="value">${esc(method || '—')}</td></tr>
      </table>
      <table><thead><tr><th>Frais</th><th class="num">Montant dû</th><th class="num">Versé</th><th class="num">Reste</th></tr></thead>
        <tbody>${rows}</tbody></table>
      <div class="total">Total dû : ${esc(this.formatAmount(totalDue))}</div>
      <div class="total paid">Montant reçu : ${esc(this.formatAmount(totalPaid))}</div>
      <div class="total ${totalBalance > 0 ? 'balance' : 'paid'}">Reste à payer : ${esc(this.formatAmount(totalBalance))}</div>
      <div class="sign"><span>Signature du parent</span><span>Cachet et signature de l’école</span></div>
      <div class="footer">Reçu généré le ${esc(new Date().toLocaleString('fr-FR'))}</div>
    </body></html>`);
    receipt.document.close();
    receipt.focus();
    setTimeout(() => receipt.print(), 250);
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
    this.auth.selectSchoolContext(id);
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

  private refreshCounts(): void {
    const schoolId = this.schoolId();
    if (!schoolId) return;
    this.api.overview(schoolId).subscribe({ next: (o) => this.years.set(o.years) });
    if (this.plan()) this.refresh(new Set([...this.drafts().keys()]));
  }

  private emptyNewStudentForm() {
    return {
      classId: null as number | null, firstName: '', lastName: '', email: '', password: '', phone: '',
      registrationNumber: '', birthDate: '', gender: '',
      paymentMethod: 'CASH' as PaymentMethodCode | null, paymentDate: new Date().toISOString().slice(0, 10),
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
    this.lastRegistration.set(null);
  }
}
