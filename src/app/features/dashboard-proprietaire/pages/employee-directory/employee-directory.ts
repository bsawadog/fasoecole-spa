import { ModuleHelpButton } from '../../../../shared/help/module-help-button';
import { LoadingState } from '../../../../shared/ui/loading-state';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService, RegistrationSchool } from '../../../../core/auth';
import { StaffService } from '../../staff.service';

interface Employee { key: string; name: string; job: string; email: string; phone: string | null; route: string; staffId?: number; userId:number; }
@Component({
  selector: 'app-employee-directory', standalone: true, imports: [ModuleHelpButton, LoadingState, InputTextModule, MessageModule, FormsModule, RouterLink],
  template: `
    <header class="ui-page-header module-help-header"><app-module-help /><h1>Tous les employés de l’école</h1>
    <p>Enseignants et personnel : consultez leur fiche.</p></header>

    <label>Rechercher <input pInputText [(ngModel)]="search" placeholder="Nom, fonction ou courriel"></label>
    @if (error()) { <p-message severity="error" role="alert">{{ error() }}</p-message> }
    @if (loading()) { <app-loading-state message="Chargement…" /> } @else {
      <div class="table-wrap"><table><thead><tr><th>Employé</th><th>Fonction</th><th>Contact</th><th></th></tr></thead><tbody>
        @for (employee of filtered(); track employee.key) {
          <tr><td>{{ employee.name }}</td><td>{{ employee.job }}</td><td>{{ employee.email }}@if (employee.phone) { <br>{{ employee.phone }} }</td>
          <td><a [routerLink]="employee.route" [queryParams]="{employeeId: employee.userId}">Voir la fiche</a></td></tr>
        } @empty { <tr><td colspan="4">Aucun employé pour cette recherche.</td></tr> }
      </tbody></table></div>
    }
  `,
  styles: [`@layer legacy { :host{display:block}label{display:inline-flex;gap:10px;align-items:center;margin:12px 20px 12px 0}input,select{padding:10px;border:1px solid var(--theme-control-border, #cbd5e1);border-radius:8px}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;background:var(--theme-surface, white)}th,td{text-align:left;padding:16px;border-bottom:1px solid var(--theme-border, #e2e8f0)}a{color:var(--theme-success, #15803d)} }`],
})
export class EmployeeDirectory implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly staff = inject(StaffService);
  private readonly requests = new Subscription();
  private schoolRequest?: Subscription;
  readonly schools = signal<RegistrationSchool[]>([]);
  readonly schoolId = signal<number | null>(null);
  readonly employees = signal<Employee[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  search = '';
  ngOnInit(): void {
    const id = this.auth.user()?.id;
    if (!id) { this.loading.set(false); return; }
    this.requests.add(this.auth.getOwnedSchools(id).subscribe({
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
    this.schoolRequest?.unsubscribe();
    this.schoolId.set(id);
    this.employees.set([]); this.loading.set(true); this.error.set('');
    this.schoolRequest = this.staff.directory(id).subscribe({
      next: data => {
        this.employees.set(data.map(s=>({key:'employee-'+s.userId,userId:s.userId,name:s.lastName+' '+s.firstName,job:s.teacher && s.administrativeEmployment?s.jobTitle+' · Enseignant':s.jobTitle,email:s.email??'',phone:s.phone,route:'/proprietaire/personnel'})));
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); this.error.set('Impossible de charger les employés.'); },
    });
  }
  filtered(): Employee[] {
    const query = this.search.trim().toLocaleLowerCase('fr');
    return this.employees().filter(e => (e.name+' '+e.job+' '+e.email).toLocaleLowerCase('fr').includes(query));
  }
  ngOnDestroy(): void { this.requests.unsubscribe(); this.schoolRequest?.unsubscribe(); }
}
