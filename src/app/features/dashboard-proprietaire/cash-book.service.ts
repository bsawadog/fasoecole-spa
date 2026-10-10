import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

export type CashDirection = 'IN' | 'OUT';
export interface CashMovement {
  id: number; date: string; direction: CashDirection; amount: number; label: string;
  reference: string | null; source: 'MANUAL' | 'SCHOOL_PAYMENT' | 'EXPENSE' | 'TEACHER_PAYMENT'; balance: number;
}
export interface CashClosure {
  month: string; openingBalance: number; receipts: number; payments: number;
  closingBalance: number; countedBalance: number; note: string | null; closedAt: string;
}
export interface CashOverview {
  book: { openedOn: string; openingBalance: number; closedOn: string | null } | null;
  month: string; openingBalance: number; receipts: number; payments: number; closingBalance: number;
  closure: CashClosure | null; rows: CashMovement[]; history: CashClosure[];
}
export interface CashEntry {
  requestId: string; date: string; direction: CashDirection; amount: number; label: string; reference: string | null;
}
@Injectable({ providedIn: 'root' })
export class CashBookService {
  private readonly http = inject(HttpClient);
  private url(schoolId: number): string { return `${environment.apiUrl}/owner/cash-book/schools/${schoolId}`; }
  overview(schoolId: number, month: string) { return this.http.get<CashOverview>(this.url(schoolId), {params: {month}}); }
  open(schoolId: number, date: string, openingBalance: number) {
    return this.http.post<void>(`${this.url(schoolId)}/open`, {date, openingBalance});
  }
  add(schoolId: number, entry: CashEntry) { return this.http.post<void>(`${this.url(schoolId)}/entries`, entry); }
  delete(schoolId: number, id: number) { return this.http.delete<void>(`${this.url(schoolId)}/entries/${id}`); }
  close(schoolId: number, month: string, countedBalance: number, note: string | null, finalClosure: boolean) {
    return this.http.post<void>(`${this.url(schoolId)}/close`, {month, countedBalance, note, finalClosure});
  }
}
