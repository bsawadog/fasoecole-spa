import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type FeeFrequency = 'ONE_TIME' | 'MONTHLY' | 'TERM' | 'YEARLY';
export type PaymentMethod = 'CASH' | 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'CARD';
export type InvoiceFilter = 'UNPAID' | 'OVERDUE' | 'PENDING' | 'PAID' | 'CANCELLED' | 'ALL';

export interface FeeTypeInfo {
  id: number;
  name: string;
  amount: number;
  frequency: FeeFrequency;
  levelId: number | null;
  levelName: string | null;
  description: string | null;
  active: boolean;
  invoiceCount: number;
}

export interface FeeTypePayload {
  name: string;
  amount: number;
  frequency: FeeFrequency;
  levelId: number | null;
  description: string | null;
  active?: boolean;
}

export interface InvoiceRow {
  id: number;
  studentId: number;
  studentName: string;
  registrationNumber: string;
  classId: number | null;
  className: string;
  feeTypeId: number;
  feeTypeName: string;
  amountDue: number;
  discountAmount: number;
  discountReason: string | null;
  netAmount: number;
  paid: number;
  balance: number;
  dueDate: string;
  status: 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  daysOverdue: number;
}

export interface PaymentRow {
  id: number;
  reference: string | null;
  paymentDate: string;
  amount: number;
  method: PaymentMethod;
  invoiceId: number;
  studentId: number;
  studentName: string;
  registrationNumber: string;
  className: string;
  feeTypeName: string;
  invoiceNet: number;
  invoiceBalance: number;
}

export interface FinanceOverview {
  schoolName: string;
  expected: number;
  discounts: number;
  collected: number;
  remaining: number;
  overdueAmount: number;
  collectedThisMonth: number;
  collectionRate: number;
  invoiceCount: number;
  unpaidCount: number;
  overdueCount: number;
  paidCount: number;
  perClass: { classId: number; className: string; students: number; expected: number; collected: number; remaining: number; unpaidInvoices: number }[];
  perFeeType: { feeTypeId: number; feeTypeName: string; expected: number; collected: number; remaining: number }[];
  recentPayments: PaymentRow[];
}

export interface BulkInvoicePayload {
  feeTypeId: number;
  classId: number | null;
  levelId: number | null;
  dueDate: string;
  amount: number | null;
}

export interface BulkInvoiceResult { created: number; skipped: number; targetedStudents: number; }

export interface PaymentPayload { amount: number; paymentDate: string | null; method: PaymentMethod; }

export const FREQUENCY_LABELS: Record<FeeFrequency, string> = {
  ONE_TIME: 'Unique', MONTHLY: 'Mensuel', TERM: 'Trimestriel', YEARLY: 'Annuel',
};

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Espèces', MOBILE_MONEY: 'Mobile Money', BANK_TRANSFER: 'Virement', CARD: 'Carte',
};

export const STATUS_LABELS: Record<InvoiceRow['status'], string> = {
  PENDING: 'À payer', PAID: 'Payé', OVERDUE: 'En retard', CANCELLED: 'Annulé',
};

@Injectable({ providedIn: 'root' })
export class FinanceService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/owner/finance`;

  overview(schoolId: number): Observable<FinanceOverview> {
    return this.http.get<FinanceOverview>(`${this.url}/schools/${schoolId}/overview`);
  }

  feeTypes(schoolId: number): Observable<FeeTypeInfo[]> {
    return this.http.get<FeeTypeInfo[]>(`${this.url}/schools/${schoolId}/fee-types`);
  }

  saveFeeType(schoolId: number, payload: FeeTypePayload, id?: number): Observable<FeeTypeInfo> {
    return id
      ? this.http.put<FeeTypeInfo>(`${this.url}/fee-types/${id}`, payload)
      : this.http.post<FeeTypeInfo>(`${this.url}/schools/${schoolId}/fee-types`, payload);
  }

  deleteFeeType(id: number): Observable<{ deleted: boolean }> {
    return this.http.delete<{ deleted: boolean }>(`${this.url}/fee-types/${id}`);
  }

  bulkInvoice(schoolId: number, payload: BulkInvoicePayload): Observable<BulkInvoiceResult> {
    return this.http.post<BulkInvoiceResult>(`${this.url}/schools/${schoolId}/invoices/bulk`, payload);
  }

  invoices(schoolId: number, status: InvoiceFilter, classId: number | null): Observable<InvoiceRow[]> {
    let params = new HttpParams().set('status', status);
    if (classId) params = params.set('classId', classId);
    return this.http.get<InvoiceRow[]>(`${this.url}/schools/${schoolId}/invoices`, { params });
  }

  payments(schoolId: number, from: string, to: string): Observable<PaymentRow[]> {
    return this.http.get<PaymentRow[]>(`${this.url}/schools/${schoolId}/payments`, { params: this.range(from, to) });
  }

  exportPayments(schoolId: number, from: string, to: string): Observable<Blob> {
    return this.http.get(`${this.url}/schools/${schoolId}/payments/export`,
      { params: this.range(from, to), responseType: 'blob' });
  }

  recordPayment(invoiceId: number, payload: PaymentPayload): Observable<unknown> {
    return this.http.post(`${this.url}/invoices/${invoiceId}/payments`, payload);
  }

  deletePayment(invoiceId: number, paymentId: number): Observable<void> {
    return this.http.delete<void>(`${this.url}/invoices/${invoiceId}/payments/${paymentId}`);
  }

  applyDiscount(invoiceId: number, amount: number, reason: string): Observable<InvoiceRow> {
    return this.http.put<InvoiceRow>(`${this.url}/invoices/${invoiceId}/discount`, { amount, reason });
  }

  cancelInvoice(invoiceId: number): Observable<unknown> {
    return this.http.put(`${this.url}/invoices/${invoiceId}/cancel`, {});
  }

  sendReminder(invoiceId: number): Observable<{ recipients: number }> {
    return this.http.post<{ recipients: number }>(`${this.url}/invoices/${invoiceId}/reminder`, {});
  }

  private range(from: string, to: string): HttpParams {
    let params = new HttpParams();
    if (from) params = params.set('from', from);
    if (to) params = params.set('to', to);
    return params;
  }
}
