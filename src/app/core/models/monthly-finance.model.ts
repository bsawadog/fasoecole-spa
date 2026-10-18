export interface FinanceMonth { month: string; receivedAmount: number; spentAmount: number; }
export interface MonthlyFinance {
  academicYearId: number; yearLabel: string; startDate: string; endDate: string;
  months: FinanceMonth[]; receivedAmount: number; spentAmount: number; difference: number;
}
