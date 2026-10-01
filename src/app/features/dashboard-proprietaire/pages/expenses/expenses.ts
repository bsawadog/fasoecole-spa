import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable, Subscription } from 'rxjs';
import { AuthService, RegistrationSchool } from '../../../../core/auth';
import { METHOD_LABELS, PaymentMethod } from '../../finance.service';
import {
  CategoryLine, ExpenseCategory, ExpenseRow, ExpensesService, ExpenseSummary,
} from '../../expenses.service';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';

type Tab = 'summary' | 'expenses' | 'budget' | 'categories';

const isoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const today = () => isoDate(new Date());
const monthStart = () => today().slice(0, 8) + '01';

@Component({
  selector: 'app-expenses',
  standalone: true,
  imports: [FormsModule, DecimalPipe],
  templateUrl: './expenses.html',
  styleUrl: './expenses.scss',
})
export class ExpensesPage implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly api = inject(ExpensesService);
  private readonly confirmation = inject(ConfirmationService);
  private requests = new Subscription();

  readonly methodLabels = METHOD_LABELS;
  readonly todayIso = today();
  readonly methods = Object.keys(METHOD_LABELS) as PaymentMethod[];
  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'summary', label: 'Bilan' },
    { id: 'expenses', label: 'Dépenses' },
    { id: 'budget', label: 'Budget annuel' },
    { id: 'categories', label: 'Catégories' },
  ];

  readonly schools = signal<RegistrationSchool[]>([]);
  readonly schoolId = signal<number | null>(null);
  readonly tab = signal<Tab>('summary');
  readonly summary = signal<ExpenseSummary | null>(null);
  readonly categories = signal<ExpenseCategory[]>([]);
  readonly expenses = signal<ExpenseRow[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly formOpen = signal(false);

  /** Catégories utilisables pour une saisie manuelle (la paie vient de la fiche enseignant). */
  readonly manualCategories = computed(() => this.categories().filter(c => c.active && c.systemCode !== 'PAYROLL'));
  readonly maxMonthly = computed(() =>
    Math.max(1, ...(this.summary()?.months ?? []).flatMap(m => [m.income, m.expenses])));

  yearId: number | null = null;
  from = monthStart();
  to = today();
  categoryFilter: number | null = null;
  search = '';
  editingId: number | null = null;
  form = this.emptyExpense();
  budget: Record<number, number> = {};
  categoryForm = { name: '', description: '' };
  editingCategoryId: number | null = null;

  ngOnInit(): void {
    const ownerId = this.auth.user()?.id;
    if (!ownerId) {
      this.loading.set(false);
      this.error.set('Impossible d’identifier votre compte propriétaire.');
      return;
    }
    this.auth.getOwnedSchools(ownerId, 'EXPENSES').subscribe({
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

  changeSchool(event: Event): void {
    const id = Number((event.target as HTMLSelectElement).value);
    if (this.schools().some(s => s.id === id)) this.selectSchool(id);
  }

  setTab(tab: Tab): void {
    this.tab.set(tab);
    this.formOpen.set(false);
    this.error.set(null);
    this.success.set(null);
    this.loadTab();
  }

  changeYear(): void {
    this.loadSummary();
  }

  monthLabel(month: string): string {
    const [year, m] = month.split('-').map(Number);
    return new Date(year, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  }

  width(value: number): number {
    return Math.round((value / this.maxMonthly()) * 100);
  }

  usage(line: CategoryLine): number {
    return Math.min(100, line.usedRate ?? 0);
  }

  filteredExpenses(): ExpenseRow[] {
    const term = this.search.trim().toLowerCase();
    if (!term) return this.expenses();
    return this.expenses().filter(e => `${e.label} ${e.supplier ?? ''} ${e.categoryName} ${e.reference ?? ''}`
      .toLowerCase().includes(term));
  }

  expensesTotal(): number {
    return this.filteredExpenses().reduce((sum, e) => sum + e.amount, 0);
  }

  budgetTotal(): number {
    return Object.values(this.budget).reduce((sum, v) => sum + (Number(v) || 0), 0);
  }

  // ------------------------------------------------------------ dépenses

  openExpense(row?: ExpenseRow): void {
    this.error.set(null);
    this.success.set(null);
    this.editingId = row?.id ?? null;
    this.form = row
      ? { categoryId: row.categoryId, expenseDate: row.expenseDate, amount: row.amount, label: row.label,
          supplier: row.supplier ?? '', method: row.method ?? 'CASH', reference: row.reference ?? '', notes: row.notes ?? '' }
      : this.emptyExpense();
    this.formOpen.set(true);
  }

  saveExpense(): void {
    const schoolId = this.schoolId();
    const f = this.form;
    const amount = Number(f.amount);
    if (!schoolId || !Number(f.categoryId) || !f.expenseDate || !f.label.trim() || !(amount > 0)) {
      this.error.set('Renseignez la catégorie, la date, le libellé et un montant supérieur à zéro.');
      return;
    }
    if (f.expenseDate > today()) {
      this.error.set('La date de la dépense ne peut pas être dans le futur.');
      return;
    }
    this.run(this.api.saveExpense(schoolId, {
      categoryId: Number(f.categoryId), expenseDate: f.expenseDate, amount, label: f.label.trim(),
      supplier: f.supplier.trim() || null, method: f.method, reference: f.reference.trim() || null,
      notes: f.notes.trim() || null,
    }, this.editingId ?? undefined), this.editingId ? 'Dépense modifiée.' : 'Dépense enregistrée.');
  }

  async deleteExpense(row: ExpenseRow): Promise<void> {
    const ok = await this.confirmation.confirm({
      title: 'Supprimer cette dépense ?',
      message: `« ${row.label} » du ${row.expenseDate} (${row.amount.toLocaleString('fr-FR')} FCFA) sera définitivement supprimée.`,
      confirmLabel: 'Supprimer',
      destructive: true,
    });
    if (ok) this.run(this.api.deleteExpense(row.id), 'Dépense supprimée.');
  }

  exportCsv(): void {
    const schoolId = this.schoolId();
    if (!schoolId) return;
    this.api.exportExpenses(schoolId, this.from, this.to, Number(this.categoryFilter) || null).subscribe({
      next: blob => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `depenses-${this.from || 'debut'}-${this.to || 'fin'}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
      },
      error: err => this.fail(err, 'Impossible d’exporter les dépenses.'),
    });
  }

  // ------------------------------------------------------------ budget

  saveBudget(): void {
    const schoolId = this.schoolId();
    const yearId = this.summary()?.year?.id;
    if (!schoolId || !yearId) {
      this.error.set('Créez d’abord une année scolaire pour définir un budget.');
      return;
    }
    const lines = Object.entries(this.budget).map(([categoryId, amount]) =>
      ({ categoryId: Number(categoryId), amount: Number(amount) || 0 }));
    if (lines.some(l => l.amount < 0)) {
      this.error.set('Les montants du budget ne peuvent pas être négatifs.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.success.set(null);
    this.api.saveBudget(schoolId, yearId, lines).subscribe({
      next: data => { this.applySummary(data); this.busy.set(false); this.success.set('Budget enregistré.'); },
      error: err => this.fail(err, 'Impossible d’enregistrer le budget.'),
    });
  }

  // ------------------------------------------------------------ catégories

  editCategory(category?: ExpenseCategory): void {
    this.editingCategoryId = category?.id ?? null;
    this.categoryForm = { name: category?.name ?? '', description: category?.description ?? '' };
  }

  saveCategory(): void {
    const schoolId = this.schoolId();
    if (!schoolId || !this.categoryForm.name.trim()) {
      this.error.set('Indiquez le nom de la catégorie.');
      return;
    }
    const current = this.categories().find(c => c.id === this.editingCategoryId);
    this.run(this.api.saveCategory(schoolId, {
      name: this.categoryForm.name.trim(), description: this.categoryForm.description.trim() || null,
      active: current?.active,
    }, this.editingCategoryId ?? undefined), this.editingCategoryId ? 'Catégorie modifiée.' : 'Catégorie ajoutée.',
    () => this.editCategory());
  }

  toggleCategory(category: ExpenseCategory): void {
    const schoolId = this.schoolId();
    if (!schoolId) return;
    this.run(this.api.saveCategory(schoolId, {
      name: category.name, description: category.description, active: !category.active,
    }, category.id), category.active ? 'Catégorie archivée.' : 'Catégorie réactivée.');
  }

  async deleteCategory(category: ExpenseCategory): Promise<void> {
    const ok = await this.confirmation.confirm({
      title: 'Supprimer cette catégorie ?',
      message: category.expenseCount
        ? `« ${category.name} » contient ${category.expenseCount} dépense(s) : elle sera archivée pour conserver l’historique.`
        : `« ${category.name} » sera définitivement supprimée.`,
      confirmLabel: category.expenseCount ? 'Archiver' : 'Supprimer',
      destructive: true,
    });
    if (!ok) return;
    this.busy.set(true);
    this.api.deleteCategory(category.id).subscribe({
      next: res => this.done(res.deleted ? 'Catégorie supprimée.' : 'Catégorie archivée (déjà utilisée).'),
      error: err => this.fail(err, 'Impossible de supprimer cette catégorie.'),
    });
  }

  // ------------------------------------------------------------ chargement

  loadTab(): void {
    switch (this.tab()) {
      case 'summary':
      case 'budget':
        this.loadSummary();
        break;
      case 'expenses':
        this.loadCategories();
        this.loadExpenses();
        break;
      case 'categories':
        this.loadCategories();
    }
  }

  loadExpenses(): void {
    const schoolId = this.schoolId();
    if (!schoolId) return;
    if (this.from && this.to && this.from > this.to) {
      this.error.set('La date de début doit précéder la date de fin.');
      return;
    }
    this.requests.add(this.api.expenses(schoolId, this.from, this.to, Number(this.categoryFilter) || null).subscribe({
      next: rows => this.expenses.set(rows),
      error: err => this.fail(err, 'Impossible de charger les dépenses.'),
    }));
  }

  private loadSummary(): void {
    const schoolId = this.schoolId();
    if (!schoolId) return;
    this.requests.add(this.api.summary(schoolId, this.yearId).subscribe({
      next: data => { this.applySummary(data); this.loading.set(false); },
      error: err => { this.loading.set(false); this.fail(err, 'Impossible de charger le bilan.'); },
    }));
  }

  private loadCategories(): void {
    const schoolId = this.schoolId();
    if (!schoolId) return;
    this.requests.add(this.api.categories(schoolId).subscribe({
      next: categories => {
        this.categories.set(categories);
        this.loading.set(false);
        if (!this.manualCategories().some(c => c.id === Number(this.form.categoryId))) {
          this.form.categoryId = this.manualCategories()[0]?.id ?? 0;
        }
      },
      error: err => { this.loading.set(false); this.fail(err, 'Impossible de charger les catégories.'); },
    }));
  }

  private applySummary(data: ExpenseSummary): void {
    this.summary.set(data);
    this.yearId = data.year?.id ?? null;
    this.budget = Object.fromEntries(data.categories.map(c => [c.categoryId, c.budget]));
  }

  private selectSchool(schoolId: number): void {
    this.requests.unsubscribe();
    this.requests = new Subscription();
    this.schoolId.set(schoolId);
    localStorage.setItem('fasoecole_owner_school', String(schoolId));
    this.loading.set(true);
    this.summary.set(null);
    this.expenses.set([]);
    this.yearId = null;
    this.categoryFilter = null;
    this.formOpen.set(false);
    if (this.tab() !== 'expenses' && this.tab() !== 'categories') this.loadCategories();
    this.loadTab();
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
    this.formOpen.set(false);
    this.success.set(message);
    this.loadTab();
  }

  private fail(err: { error?: { message?: string } }, fallback: string): void {
    this.busy.set(false);
    this.error.set(err?.error?.message ?? fallback);
  }

  private emptyExpense() {
    return { categoryId: this.manualCategories()[0]?.id ?? 0, expenseDate: today(), amount: null as number | null,
      label: '', supplier: '', method: 'CASH' as PaymentMethod, reference: '', notes: '' };
  }
}
