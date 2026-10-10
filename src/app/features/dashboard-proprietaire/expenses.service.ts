import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PaymentMethod } from './finance.service';

export interface ExpenseCategory {
  id: number;
  name: string;
  description: string | null;
  systemCode: string | null;
  active: boolean;
  expenseCount: number;
}

export interface ExpenseCategoryPayload {
  name: string;
  description: string | null;
  active?: boolean;
}

export interface ExpenseRow {
  id: number;
  source: 'MANUAL' | 'PAYROLL' | 'PAYABLE';
  expenseDate: string;
  categoryId: number;
  categoryName: string;
  label: string;
  supplier: string | null;
  amount: number;
  method: PaymentMethod | null;
  reference: string | null;
  notes: string | null;
  createdByName: string | null;
}

export interface ExpensePayload {
  categoryId: number;
  expenseDate: string;
  amount: number;
  label: string;
  supplier: string | null;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
}

export interface YearInfo { id: number; label: string; startDate: string; endDate: string; current: boolean; }
export interface MonthLine { month: string; income: number; expenses: number; balance: number; }

export interface CategoryLine {
  categoryId: number;
  name: string;
  systemCode: string | null;
  active: boolean;
  budget: number;
  spent: number;
  remaining: number;
  usedRate: number | null;
  overBudget: boolean;
}

export interface ExpenseSummary {
  schoolName: string;
  year: YearInfo | null;
  years: YearInfo[];
  from: string;
  to: string;
  income: number;
  expenses: number;
  balance: number;
  spentThisMonth: number;
  budgetTotal: number;
  budgetUsedRate: number | null;
  overBudgetCount: number;
  months: MonthLine[];
  categories: CategoryLine[];
  recentExpenses: ExpenseRow[];
}

@Injectable({ providedIn: 'root' })
export class ExpensesService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/owner/expenses`;

  summary(schoolId: number, academicYearId: number | null): Observable<ExpenseSummary> {
    const params = academicYearId ? new HttpParams().set('academicYearId', academicYearId) : undefined;
    return this.http.get<ExpenseSummary>(`${this.url}/schools/${schoolId}/summary`, { params });
  }

  saveBudget(schoolId: number, academicYearId: number, lines: { categoryId: number; amount: number }[]): Observable<ExpenseSummary> {
    return this.http.put<ExpenseSummary>(`${this.url}/schools/${schoolId}/budget`, { academicYearId, lines });
  }

  categories(schoolId: number): Observable<ExpenseCategory[]> {
    return this.http.get<ExpenseCategory[]>(`${this.url}/schools/${schoolId}/categories`);
  }

  saveCategory(schoolId: number, payload: ExpenseCategoryPayload, id?: number): Observable<ExpenseCategory> {
    return id
      ? this.http.put<ExpenseCategory>(`${this.url}/categories/${id}`, payload)
      : this.http.post<ExpenseCategory>(`${this.url}/schools/${schoolId}/categories`, payload);
  }

  deleteCategory(id: number): Observable<{ deleted: boolean }> {
    return this.http.delete<{ deleted: boolean }>(`${this.url}/categories/${id}`);
  }

  expenses(schoolId: number, from: string, to: string, categoryId: number | null): Observable<ExpenseRow[]> {
    return this.http.get<ExpenseRow[]>(`${this.url}/schools/${schoolId}/expenses`, { params: this.filter(from, to, categoryId) });
  }

  exportExpenses(schoolId: number, from: string, to: string, categoryId: number | null): Observable<Blob> {
    return this.http.get(`${this.url}/schools/${schoolId}/expenses/export`,
      { params: this.filter(from, to, categoryId), responseType: 'blob' });
  }

  saveExpense(schoolId: number, payload: ExpensePayload, id?: number): Observable<ExpenseRow> {
    return id
      ? this.http.put<ExpenseRow>(`${this.url}/expenses/${id}`, payload)
      : this.http.post<ExpenseRow>(`${this.url}/schools/${schoolId}/expenses`, payload);
  }

  deleteExpense(id: number): Observable<void> {
    return this.http.delete<void>(`${this.url}/expenses/${id}`);
  }

  private filter(from: string, to: string, categoryId: number | null): HttpParams {
    let params = new HttpParams();
    if (from) params = params.set('from', from);
    if (to) params = params.set('to', to);
    if (categoryId) params = params.set('categoryId', categoryId);
    return params;
  }
}
