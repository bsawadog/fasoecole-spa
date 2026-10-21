import { ErrorAlert } from '../../../../shared/error-alert';
import { ModuleHelpButton } from '../../../../shared/help/module-help-button';
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
import { forkJoin } from 'rxjs';
import { AcademicYearRecord, ClassRecord, OwnerManagementService, SubjectRecord } from '../../owner-management.service';

type PayMode = 'FIXED_MONTHLY' | 'HOURLY';
interface InitialSlot {
  classId: number | null; subjectId: number | null; dayOfWeek: number;
  startTime: string; endTime: string; effectiveFrom: string;
}

@Component({
  selector: 'app-employees', standalone: true, imports: [ErrorAlert, ModuleHelpButton, DateField, NumberField, SelectField, SelectOption, InputTextModule, ButtonModule, MessageModule, FormValidationDirective, FormsModule, StaffPage],
  template: `
    <main class="employees ui-workspace">
    <header class="module-help-header ui-page-header">
    <app-module-help />
    <h1>Créer un employé</h1>
    <p>Ajoutez une fonction d’enseignant ou de personnel. Utilisez le même courriel pour cumuler plusieurs rôles sur un seul compte. Le rôle propriétaire ne s’attribue pas ici.</p>
    </header>
    <section class="ui-context-bar">
    <label>Fonction <app-select-field [(ngModel)]="category" [ariaLabel]="(&quot;Fonction &quot;).trim()"><app-select-option [value]="&quot;teacher&quot;" [label]="(&quot;Enseignant&quot;).trim()" /><app-select-option [value]="&quot;staff&quot;" [label]="(&quot;Comptable, secrétaire, gardien et autres&quot;).trim()" /></app-select-field></label>
    </section>
    @if (category === 'staff') { <app-staff /> } @else {
      <section class="ui-panel">
      <h2 class="ui-panel-heading">Nouvel enseignant</h2>
      <form (ngSubmit)="teacherForm.valid && save()" #teacherForm="ngForm">

        <label>Prénom<input pInputText name="firstName" [(ngModel)]="form.firstName" maxlength="100" required></label>
        <label>Nom<input pInputText name="lastName" [(ngModel)]="form.lastName" maxlength="100" required></label>
        <label>Courriel (facultatif)<input pInputText name="email" type="email" email [(ngModel)]="form.email" maxlength="150"></label>
        <label>Téléphone (facultatif)<input pInputText name="phone" type="tel" [(ngModel)]="form.phone" maxlength="30"></label>
        <label>Numéro d’employé<input pInputText name="employeeNumber" [(ngModel)]="form.employeeNumber" maxlength="50" placeholder="Généré si vide"></label>
        <label>Spécialité<input pInputText name="specialty" [(ngModel)]="form.specialty" maxlength="150"></label>
        <label>Date d’embauche<app-date-field mode="date" name="hireDate" [(ngModel)]="form.hireDate" [ariaLabel]="(&quot;Date d’embauche&quot;).trim()" /></label>
        <label>Mode de rémunération
          <app-select-field name="rateType" [ngModel]="form.rateType" (ngModelChange)="changeRateType($event)" ariaLabel="Mode de rémunération">
            <app-select-option value="FIXED_MONTHLY" label="Salaire mensuel fixe" />
            <app-select-option value="HOURLY" label="Taux horaire avec créneaux" />
          </app-select-field>
        </label>
        @if (form.rateType === 'FIXED_MONTHLY') {
          <label>Salaire mensuel fixe (FCFA)<app-number-field name="monthlySalary" min="0.01" max="9999999999.99" step="0.01" [(ngModel)]="form.monthlySalary" required ariaLabel="Salaire mensuel fixe (FCFA)" /></label>
          <p>Le salaire mensuel fixe est dû chaque mois. Vous pouvez aussi préparer son emploi du temps ci-dessous.</p>
        } @else {
          <label>Taux horaire (FCFA / heure)<app-number-field name="hourlyRate" min="0.01" max="9999999999.99" step="0.01" [(ngModel)]="form.hourlyRate" required ariaLabel="Taux horaire (FCFA / heure)" /></label>
          <p>La paie horaire dépend des heures de présence pointées et des heures supplémentaires. Vous pouvez préparer le planning maintenant ou après la création.</p>
        }
        <label>Date d’effet du tarif<app-date-field mode="date" name="rateEffectiveFrom" [(ngModel)]="form.rateEffectiveFrom" required ariaLabel="Date d’effet du tarif" /></label>
        <section class="employee-schedule" aria-label="Matières et affectation facultatives">
          <h3>Matières enseignées et classe (facultatif)</h3>
          <p>Choisissez les matières de l’enseignant dans le catalogue de l’établissement. Vous pouvez laisser la classe vide et l’affecter plus tard depuis « Enseignants par classe ».</p>
          <button pButton type="button" class="employee-action employee-action--blue" (click)="showAssignments = !showAssignments; showAssignments && loadScheduleContext()" [attr.aria-expanded]="showAssignments">{{ showAssignments ? 'Masquer les options d’affectation' : 'Choisir les matières et une classe' }}</button>
          @if (showAssignments) {
            @if (loadingSchedule()) { <p role="status">Chargement des matières et classes…</p> }
            <label>Classe (facultative)<app-select-field name="initialClass" [(ngModel)]="form.classId" ariaLabel="Classe (facultative)" [disabled]="loadingSchedule()">
              <app-select-option [value]="null" label="Affecter plus tard" />
              @for (cls of classes(); track cls.id) { <app-select-option [value]="cls.id" [label]="classLabel(cls)" /> }
            </app-select-field></label>
            <fieldset><legend>Matières enseignées (plusieurs choix possibles)</legend>
              @for (subject of subjects(); track subject.id) {
                <label><span><input type="checkbox" [name]="'teachingSubject' + subject.id" [checked]="form.subjectIds.includes(subject.id)" (change)="toggleSubject(subject.id, $any($event.target).checked)"> {{ subject.name }}</span></label>
              } @empty { <p>Aucune matière disponible. Ajoutez-en dans « Configuration de l’école ».</p> }
            </fieldset>
          }
        </section>
        <section class="employee-schedule" aria-label="Créneaux hebdomadaires">
          <h3>Créneaux hebdomadaires (facultatifs)</h3>
          @if (loadingSchedule()) { <p role="status">Chargement des classes et matières…</p> }
          @if (scheduleError()) {
            <app-error-alert [message]="scheduleError()" (dismissed)="scheduleError.set('')">{{ scheduleError() }}</app-error-alert>
            <button pButton class="employee-action employee-action--blue" type="button" (click)="loadScheduleContext()" [disabled]="loadingSchedule()">Réessayer le chargement</button>
          }
          @for (slot of slots; track slot; let index = $index) {
            <fieldset class="employee-slot">
              <legend>Créneau {{ index + 1 }}</legend>
              <label>Classe<app-select-field [name]="'slotClass' + index" [ngModel]="slot.classId" (ngModelChange)="chooseSlotClass(slot, $event)" required [disabled]="loadingSchedule()" [ariaLabel]="'Classe du créneau ' + (index + 1)">
                <app-select-option [value]="null" label="Choisir une classe" />
                @for (cls of classes(); track cls.id) { <app-select-option [value]="cls.id" [label]="classLabel(cls)" /> }
              </app-select-field></label>
              <label>Matière<app-select-field [name]="'slotSubject' + index" [(ngModel)]="slot.subjectId" required [disabled]="loadingSchedule()" [ariaLabel]="'Matière du créneau ' + (index + 1)">
                <app-select-option [value]="null" label="Choisir une matière" />
                @for (subject of subjects(); track subject.id) { <app-select-option [value]="subject.id" [label]="subject.name" /> }
              </app-select-field></label>
              <label>Jour<app-select-field [name]="'slotDay' + index" [(ngModel)]="slot.dayOfWeek" required [ariaLabel]="'Jour du créneau ' + (index + 1)">
                @for (day of weekdays; track day; let dayIndex = $index) { <app-select-option [value]="dayIndex + 1" [label]="day" /> }
              </app-select-field></label>
              <label>Début<app-date-field mode="time" [name]="'slotStart' + index" [(ngModel)]="slot.startTime" required [ariaLabel]="'Début du créneau ' + (index + 1)" /></label>
              <label>Fin<app-date-field mode="time" [name]="'slotEnd' + index" [(ngModel)]="slot.endTime" required [ariaLabel]="'Fin du créneau ' + (index + 1)" /></label>
              <label>À partir du<app-date-field mode="date" [name]="'slotFrom' + index" [(ngModel)]="slot.effectiveFrom" [min]="slotYear(slot)?.startDate" [max]="slotYear(slot)?.endDate" required [ariaLabel]="'Date du créneau ' + (index + 1)" /></label>
              <button pButton severity="danger" class="employee-action employee-action--red" type="button" (click)="removeSlot(index)" [disabled]="busy()" [attr.aria-label]="'Retirer le créneau ' + (index + 1)">Retirer</button>
            </fieldset>
          }
          <button pButton class="employee-action employee-action--blue" type="button" (click)="addSlot()" [disabled]="busy() || slots.length >= 100">Ajouter un créneau</button>
          @if (slots.length) { <p>{{ weeklyHours() }} heure(s) prévue(s) par semaine. Les affectations aux classes et matières seront créées automatiquement.</p> }
        </section>
        <p>Un compte existant conserve son identité et son mot de passe et reçoit une notification. Un nouveau compte reçoit un lien d’activation, sans approbation supplémentaire.</p>
        <button pButton severity="success" class="employee-action employee-action--green" type="submit" [disabled]="busy()">Ajouter l’enseignant</button>
      </form>
      @if (error()) { <app-error-alert [message]="error()" (dismissed)="error.set('')">{{ error() }}</app-error-alert> }
      @if (success()) { <p-message severity="success" role="status">{{ success() }}</p-message> }
      </section>
    }
    </main>
  `,
  styles: [`@layer application {
    :host .employees button.employee-action {background:#1d4ed8;border:1px solid #60a5fa;color:#fff;font-weight:650;padding:.7rem 1rem;border-radius:.5rem;min-height:44px;white-space:normal;text-align:center}
    :host .employees button.employee-action:hover:not(:disabled){background:#1e40af;border-color:#93c5fd}
    :host .employees button.employee-action--red{background:#b91c1c;border-color:#fca5a5}
    :host .employees button.employee-action--red:hover:not(:disabled){background:#991b1b}
    :host .employees button.employee-action--green{background:#15803d;border-color:#86efac}
    :host .employees button.employee-action--green:hover:not(:disabled){background:#166534}
    :host .employees button.employee-action:focus-visible{outline:3px solid #fbbf24;outline-offset:3px}
    :host .employees button.employee-action:disabled{opacity:.65;cursor:not-allowed}
  }`, `@layer legacy { :host{display:block}form{max-width:900px;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:16px;padding:24px;background:var(--theme-surface, white);border-radius:16px;margin-top:16px}label{display:flex;min-width:0;flex-direction:column;gap:6px}input,select{padding:10px;border:1px solid var(--theme-control-border, #cbd5e1);border-radius:8px}button{cursor:pointer}button:disabled{opacity:.5}form p,.employee-schedule{grid-column:1/-1}.employee-schedule{min-width:0;padding:16px;border:1px solid var(--theme-soft, #bfdbfe);border-radius:12px;background:var(--theme-inset, #f8faff)}.employee-schedule h3{margin-top:0;color:var(--theme-ink, #1e3a8a)}.employee-slot{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr));gap:12px;min-width:0;margin:0 0 16px;padding:16px;border:1px solid var(--theme-control-border, #cbd5e1);border-radius:8px;background:var(--theme-surface, white)}.employee-slot legend{font-weight:600;color:var(--theme-link-hover, #1e40af)} }`],
})
export class EmployeesPage {
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly management = inject(OwnerManagementService);
  readonly schools = signal<RegistrationSchool[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  category = 'teacher';
  schoolId: number | null = null;
  readonly classes = signal<ClassRecord[]>([]);
  readonly subjects = signal<SubjectRecord[]>([]);
  readonly years = signal<(AcademicYearRecord & { closed?: boolean })[]>([]);
  readonly loadingSchedule = signal(false);
  readonly scheduleError = signal('');
  readonly weekdays = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  private scheduleLoaded = false;
  slots: InitialSlot[] = [];
  showAssignments = false;
  form = this.emptyForm();

  private today(): string { return new Date().toLocaleDateString('en-CA'); }
  private emptyForm() {
    return { firstName: '', lastName: '', email: '', phone: '', employeeNumber: '', specialty: '', hireDate: '',
      rateType: 'FIXED_MONTHLY' as PayMode, monthlySalary: null as number | null, hourlyRate: null as number | null,
      rateEffectiveFrom: this.today().slice(0, 7) + '-01', classId: null as number | null, subjectIds: [] as number[] };
  }
  changeRateType(mode: PayMode): void {
    this.form.rateType = mode;
  }
  toggleSubject(id: number, checked: boolean): void {
    this.form.subjectIds = checked ? [...new Set([...this.form.subjectIds, id])] : this.form.subjectIds.filter(value => value !== id);
  }
  addSlot(): void {
    if (this.slots.length >= 100) return;
    this.slots = [...this.slots, { classId: null, subjectId: null, dayOfWeek: 1, startTime: '08:00', endTime: '09:00', effectiveFrom: this.form.hireDate || this.today() }];
    if (!this.scheduleLoaded) this.loadScheduleContext();
  }
  removeSlot(index: number): void { this.slots = this.slots.filter((_, position) => position !== index); }
  loadScheduleContext(): void {
    if (!this.schoolId || this.loadingSchedule() || this.scheduleLoaded) return;
    this.loadingSchedule.set(true); this.scheduleError.set('');
    forkJoin({ classes: this.management.getClasses(this.schoolId), subjects: this.management.getSubjects(this.schoolId), years: this.management.getAcademicYears(this.schoolId) }).subscribe({
      next: data => {
        this.years.set(data.years);
        this.classes.set(data.classes.filter(cls => data.years.some(year => year.id === cls.academicYearId && !(year as { closed?: boolean }).closed)));
        this.subjects.set(data.subjects); this.scheduleLoaded = true; this.loadingSchedule.set(false);
        if (!data.subjects.length) this.scheduleError.set('Ajoutez des matières dans Configuration de l’école pour préparer les affectations et les créneaux.');
      },
      error: () => { this.loadingSchedule.set(false); this.scheduleError.set('Impossible de charger les classes et matières. Réessayez.'); },
    });
  }
  classLabel(cls: ClassRecord): string { return cls.name + ' · ' + (this.years().find(year => year.id === cls.academicYearId)?.label ?? ''); }
  slotYear(slot: InitialSlot) { return this.years().find(year => year.id === this.classes().find(cls => cls.id === slot.classId)?.academicYearId); }
  chooseSlotClass(slot: InitialSlot, id: number | null): void {
    slot.classId = id;
    const year = this.slotYear(slot);
    if (year && (!slot.effectiveFrom || slot.effectiveFrom < year.startDate || slot.effectiveFrom > year.endDate)) slot.effectiveFrom = year.startDate;
  }
  weeklyHours(): string {
    return (this.slots.reduce((total, slot) => {
      const [startHour, startMinute] = (slot.startTime || '').split(':').map(Number);
      const [endHour, endMinute] = (slot.endTime || '').split(':').map(Number);
      return total + Math.max(0, (endHour * 60 + endMinute - startHour * 60 - startMinute) || 0);
    }, 0) / 60).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
  }
  constructor() {
    const id = this.auth.user()?.id;
    if (id) this.auth.getOwnedSchools(id, 'TEACHERS').subscribe({next: schools => {
      this.schools.set(schools);
      this.schoolId = schools.find(s => s.id === Number(localStorage.getItem('fasoecole_owner_school')))?.id ?? schools[0]?.id ?? null;
    },error: () => this.error.set('Impossible de charger les établissements.')});
  }
  save(): void {
    if (!this.schoolId || this.busy()) return;
    if (!this.form.firstName.trim() || !this.form.lastName.trim() || !this.form.rateEffectiveFrom) {
      this.error.set('Complétez le prénom, le nom et la date d’effet du tarif.'); return;
    }
    const amount = this.form.rateType === 'HOURLY' ? this.form.hourlyRate : this.form.monthlySalary;
    if (amount == null || !Number.isFinite(amount) || amount <= 0) { this.error.set('Renseignez un montant de rémunération supérieur à zéro.'); return; }
    if ((this.form.classId != null && (!this.classes().some(cls => cls.id === this.form.classId) || !this.form.subjectIds.length))
        || this.form.subjectIds.some(id => !this.subjects().some(subject => subject.id === id))) {
      this.error.set('Choisissez une classe disponible et au moins une matière, ou laissez la classe vide pour affecter l’enseignant plus tard.'); return;
    }
    for (const slot of this.slots) {
      const year = this.slotYear(slot);
      if (this.loadingSchedule() || !this.classes().some(cls => cls.id === slot.classId) || !this.subjects().some(subject => subject.id === slot.subjectId)
          || !slot.startTime || !slot.endTime || slot.endTime <= slot.startTime || !slot.effectiveFrom || !year
          || slot.effectiveFrom < year.startDate || slot.effectiveFrom > year.endDate) {
        this.error.set('Vérifiez chaque créneau : classe, matière, heures et date dans l’année scolaire ouverte.'); return;
      }
    }
    this.busy.set(true); this.error.set(''); this.success.set('');

    this.http.post<{employeeNumber: string; emailVerified?: boolean; invitationDeliveryStatus?: string}>(`${environment.apiUrl}/teacher-work/schools/${this.schoolId}/teachers`,
      { ...this.form, email: this.form.email.trim() || null, phone: this.form.phone.trim() || null, hireDate: this.form.hireDate || null,
        monthlySalary: this.form.rateType === 'FIXED_MONTHLY' ? this.form.monthlySalary : null,
        hourlyRate: this.form.rateType === 'HOURLY' ? this.form.hourlyRate : null, initialSlots: this.slots }).subscribe({
      next: teacher => {
        this.busy.set(false);
        const notice = !this.form.email.trim() ? 'Aucun courriel envoyé : aucune adresse renseignée.'
          : teacher.emailVerified ? 'Le compte existant est conservé. Le nouvel espace est accessible depuis le menu du profil.'
          : `Activation : ${teacher.invitationDeliveryStatus === 'SENT' ? 'lien envoyé' : 'consultez l’état de l’envoi dans la fiche enseignant'}.`;
        this.success.set(`Enseignant ajouté${teacher.employeeNumber ? ' : ' + teacher.employeeNumber : ''}. ${notice}`);
        this.form = this.emptyForm(); this.slots = []; this.showAssignments = false;
      },
      error: err => { this.busy.set(false); this.error.set(err?.error?.message ?? 'Impossible de créer cet enseignant.'); },
    });
  }
}
