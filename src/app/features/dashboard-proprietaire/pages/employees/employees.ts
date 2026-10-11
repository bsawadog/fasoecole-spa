import { FormValidationDirective } from '../../../../shared/form-validation.directive';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService, RegistrationSchool } from '../../../../core/auth';
import { StaffPage } from '../staff/staff';
import { environment } from '../../../../../environments/environment';

@Component({
  selector: 'app-employees', standalone: true, imports: [FormValidationDirective, FormsModule, StaffPage],
  template: `
    <h1>Créer un employé</h1>
    <p>Créez un enseignant ou un membre du personnel. Les identités sont conservées d’une année à l’autre.</p>
    <label>Fonction <select [(ngModel)]="category"><option value="teacher">Enseignant</option><option value="staff">Comptable, secrétaire, gardien et autres</option></select></label>
    @if (category === 'staff') { <app-staff /> } @else {
      <h2>Nouvel enseignant</h2>
      <form (ngSubmit)="save()" #teacherForm="ngForm">
        <label>Établissement<select name="school" [(ngModel)]="schoolId" required>
          @for (school of schools(); track school.id) { <option [ngValue]="school.id">{{ school.name }}</option> }
        </select></label>
        <label>Prénom<input name="firstName" [(ngModel)]="form.firstName" maxlength="100" required></label>
        <label>Nom<input name="lastName" [(ngModel)]="form.lastName" maxlength="100" required></label>
        <label>Courriel<input name="email" type="email" email [(ngModel)]="form.email" maxlength="150" required></label>
        <label>Téléphone<input name="phone" type="tel" [(ngModel)]="form.phone" maxlength="30"></label>
        <label>Numéro d’employé<input name="employeeNumber" [(ngModel)]="form.employeeNumber" maxlength="50" placeholder="Généré si vide"></label>
        <label>Spécialité<input name="specialty" [(ngModel)]="form.specialty" maxlength="150"></label>
        <label>Date d’embauche<input name="hireDate" type="date" [(ngModel)]="form.hireDate"></label>
        <label>Salaire mensuel fixe (FCFA)<input name="monthlySalary" type="number" min="0" max="9999999999.99" step="0.01" [(ngModel)]="form.monthlySalary" required></label>
        <p>Le salaire fixe est dû chaque mois. Les taux horaires ou au prorata restent configurables dans la fiche enseignant.</p>
        <p>Un lien permet à l’enseignant de choisir son mot de passe. Affectez-le ensuite depuis Enseignants par classe.</p>
        <button type="submit" [disabled]="busy()">Créer l’enseignant</button>
      </form>
      @if (error()) { <p role="alert">{{ error() }}</p> }
      @if (success()) { <p role="status">{{ success() }}</p> }
    }
  `,
  styles: [`:host{display:block}form{max-width:760px;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;padding:24px;background:white;border-radius:16px;margin-top:16px}label{display:flex;flex-direction:column;gap:6px}input,select{padding:10px;border:1px solid #cbd5e1;border-radius:8px}button{background:#15803d;color:white;border:0;border-radius:8px;padding:12px;cursor:pointer}button:disabled{opacity:.5}form p{grid-column:1/-1}`],
})
export class EmployeesPage {
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  readonly schools = signal<RegistrationSchool[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  category = 'teacher';
  schoolId: number | null = null;
  form = { firstName: '', lastName: '', email: '', phone: '', employeeNumber: '', specialty: '', hireDate: '', monthlySalary: null as number | null };
  constructor() {
    const id = this.auth.user()?.id;
    if (id) this.auth.getOwnedSchools(id, 'TEACHERS').subscribe({next: schools => {
      this.schools.set(schools);
      this.schoolId = schools.find(s => s.id === Number(localStorage.getItem('fasoecole_owner_school')))?.id ?? schools[0]?.id ?? null;
    },error: () => this.error.set('Impossible de charger les établissements.')});
  }
  save(): void {
    if (!this.schoolId || this.busy()) return;
    this.busy.set(true); this.error.set(''); this.success.set('');
    this.auth.selectSchoolContext(this.schoolId);
    this.http.post<{employeeNumber: string; invitationDeliveryStatus?: string}>(`${environment.apiUrl}/teacher-work/schools/${this.schoolId}/teachers`,
      { ...this.form, hireDate: this.form.hireDate || null }).subscribe({
      next: teacher => { this.busy.set(false); this.success.set(`Enseignant créé : ${teacher.employeeNumber}. Invitation : ${teacher.invitationDeliveryStatus === 'SENT' ? 'envoyée' : 'consultez son état dans la fiche enseignant'}.`); this.form = {firstName:'',lastName:'',email:'',phone:'',employeeNumber:'',specialty:'',hireDate:'',monthlySalary:null}; },
      error: err => { this.busy.set(false); this.error.set(err?.error?.message ?? 'Impossible de créer cet enseignant.'); },
    });
  }
}
