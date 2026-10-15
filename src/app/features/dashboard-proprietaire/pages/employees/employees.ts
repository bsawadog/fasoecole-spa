import { DateField } from '../../../../shared/ui/date-field';
import { NumberField } from '../../../../shared/ui/number-field';
import { SelectField } from '../../../../shared/ui/select-field';
import { SelectOption } from '../../../../shared/ui/select-field';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { FormValidationDirective } from '../../../../shared/form-validation.directive';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService, RegistrationSchool } from '../../../../core/auth';
import { StaffPage } from '../staff/staff';
import { environment } from '../../../../../environments/environment';

@Component({
  selector: 'app-employees', standalone: true, imports: [DateField, NumberField, SelectField, SelectOption, InputTextModule, ButtonModule, MessageModule, FormValidationDirective, FormsModule, StaffPage],
  template: `
    <main class="employees ui-workspace">
    <header class="ui-page-header">
    <h1>Créer un employé</h1>
    <p>Créez un enseignant ou un membre du personnel. Les identités sont conservées d’une année à l’autre.</p>
    </header>
    <section class="ui-context-bar">
    <label>Fonction <app-select-field [(ngModel)]="category" [ariaLabel]="(&quot;Fonction &quot;).trim()"><app-select-option [value]="&quot;teacher&quot;" [label]="(&quot;Enseignant&quot;).trim()" /><app-select-option [value]="&quot;staff&quot;" [label]="(&quot;Comptable, secrétaire, gardien et autres&quot;).trim()" /></app-select-field></label>
    </section>
    @if (category === 'staff') { <app-staff /> } @else {
      <section class="ui-panel">
      <h2 class="ui-panel-heading">Nouvel enseignant</h2>
      <form (ngSubmit)="save()" #teacherForm="ngForm">

        <label>Prénom<input pInputText name="firstName" [(ngModel)]="form.firstName" maxlength="100" required></label>
        <label>Nom<input pInputText name="lastName" [(ngModel)]="form.lastName" maxlength="100" required></label>
        <label>Courriel (facultatif)<input pInputText name="email" type="email" email [(ngModel)]="form.email" maxlength="150"></label>
        <label>Téléphone (facultatif)<input pInputText name="phone" type="tel" [(ngModel)]="form.phone" maxlength="30"></label>
        <label>Numéro d’employé<input pInputText name="employeeNumber" [(ngModel)]="form.employeeNumber" maxlength="50" placeholder="Généré si vide"></label>
        <label>Spécialité<input pInputText name="specialty" [(ngModel)]="form.specialty" maxlength="150"></label>
        <label>Date d’embauche<app-date-field mode="date" name="hireDate" [(ngModel)]="form.hireDate" [ariaLabel]="(&quot;Date d’embauche&quot;).trim()" /></label>
        <label>Salaire mensuel fixe (FCFA)<app-number-field name="monthlySalary" min="0" max="9999999999.99" step="0.01" [(ngModel)]="form.monthlySalary" required [ariaLabel]="(&quot;Salaire mensuel fixe (FCFA)&quot;).trim()" /></label>
        <p>Le salaire fixe est dû chaque mois. Les taux horaires ou au prorata restent configurables dans la fiche enseignant.</p>
        <p>Si un courriel est renseigné, un lien permet à l’enseignant de choisir son mot de passe. Affectez-le ensuite depuis Enseignants par classe.</p>
        <button pButton type="submit" [disabled]="busy()">Créer l’enseignant</button>
      </form>
      @if (error()) { <p-message severity="error" role="alert">{{ error() }}</p-message> }
      @if (success()) { <p-message severity="success" role="status">{{ success() }}</p-message> }
      </section>
    }
    </main>
  `,
  styles: [`@layer legacy { :host{display:block}form{max-width:760px;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;padding:24px;background:white;border-radius:16px;margin-top:16px}label{display:flex;flex-direction:column;gap:6px}input,select{padding:10px;border:1px solid #cbd5e1;border-radius:8px}button{background:#15803d;color:white;border:0;border-radius:8px;padding:12px;cursor:pointer}button:disabled{opacity:.5}form p{grid-column:1/-1} }`],
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

    this.http.post<{employeeNumber: string; invitationDeliveryStatus?: string}>(`${environment.apiUrl}/teacher-work/schools/${this.schoolId}/teachers`,
      { ...this.form, email: this.form.email.trim() || null, phone: this.form.phone.trim() || null, hireDate: this.form.hireDate || null }).subscribe({
      next: teacher => { this.busy.set(false); this.success.set(`Enseignant créé : ${teacher.employeeNumber}. ${this.form.email.trim() ? `Invitation : ${teacher.invitationDeliveryStatus === 'SENT' ? 'envoyée' : 'consultez son état dans la fiche enseignant'}.` : 'Aucune invitation envoyée : aucun courriel renseigné.'}`); this.form = {firstName:'',lastName:'',email:'',phone:'',employeeNumber:'',specialty:'',hireDate:'',monthlySalary:null}; },
      error: err => { this.busy.set(false); this.error.set(err?.error?.message ?? 'Impossible de créer cet enseignant.'); },
    });
  }
}
