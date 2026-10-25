import { Component, computed, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AttendanceWeek, ClassReceivables, WeeklyAttendance } from '../../../../core/models/dashboard-charts.model';
@Component({ selector: 'app-dashboard-charts', standalone: true, imports: [DatePipe], templateUrl: './dashboard-charts.html', styleUrl: './dashboard-charts.scss' })
export class DashboardCharts {
  readonly receivables = input<ClassReceivables | null>(null);
  readonly attendance = input<WeeklyAttendance | null>(null);
  readonly maximum = computed(() => Math.max(1, ...this.receivables()?.classes.map(c => c.expected) ?? []));
  readonly attendanceMaximum = computed(() => Math.max(1, ...this.attendance()?.weeks.map(w => this.recorded(w) + w.missing) ?? []));
  amount(value: number): string { return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(value) + ' FCFA'; }
  recorded(w: AttendanceWeek): number { return w.present + w.absent + w.late + w.excused; }
  percent(value: number, total: number): number { return total > 0 ? value / total * 100 : 0; }
}
