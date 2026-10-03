import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../../environments/environment';
import { SchoolDataSyncService } from '../../../../shared/school-data-sync.service';
import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin, Observable, Subscription } from 'rxjs';
import { AuthService, RegistrationSchool } from '../../../../core/auth';
import { ClassRecord, LevelRecord, OwnerManagementService } from '../../owner-management.service';
import {
  FeeFrequency, FeeTypeInfo, FinanceOverview, FinanceService, FREQUENCY_LABELS, InvoiceFilter, InvoiceRow,
  METHOD_LABELS, PaymentMethod, PaymentRow, STATUS_LABELS,
} from '../../finance.service';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';

type Tab = 'overview' | 'invoices' | 'payments' | 'catalog' | 'billing';
type Panel = { kind: 'pay' | 'discount'; invoice: InvoiceRow } | null;

const isoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const today = () => isoDate(new Date());
const monthStart = () => today().slice(0, 8) + '01';

@Component({
  selector: 'app-finance',
  standalone: true,
  imports: [FormsModule, RouterLink, DecimalPipe],
  templateUrl: './finance.html',
  styleUrl: './finance.scss',
})
export class FinancePage implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly sync = inject(SchoolDataSyncService);
  private syncSubscription?: Subscription;
  readonly balances = signal<{accounts:{account:string;opening_balance:number}[];receivables:{invoice_id:number;amount_at_closure:number;remaining:number;first_name:string;last_name:string;registration_number:string}[]} | null>(null);
  readonly balanceError = signal('');
  readonly carriedPayment = signal<number | null>(null);
  carriedAmount: number | null = null;
  private readonly auth = inject(AuthService);
  private readonly management = inject(OwnerManagementService);
  private readonly finance = inject(FinanceService);
  private readonly confirmation = inject(ConfirmationService);
  private requests = new Subscription();

  readonly frequencyLabels = FREQUENCY_LABELS;
  readonly methodLabels = METHOD_LABELS;
  readonly statusLabels = STATUS_LABELS;
  readonly frequencies = Object.keys(FREQUENCY_LABELS) as FeeFrequency[];
  readonly methods = Object.keys(METHOD_LABELS) as PaymentMethod[];
  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Vue d’ensemble' },
    { id: 'invoices', label: 'Impayés & factures' },
    { id: 'payments', label: 'Paiements & reçus' },
    { id: 'billing', label: 'Facturer' },
    { id: 'catalog', label: 'Catalogue des frais' },
  ];

  readonly schools = signal<RegistrationSchool[]>([]);
  readonly schoolId = signal<number | null>(null);
  readonly tab = signal<Tab>('overview');
  readonly levels = signal<LevelRecord[]>([]);
  readonly classes = signal<ClassRecord[]>([]);
  readonly overview = signal<FinanceOverview | null>(null);
  readonly feeTypes = signal<FeeTypeInfo[]>([]);
  readonly invoices = signal<InvoiceRow[]>([]);
  readonly payments = signal<PaymentRow[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly panel = signal<Panel>(null);
  readonly receipt = signal<PaymentRow | null>(null);

  invoiceFilter: InvoiceFilter = 'UNPAID';
  invoiceClassId: number | null = null;
  search = '';
  from = monthStart();
  to = today();
  feeForm = this.emptyFee();
  editingFeeId: number | null = null;
  bulk = { feeTypeId: 0, scope: 'school' as 'school' | 'level' | 'class', levelId: 0, classId: 0,
    dueDate: today(), amount: null as number | null };
  pay = { amount: 0, paymentDate: today(), method: 'CASH' as PaymentMethod };
  discount = { amount: 0, reason: '' };

  readonly activeFees = computed(() => this.feeTypes().filter(fee => fee.active));
  readonly paymentsTotal = computed(() => this.payments().reduce((sum, p) => sum + p.amount, 0));
  readonly schoolName = computed(() => this.schools().find(s => s.id === this.schoolId())?.name ?? '');

  ngOnInit(): void {
    const ownerId = this.auth.user()?.id;
    if (!ownerId) {
      this.loading.set(false);
      this.error.set('Impossible d’identifier votre compte propriétaire.');
      return;
    }
    this.auth.getOwnedSchools(ownerId, 'FINANCE').subscribe({
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
    this.syncSubscription?.unsubscribe();
    this.requests.unsubscribe();
  }

  changeSchool(event: Event): void {
    const id = Number((event.target as HTMLSelectElement).value);
    if (this.schools().some(s => s.id === id)) this.selectSchool(id);
  }

  setTab(tab: Tab): void {
    this.tab.set(tab);
    this.panel.set(null);
    this.success.set(null);
    this.error.set(null);
    this.loadTab();
  }

  filteredInvoices(): InvoiceRow[] {
    const term = this.search.trim().toLowerCase();
    if (!term) return this.invoices();
    return this.invoices().filter(row => `${row.studentName} ${row.registrationNumber} ${row.feeTypeName}`
      .toLowerCase().includes(term));
  }

  classLabel(schoolClass: ClassRecord | undefined): string {
    if (!schoolClass) return '';
    const level = this.levels().find(item => item.id === schoolClass.levelId);
    return level ? `${level.name} · ${schoolClass.name}` : schoolClass.name;
  }

  ratio(part: number, total: number): number {
    return total > 0 ? Math.min(100, Math.round((part / total) * 100)) : 0;
  }

  // ------------------------------------------------------------ catalogue

  editFee(fee: FeeTypeInfo): void {
    this.editingFeeId = fee.id;
    this.feeForm = { name: fee.name, amount: fee.amount, frequency: fee.frequency, levelId: fee.levelId ?? 0,
      description: fee.description ?? '' };
  }

  resetFee(): void {
    this.editingFeeId = null;
    this.feeForm = this.emptyFee();
  }

  saveFee(): void {
    const schoolId = this.schoolId();
    const form = this.feeForm;
    if (!schoolId || !form.name.trim() || form.amount == null || form.amount < 0) {
      this.error.set('Renseignez le nom et un montant positif.');
      return;
    }
    this.run(this.finance.saveFeeType(schoolId, {
      name: form.name.trim(), amount: Number(form.amount), frequency: form.frequency,
      levelId: Number(form.levelId) || null, description: form.description.trim() || null,
    }, this.editingFeeId ?? undefined), this.editingFeeId ? 'Frais mis à jour.' : 'Frais ajouté au catalogue.',
    () => this.resetFee());
  }

  toggleFee(fee: FeeTypeInfo): void {
    const schoolId = this.schoolId();
    if (!schoolId) return;
    this.run(this.finance.saveFeeType(schoolId, {
      name: fee.name, amount: fee.amount, frequency: fee.frequency, levelId: fee.levelId,
      description: fee.description, active: !fee.active,
    }, fee.id), fee.active ? 'Frais archivé : il ne peut plus être facturé.' : 'Frais réactivé.');
  }

  async deleteFee(fee: FeeTypeInfo): Promise<void> {
    const ok = await this.confirmation.confirm({
      title: 'Supprimer ce frais ?',
      message: fee.invoiceCount
        ? `« ${fee.name} » a déjà été facturé ${fee.invoiceCount} fois : il sera archivé pour conserver l’historique.`
        : `« ${fee.name} » sera définitivement supprimé du catalogue.`,
      confirmLabel: fee.invoiceCount ? 'Archiver' : 'Supprimer',
      destructive: true,
    });
    if (!ok) return;
    this.busy.set(true);
    this.finance.deleteFeeType(fee.id).subscribe({
      next: res => this.done(res.deleted ? 'Frais supprimé.' : 'Frais archivé (déjà facturé).'),
      error: err => this.fail(err, 'Impossible de supprimer ce frais.'),
    });
  }

  // ------------------------------------------------------------ facturation groupée

  async submitBulk(): Promise<void> {
    const schoolId = this.schoolId();
    const fee = this.feeTypes().find(f => f.id === Number(this.bulk.feeTypeId));
    if (!schoolId || !fee || !this.bulk.dueDate) {
      this.error.set('Choisissez un frais et une date d’échéance.');
      return;
    }
    if ((this.bulk.scope === 'class' && !Number(this.bulk.classId)) ||
        (this.bulk.scope === 'level' && !Number(this.bulk.levelId))) {
      this.error.set('Choisissez la classe ou le niveau à facturer.');
      return;
    }
    const target = this.bulk.scope === 'class'
      ? `la classe ${this.classLabel(this.classes().find(c => c.id === Number(this.bulk.classId)))}`
      : this.bulk.scope === 'level'
        ? `le niveau ${this.levels().find(l => l.id === Number(this.bulk.levelId))?.name}`
        : fee.levelName ? `toutes les classes de ${fee.levelName}` : 'tous les élèves de l’établissement';
    const amount = Number(this.bulk.amount) || fee.amount;
    const ok = await this.confirmation.confirm({
      title: 'Générer les factures ?',
      message: `« ${fee.name} » (${amount.toLocaleString('fr-FR')} FCFA, échéance ${this.bulk.dueDate}) sera facturé à ${target}. Les élèves déjà facturés pour cette échéance seront ignorés.`,
      confirmLabel: 'Facturer',
    });
    if (!ok) return;
    this.busy.set(true);
    this.error.set(null);
    this.finance.bulkInvoice(schoolId, {
      feeTypeId: fee.id,
      classId: this.bulk.scope === 'class' ? Number(this.bulk.classId) : null,
      levelId: this.bulk.scope === 'level' ? Number(this.bulk.levelId) : null,
      dueDate: this.bulk.dueDate,
      amount: Number(this.bulk.amount) || null,
    }).subscribe({
      next: res => this.done(`${res.created} facture(s) créée(s) sur ${res.targetedStudents} élève(s)` +
        (res.skipped ? `, ${res.skipped} déjà facturé(s) ignoré(s).` : '.')),
      error: err => this.fail(err, 'Impossible de générer les factures.'),
    });
  }

  // ------------------------------------------------------------ factures

  openPanel(kind: 'pay' | 'discount', invoice: InvoiceRow): void {
    this.panel.set({ kind, invoice });
    this.error.set(null);
    this.success.set(null);
    this.pay = { amount: invoice.balance, paymentDate: today(), method: 'CASH' };
    this.discount = { amount: invoice.discountAmount, reason: invoice.discountReason ?? '' };
  }

  exemptAll(invoice: InvoiceRow): void {
    this.discount = { amount: invoice.amountDue - invoice.paid, reason: this.discount.reason || 'Exonération' };
  }

  submitPayment(): void {
    const panel = this.panel();
    if (!panel) return;
    const amount = Number(this.pay.amount);
    if (!(amount > 0) || amount > panel.invoice.balance) {
      this.error.set(`Le montant doit être compris entre 1 et ${panel.invoice.balance.toLocaleString('fr-FR')} FCFA.`);
      return;
    }
    this.run(this.finance.recordPayment(panel.invoice.id, {
      amount, paymentDate: this.pay.paymentDate || null, method: this.pay.method,
    }), `Paiement de ${amount.toLocaleString('fr-FR')} FCFA enregistré pour ${panel.invoice.studentName}.`);
  }

  submitDiscount(): void {
    const panel = this.panel();
    const amount = Number(this.discount.amount);
    if (!panel || isNaN(amount) || amount < 0) {
      this.error.set('Le montant de la réduction doit être positif.');
      return;
    }
    if (amount > 0 && !this.discount.reason.trim()) {
      this.error.set('Indiquez le motif de la réduction ou de l’exonération.');
      return;
    }
    this.run(this.finance.applyDiscount(panel.invoice.id, amount, this.discount.reason.trim()),
      amount > 0 ? 'Réduction appliquée.' : 'Réduction retirée.');
  }

  async cancelInvoice(invoice: InvoiceRow): Promise<void> {
    const ok = await this.confirmation.confirm({
      title: 'Annuler ce frais ?',
      message: `« ${invoice.feeTypeName} » de ${invoice.studentName} ne sera plus réclamé. Les paiements déjà reçus restent enregistrés.`,
      confirmLabel: 'Annuler le frais',
      destructive: true,
    });
    if (ok) this.run(this.finance.cancelInvoice(invoice.id), 'Frais annulé.');
  }

  remind(invoice: InvoiceRow): void {
    this.busy.set(true);
    this.error.set(null);
    this.success.set(null);
    this.finance.sendReminder(invoice.id).subscribe({
      next: res => { this.busy.set(false); this.success.set(`Relance envoyée à ${res.recipients} destinataire(s).`); },
      error: err => this.fail(err, 'Impossible d’envoyer la relance.'),
    });
  }

  // ------------------------------------------------------------ paiements

  loadPayments(): void {
    const schoolId = this.schoolId();
    if (!schoolId) return;
    this.requests.add(this.finance.payments(schoolId, this.from, this.to).subscribe({
      next: rows => this.payments.set(rows),
      error: err => this.fail(err, 'Impossible de charger les paiements.'),
    }));
  }

  exportCsv(): void {
    const schoolId = this.schoolId();
    if (!schoolId) return;
    this.finance.exportPayments(schoolId, this.from, this.to).subscribe({
      next: blob => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `paiements-${this.from || 'debut'}-${this.to || 'fin'}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
      },
      error: err => this.fail(err, 'Impossible d’exporter les paiements.'),
    });
  }

  printReceipt(payment: PaymentRow): void {
    this.receipt.set(payment);
    setTimeout(() => {
      window.print();
      this.receipt.set(null);
    });
  }

  async deletePayment(payment: PaymentRow): Promise<void> {
    const ok = await this.confirmation.confirm({
      title: 'Supprimer ce paiement ?',
      message: `Le reçu ${payment.reference ?? ''} de ${payment.amount.toLocaleString('fr-FR')} FCFA (${payment.studentName}) sera supprimé et le solde recalculé. À utiliser pour corriger une erreur ou après un remboursement.`,
      confirmLabel: 'Supprimer',
      destructive: true,
    });
    if (ok) this.run(this.finance.deletePayment(payment.invoiceId, payment.id), 'Paiement supprimé.');
  }

  // ------------------------------------------------------------ chargement

  loadTab(): void {
    const schoolId = this.schoolId();
    if (!schoolId) return;
    switch (this.tab()) {
      case 'overview':
        this.requests.add(this.finance.overview(schoolId).subscribe({
          next: data => this.overview.set(data),
          error: err => this.fail(err, 'Impossible de charger le tableau financier.'),
        }));
        break;
      case 'invoices':
        this.requests.add(this.finance.invoices(schoolId, this.invoiceFilter, Number(this.invoiceClassId) || null).subscribe({
          next: rows => this.invoices.set(rows),
          error: err => this.fail(err, 'Impossible de charger les factures.'),
        }));
        break;
      case 'payments':
        this.loadPayments();
        break;
      default:
        this.requests.add(this.finance.feeTypes(schoolId).subscribe({
          next: fees => {
            this.feeTypes.set(fees);
            if (!fees.some(f => f.id === Number(this.bulk.feeTypeId) && f.active)) {
              this.bulk.feeTypeId = fees.find(f => f.active)?.id ?? 0;
            }
          },
          error: err => this.fail(err, 'Impossible de charger le catalogue des frais.'),
        }));
    }
  }

  private loadBalances(): void {
    const schoolId = this.schoolId(); if (!schoolId) return;
    const year = Number(localStorage.getItem(`fasoecole_year_${schoolId}`));
    if (!year) return;
    this.requests.add(this.http.get<NonNullable<ReturnType<typeof this.balances>>>(`${environment.apiUrl}/owner/enrollment/schools/${schoolId}/years/${year}/balances`).subscribe({
      next: result => { this.balances.set(result); this.balanceError.set(''); },
      error: () => this.balanceError.set('Impossible de charger les reports de l’année.'),
    }));
  }

  settleCarried(invoiceId: number): void {
    if (!this.carriedAmount || this.carriedAmount <= 0 || this.busy()) return;
    const row = this.balances()?.receivables.find(r => r.invoice_id === invoiceId);
    if (!row || this.carriedAmount > row.remaining) { this.error.set('Le paiement dépasse le solde restant.'); return; }
    this.run(this.finance.recordPayment(invoiceId,{amount:this.carriedAmount,paymentDate:this.pay.paymentDate,method:this.pay.method}),
      'Paiement du report enregistré sur la facture originale.', () => { this.carriedPayment.set(null); this.loadBalances(); this.loadTab(); });
  }

  private selectSchool(schoolId: number): void {
    this.requests.unsubscribe();
    this.requests = new Subscription();
    this.syncSubscription?.unsubscribe();
    this.schoolId.set(schoolId);
    this.balances.set(null);
    this.syncSubscription = this.sync.watch(schoolId).subscribe(() => { if (!this.loading()) { this.loadTab(); this.loadBalances(); } });
    this.auth.selectSchoolContext(schoolId);
    this.loading.set(true);
    this.panel.set(null);
    this.overview.set(null);
    this.invoiceClassId = null;
    this.requests.add(forkJoin({
      levels: this.management.getLevels(schoolId),
      classes: this.management.getClasses(schoolId),
      fees: this.finance.feeTypes(schoolId),
    }).subscribe({
      next: ({ levels, classes, fees }) => {
        this.levels.set(levels);
        this.classes.set(classes);
        this.feeTypes.set(fees);
        this.bulk.feeTypeId = fees.find(f => f.active)?.id ?? 0;
        this.loading.set(false);
        this.loadTab();
      },
      error: () => { this.loading.set(false); this.error.set('Impossible de charger les données de cet établissement.'); },
    }));
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
    this.panel.set(null);
    this.success.set(message);
    this.loadTab();
  }

  private fail(err: { error?: { message?: string } }, fallback: string): void {
    this.busy.set(false);
    this.error.set(err?.error?.message ?? fallback);
  }

  private emptyFee() {
    return { name: '', amount: null as number | null, frequency: 'YEARLY' as FeeFrequency, levelId: 0, description: '' };
  }
}
