import { Component, computed, input, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FinanceMonth, MonthlyFinance } from '../../../../core/models/monthly-finance.model';

@Component({
  selector: 'app-monthly-finance', standalone: true, imports: [DatePipe, DecimalPipe],
  templateUrl: './monthly-finance.html', styleUrl: './monthly-finance.scss',
})
export class MonthlyFinanceChart {
  readonly data = input.required<MonthlyFinance>();
  private readonly selectedMonth = signal<string | null>(null);
  readonly maximum = computed(() => {
    const max = Math.max(0, ...this.data().months.flatMap(m => [m.receivedAmount, m.spentAmount]));
    if (!max) return 100;
    const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
    return Math.ceil(max / magnitude / .5) * magnitude * .5;
  });
  readonly ticks = computed(() => Array.from({ length: 5 }, (_, i) => this.maximum() * i / 4));
  readonly step = computed(() => Math.max(48, 650 / Math.max(1, this.data().months.length)));
  readonly width = computed(() => 86 + this.step() * this.data().months.length);
  readonly active = computed(() => this.data().months.find(m => m.month === this.selectedMonth())
    ?? this.data().months.find(m => m.month === new Date().toLocaleDateString('en-CA').slice(0, 7))
    ?? this.data().months.at(-1));
  readonly empty = computed(() => !this.data().months.some(m => m.receivedAmount || m.spentAmount));
  select(month: string): void { this.selectedMonth.set(month); }
  height(amount: number): number { return amount / this.maximum() * 190; }
  amount(value: number): string { return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(value) + ' FCFA'; }
  monthLabel(value: string, long = false): string {
    return new Intl.DateTimeFormat('fr-FR', { month: long ? 'long' : 'short', year: long ? 'numeric' : '2-digit' }).format(new Date(value + '-01T12:00:00'));
  }
  description(month: FinanceMonth): string {
    return `${this.monthLabel(month.month, true)} : encaissements ${this.amount(month.receivedAmount)}, dépenses ${this.amount(month.spentAmount)}, différence ${this.amount(month.receivedAmount - month.spentAmount)}`;
  }
  compact(value: number): string { return new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(value); }
}
