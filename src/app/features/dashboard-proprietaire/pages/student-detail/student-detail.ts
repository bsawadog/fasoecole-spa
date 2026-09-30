import { Component, inject, OnInit, signal } from '@angular/core';
import { DecimalPipe, NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  CreateStudentInvoicePayload,
  CreateStudentPaymentPayload,
  FeeTypeRecord,
  OwnerManagementService,
  StudentDetail,
  StudentInvoiceInfo,
  StudentPaymentInfo,
  UpsertAttendancePayload,
} from '../../owner-management.service';

interface AttendanceForm {
  attendanceDate: string;
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
  justification: string;
}

interface InvoiceForm {
  feeTypeId: number | null;
  amountDue: number | null;
  dueDate: string;
}

interface PaymentForm {
  amount: number | null;
  paymentDate: string;
  method: 'CASH' | 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'CARD';
  reference: string;
}

@Component({
  selector: 'app-student-detail',
  standalone: true,
  imports: [DecimalPipe, FormsModule, NgClass],
  templateUrl: './student-detail.html',
  styleUrl: './student-detail.scss',
})
export class StudentDetailPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(OwnerManagementService);
  private studentId = 0;

  readonly detail = signal<StudentDetail | null>(null);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly saving = signal(false);
  readonly feeTypes = signal<FeeTypeRecord[]>([]);

  readonly addingAttendance = signal(false);
  readonly editingAttendanceId = signal<number | null>(null);
  attendanceForm: AttendanceForm = this.emptyAttendanceForm();

  readonly addingInvoice = signal(false);
  invoiceForm: InvoiceForm = this.emptyInvoiceForm();

  readonly payingInvoiceId = signal<number | null>(null);
  paymentForm: PaymentForm = this.emptyPaymentForm();

  ngOnInit(): void {
    this.studentId = Number(this.route.snapshot.paramMap.get('studentId'));
    if (!this.studentId) {
      this.errorMessage.set('Élève introuvable.');
      this.loading.set(false);
      return;
    }
    this.loadDetail();
  }

  private loadDetail(): void {
    this.api.getStudentDetail(this.studentId).subscribe({
      next: (detail) => {
        this.detail.set(detail);
        this.loading.set(false);
        this.api.getFeeTypes(detail.schoolId).subscribe({
          next: (types) => this.feeTypes.set(types),
          error: () => undefined,
        });
      },
      error: () => {
        this.errorMessage.set('Impossible de charger la fiche de l’élève.');
        this.loading.set(false);
      },
    });
  }

  goBack(): void {
    this.router.navigate(['/proprietaire/classes']);
  }

  printPage(): void {
    window.print();
  }

  today(): string {
    return new Date().toLocaleDateString('fr-FR');
  }

  initials(d: { firstName: string; lastName: string }): string {
    const a = d.firstName?.charAt(0) ?? '';
    const b = d.lastName?.charAt(0) ?? '';
    return (a + b).toUpperCase() || '?';
  }

  gradePercent(grade: { value: number; maxValue: number }): number {
    return grade.maxValue ? Math.round((grade.value / grade.maxValue) * 100) : 0;
  }

  statusLabel(status: string): string {
    switch (status) {
      case 'PRESENT': return 'Présent';
      case 'ABSENT': return 'Absent';
      case 'LATE': return 'Retard';
      case 'EXCUSED': return 'Absence justifiée';
      default: return status;
    }
  }

  attendanceBadgeClass(status: string): string {
    switch (status) {
      case 'PRESENT': return 'student-detail__badge--success';
      case 'ABSENT': return 'student-detail__badge--danger';
      case 'LATE': return 'student-detail__badge--warning';
      case 'EXCUSED': return 'student-detail__badge--info';
      default: return '';
    }
  }

  invoiceStatusLabel(status: string): string {
    switch (status) {
      case 'PENDING': return 'En attente';
      case 'PAID': return 'Payée';
      case 'OVERDUE': return 'En retard';
      case 'CANCELLED': return 'Annulée';
      default: return status;
    }
  }

  invoiceBadgeClass(status: string): string {
    switch (status) {
      case 'PAID': return 'student-detail__badge--success';
      case 'PENDING': return 'student-detail__badge--warning';
      case 'OVERDUE': return 'student-detail__badge--danger';
      case 'CANCELLED': return 'student-detail__badge--muted';
      default: return '';
    }
  }

  paymentMethodLabel(method: string): string {
    switch (method) {
      case 'CASH': return 'Espèces';
      case 'MOBILE_MONEY': return 'Mobile Money';
      case 'BANK_TRANSFER': return 'Virement bancaire';
      case 'CARD': return 'Carte';
      default: return method;
    }
  }

  allPayments(): Array<StudentPaymentInfo & { feeTypeName: string; invoiceStatus: string }> {
    const d = this.detail();
    if (!d) return [];
    return d.invoices
      .flatMap((inv) => inv.payments.map((p) => ({ ...p, feeTypeName: inv.feeTypeName, invoiceStatus: inv.status })))
      .sort((a, b) => a.paymentDate.localeCompare(b.paymentDate) || a.id - b.id);
  }

  printReceiptById(paymentId: number): void {
    const d = this.detail();
    if (!d) return;
    for (const inv of d.invoices) {
      const payment = inv.payments.find((p) => p.id === paymentId);
      if (payment) {
        this.printReceipt(inv, payment);
        return;
      }
    }
  }

  // --- Présences / retards / absences ---

  openAddAttendance(): void {
    this.editingAttendanceId.set(null);
    this.attendanceForm = this.emptyAttendanceForm();
    this.addingAttendance.set(true);
    this.errorMessage.set(null);
  }

  startEditAttendance(record: { id: number; attendanceDate: string; status: string; justification: string | null }): void {
    this.addingAttendance.set(false);
    this.editingAttendanceId.set(record.id);
    this.attendanceForm = {
      attendanceDate: record.attendanceDate,
      status: record.status as AttendanceForm['status'],
      justification: record.justification ?? '',
    };
    this.errorMessage.set(null);
  }

  cancelAttendanceForm(): void {
    this.addingAttendance.set(false);
    this.editingAttendanceId.set(null);
  }

  submitAttendance(): void {
    if (!this.attendanceForm.attendanceDate || !this.attendanceForm.status) {
      this.errorMessage.set('Veuillez renseigner la date et le statut.');
      return;
    }
    const payload: UpsertAttendancePayload = {
      attendanceDate: this.attendanceForm.attendanceDate,
      status: this.attendanceForm.status,
      justification: this.attendanceForm.justification.trim() || null,
    };
    this.saving.set(true);
    const editingId = this.editingAttendanceId();
    const request$ = editingId
      ? this.api.updateStudentAttendance(this.studentId, editingId, payload)
      : this.api.addStudentAttendance(this.studentId, payload);

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.addingAttendance.set(false);
        this.editingAttendanceId.set(null);
        this.successMessage.set(editingId ? 'La présence a été mise à jour.' : 'La présence a été ajoutée.');
        this.loadDetail();
      },
      error: () => this.fail('L’enregistrement de la présence a échoué.'),
    });
  }

  removeAttendance(attendanceId: number): void {
    if (!window.confirm('Supprimer cet enregistrement de présence ?')) return;
    this.saving.set(true);
    this.api.deleteStudentAttendance(this.studentId, attendanceId).subscribe({
      next: () => {
        this.saving.set(false);
        this.successMessage.set('L’enregistrement a été supprimé.');
        this.loadDetail();
      },
      error: () => this.fail('La suppression a échoué.'),
    });
  }

  // --- Frais de scolarité / factures ---

  openAddInvoice(): void {
    this.invoiceForm = this.emptyInvoiceForm();
    this.addingInvoice.set(true);
    this.errorMessage.set(null);
  }

  cancelInvoiceForm(): void {
    this.addingInvoice.set(false);
  }

  onFeeTypeChange(): void {
    const feeType = this.feeTypes().find((f) => f.id === this.invoiceForm.feeTypeId);
    if (feeType && !this.invoiceForm.amountDue) {
      this.invoiceForm.amountDue = feeType.amount;
    }
  }

  submitInvoice(): void {
    if (!this.invoiceForm.feeTypeId || !this.invoiceForm.dueDate) {
      this.errorMessage.set('Veuillez choisir un type de frais et une date d’échéance.');
      return;
    }
    const payload: CreateStudentInvoicePayload = {
      feeTypeId: this.invoiceForm.feeTypeId,
      amountDue: this.invoiceForm.amountDue,
      dueDate: this.invoiceForm.dueDate,
      academicYearId: null,
    };
    this.saving.set(true);
    this.api.createStudentInvoice(this.studentId, payload).subscribe({
      next: () => {
        this.saving.set(false);
        this.addingInvoice.set(false);
        this.successMessage.set('Le frais a été ajouté à l’élève.');
        this.loadDetail();
      },
      error: (err) => this.fail(err?.error?.message ?? 'La création du frais a échoué.'),
    });
  }

  cancelInvoice(invoiceId: number): void {
    if (!window.confirm('Annuler ce frais ? Il restera visible mais ne pourra plus recevoir de paiement.')) return;
    this.saving.set(true);
    this.api.cancelStudentInvoice(this.studentId, invoiceId).subscribe({
      next: () => {
        this.saving.set(false);
        this.successMessage.set('Le frais a été annulé.');
        this.loadDetail();
      },
      error: () => this.fail('L’annulation a échoué.'),
    });
  }

  isInvoiceActionable(invoice: StudentInvoiceInfo): boolean {
    return invoice.status !== 'CANCELLED';
  }

  canPayInvoice(invoice: StudentInvoiceInfo): boolean {
    return this.isInvoiceActionable(invoice) && invoice.balance > 0;
  }

  openAddPayment(invoice: StudentInvoiceInfo): void {
    this.payingInvoiceId.set(invoice.id);
    this.paymentForm = {
      amount: invoice.balance > 0 ? invoice.balance : null,
      paymentDate: new Date().toISOString().slice(0, 10),
      method: 'CASH',
      reference: '',
    };
    this.errorMessage.set(null);
  }

  cancelPaymentForm(): void {
    this.payingInvoiceId.set(null);
  }

  submitPayment(invoiceId: number): void {
    if (!this.paymentForm.amount || this.paymentForm.amount <= 0) {
      this.errorMessage.set('Veuillez indiquer un montant valide.');
      return;
    }
    const payload: CreateStudentPaymentPayload = {
      amount: this.paymentForm.amount,
      paymentDate: this.paymentForm.paymentDate || null,
      method: this.paymentForm.method,
      reference: null,
    };
    this.saving.set(true);
    this.api.addStudentPayment(this.studentId, invoiceId, payload).subscribe({
      next: () => {
        this.saving.set(false);
        this.payingInvoiceId.set(null);
        this.successMessage.set('Le paiement a été enregistré.');
        this.loadDetail();
      },
      error: (err) => this.fail(err?.error?.message ?? 'L’enregistrement du paiement a échoué.'),
    });
  }

  printReceipt(invoice: StudentInvoiceInfo, payment: StudentPaymentInfo): void {
    const d = this.detail();
    if (!d) return;
    const receiptWindow = window.open('', '_blank', 'width=420,height=640');
    if (!receiptWindow) {
      this.errorMessage.set('Veuillez autoriser les fenêtres popup pour imprimer le reçu.');
      return;
    }

    const priorPayments = invoice.payments
      .filter((p) => p.id !== payment.id)
      .slice()
      .sort((a, b) => a.paymentDate.localeCompare(b.paymentDate) || a.id - b.id);

    const historyRows = priorPayments.length
      ? priorPayments.map((p) =>
          `<tr><td>${p.reference}</td><td>${p.paymentDate}</td><td>${this.paymentMethodLabel(p.method)}</td><td class="value">${p.amount}</td></tr>`
        ).join('')
      : '<tr><td colspan="4" class="student-detail__muted-cell">Aucun paiement antérieur</td></tr>';

    const html = `
      <html>
        <head>
          <title>Reçu de paiement ${payment.reference ?? ''}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; color: #1e293b; }
            h1 { font-size: 1.1rem; text-align: center; margin: 0 0 0.3rem; }
            h2 { font-size: 0.9rem; margin: 1.1rem 0 0.4rem; color: #334155; }
            .sub { text-align: center; color: #64748b; font-size: 0.8rem; margin-bottom: 1rem; }
            table { width: 100%; border-collapse: collapse; margin-top: 0.8rem; }
            td, th { padding: 0.35rem 0.2rem; font-size: 0.85rem; border-bottom: 1px dashed #cbd5e1; text-align: left; }
            th { font-size: 0.75rem; color: #64748b; font-weight: 600; }
            td.label { color: #64748b; }
            td.value, th.value { text-align: right; font-weight: 600; }
            .student-detail__muted-cell { color: #94a3b8; text-align: center; font-style: italic; }
            .total { margin-top: 0.8rem; font-size: 1rem; text-align: right; font-weight: 700; }
            .balance { margin-top: 0.3rem; font-size: 0.95rem; text-align: right; font-weight: 700; color: #b91c1c; }
            .balance.paid { color: #15803d; }
            .footer { margin-top: 2rem; font-size: 0.75rem; text-align: center; color: #94a3b8; }
          </style>
        </head>
        <body>
          <h1>Reçu de paiement</h1>
          <div class="sub">${d.schoolName}</div>
          <table>
            <tr><td class="label">Référence</td><td class="value">${payment.reference ?? '—'}</td></tr>
            <tr><td class="label">Élève</td><td class="value">${d.lastName} ${d.firstName}</td></tr>
            <tr><td class="label">Matricule</td><td class="value">${d.registrationNumber}</td></tr>
            <tr><td class="label">Frais</td><td class="value">${invoice.feeTypeName}</td></tr>
            <tr><td class="label">Montant total dû</td><td class="value">${invoice.amountDue}</td></tr>
            <tr><td class="label">Date du paiement</td><td class="value">${payment.paymentDate}</td></tr>
            <tr><td class="label">Méthode</td><td class="value">${this.paymentMethodLabel(payment.method)}</td></tr>
          </table>
          <div class="total">Montant reçu ce jour : ${payment.amount}</div>

          <h2>Historique des paiements antérieurs</h2>
          <table>
            <thead>
              <tr><th>Référence</th><th>Date</th><th>Méthode</th><th class="value">Montant</th></tr>
            </thead>
            <tbody>
              ${historyRows}
            </tbody>
          </table>

          <div class="total">Total payé à ce jour : ${invoice.totalPaid}</div>
          <div class="balance ${invoice.balance <= 0 ? 'paid' : ''}">Solde restant : ${invoice.balance}</div>
          <div class="footer">Reçu généré le ${new Date().toLocaleString('fr-FR')}</div>
        </body>
      </html>`;
    receiptWindow.document.write(html);
    receiptWindow.document.close();
    receiptWindow.focus();
    setTimeout(() => receiptWindow.print(), 250);
  }

  private emptyAttendanceForm(): AttendanceForm {
    return { attendanceDate: new Date().toISOString().slice(0, 10), status: 'ABSENT', justification: '' };
  }

  private emptyInvoiceForm(): InvoiceForm {
    return { feeTypeId: null, amountDue: null, dueDate: new Date().toISOString().slice(0, 10) };
  }

  private emptyPaymentForm(): PaymentForm {
    return { amount: null, paymentDate: new Date().toISOString().slice(0, 10), method: 'CASH', reference: '' };
  }

  private fail(message: string): void {
    this.saving.set(false);
    this.errorMessage.set(message);
  }
}
