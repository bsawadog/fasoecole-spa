import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { PaymentMethod } from './finance.service';
import { ExpenseCategory } from './expenses.service';

export interface PayableRow {
  id: number; source: 'MANUAL' | 'FIXED' | 'STAFF_SALARY' | 'TEACHER_SALARY'; period: string;
  dueDate: string; label: string; supplier: string | null; categoryId: number; categoryName: string;
  amount: number; paid: number; remaining: number; status: 'UNPAID' | 'PARTIAL' | 'PAID' | 'CANCELLED' | 'NOT_DUE';
  overdue: boolean; notes: string | null;
}
export interface FixedCharge {
  id: number; categoryId: number; label: string; supplier: string | null; amount: number;
  dueDay: number; startMonth: string; active: boolean;
}
export interface PayablePayment { id: number; date: string; amount: number; method: PaymentMethod | null; reference: string | null }
export interface PayableOverview { rows: PayableRow[]; fixedCharges: FixedCharge[]; total: number; paid: number; remaining: number; overdue: number }
export interface PayablePayload { categoryId: number; label: string; supplier: string | null; amount: number; dueDate: string; notes: string | null }
export interface FixedPayload { categoryId: number; label: string; supplier: string | null; amount: number; dueDay: number; startMonth: string }
export interface PayablePay { requestId: string; amount: number; date: string; method: PaymentMethod; reference: string | null }

@Injectable({ providedIn: 'root' })
export class PayablesService {
  private readonly http = inject(HttpClient);
  private base(school: number) { return `${environment.apiUrl}/owner/payables/schools/${school}`; }
  overview(school: number, month: string, salariesOnly: boolean) {
    return this.http.get<PayableOverview>(this.base(school), { params: { month, salariesOnly } });
  }
  categories(school: number) { return this.http.get<ExpenseCategory[]>(`${this.base(school)}/categories`); }
  prepare(school: number, month: string) { return this.http.post<void>(`${this.base(school)}/prepare`, {}, { params: { month } }); }
  create(school: number, payload: PayablePayload) { return this.http.post<void>(this.base(school), payload); }
  fixed(school: number, payload: FixedPayload) { return this.http.post<void>(`${this.base(school)}/fixed`, payload); }
  setFixedActive(school: number, id: number, active: boolean) {
    return this.http.put<void>(`${this.base(school)}/fixed/${id}`, {}, { params: { active } });
  }
  payments(school: number, id: number) { return this.http.get<PayablePayment[]>(`${this.base(school)}/${id}/payments`); }
  pay(school: number, id: number, payload: PayablePay) { return this.http.post<PayableRow>(`${this.base(school)}/${id}/payments`, payload); }
  cancel(school: number, id: number) { return this.http.post<void>(`${this.base(school)}/${id}/cancel`, {}); }
}
