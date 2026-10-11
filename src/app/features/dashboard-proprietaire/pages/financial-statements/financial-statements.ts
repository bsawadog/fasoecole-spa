import { DecimalPipe, DatePipe } from '@angular/common';
import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AuthService, RegistrationSchool } from '../../../../core/auth';
import { ExpensesService, ExpenseSummary } from '../../expenses.service';

@Component({
  selector: 'app-financial-statements', standalone: true,
  imports: [FormsModule, DecimalPipe, DatePipe],
  templateUrl: './financial-statements.html',
  styleUrls: ['../expenses/expenses.scss', './financial-statements.scss'],
})
export class FinancialStatements implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly api = inject(ExpensesService);
  private readonly requests = new Subscription();
  private reportRequest?: Subscription;
  readonly schools = signal<RegistrationSchool[]>([]);
  readonly schoolId = signal<number | null>(null);
  readonly summary = signal<ExpenseSummary | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  yearId: number | null = null;
  ngOnInit(): void {
    const owner = this.auth.user()?.id;
    if (!owner) { this.loading.set(false); return; }
    this.requests.add(this.auth.getOwnedSchools(owner, 'EXPENSES').subscribe({
      next: schools => {
        this.schools.set(schools);
        const stored = Number(localStorage.getItem('fasoecole_owner_school'));
        const selected = schools.find(s => s.id === stored) ?? schools[0];
        if (selected) this.selectSchool(selected.id); else this.loading.set(false);
      },
      error: () => { this.loading.set(false); this.error.set('Impossible de charger les établissements.'); },
    }));
  }
  selectSchool(id: number): void {
    if (!this.schools().some(s => s.id === id)) return;
    this.schoolId.set(id); this.auth.selectSchoolContext(id);
    this.yearId = null; this.summary.set(null); this.load();
  }
  load(): void {
    const id = this.schoolId();
    if (!id) return;
    this.reportRequest?.unsubscribe();
    this.loading.set(true); this.error.set('');
    this.reportRequest = this.api.summary(id, this.yearId).subscribe({
      next: data => { this.summary.set(data); this.yearId = data.year?.id ?? null; this.loading.set(false); },
      error: () => { this.summary.set(null); this.loading.set(false); this.error.set('Impossible de charger les états financiers.'); },
    });
  }
  exportCsv(): void {
    const s = this.summary();
    if (!s || this.loading()) return;
    const rows: (string | number)[][] = [
      ['États financiers de trésorerie', s.schoolName], ['Du', s.from, 'Au', s.to],
      ['Indicateur', 'Montant (FCFA)'], ['Recettes encaissées', s.income], ['Dépenses payées', s.expenses], ['Solde des mouvements', s.balance],
      [], ['Dépenses par catégorie', 'Montant (FCFA)'], ...s.categories.map(c => [c.name, c.spent]),
      [], ['Mois', 'Encaissements (FCFA)', 'Décaissements (FCFA)', 'Solde (FCFA)'], ...s.months.map(m => [m.month, m.income, m.expenses, m.balance]),
    ];
    const csv = rows.map(row => row.map(value => {
      let text = String(value);
      if (typeof value === 'string' && /^[=+@-]/.test(text)) text = "'" + text;
      return '"' + text.replace(/"/g, '""') + '"';
    }).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿', csv], {type: 'text/csv;charset=utf-8'}));
    const link = document.createElement('a'); link.href = url;
    link.download = 'etats-financiers-'+this.schoolId()+'-'+s.from+'-'+s.to+'.csv'; link.click();
    URL.revokeObjectURL(url);
  }
  print(): void { window.print(); }
  ngOnDestroy(): void { this.requests.unsubscribe(); this.reportRequest?.unsubscribe(); }
}
