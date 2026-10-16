import { TooltipModule } from 'primeng/tooltip';
import { NumberField } from '../../../../shared/ui/number-field';
import { SelectOption } from '../../../../shared/ui/select-field';
import { LoadingState } from '../../../../shared/ui/loading-state';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { FormValidationDirective } from '../../../../shared/form-validation.directive';
import { Component, inject, input, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService, OWNER_MODULES, OwnerModule, RegistrationSchool } from '../../../../core/auth';
import { StaffMember, StaffPayload, StaffService } from '../../staff.service';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';

interface Preset {
  title: string;
  modules: OwnerModule[];
}

const MODULE_HINTS: Record<OwnerModule, string> = {
  DASHBOARD: 'Indicateurs de l’établissement (effectifs, encaissements, résultats).',
  MANAGEMENT: 'Années, niveaux, classes et matières.',
  STUDENTS: 'Listes de classe, inscriptions, dossiers élèves, présences et factures de l’élève.',
  TEACHERS: 'Affectations, emplois du temps, heures et paie des enseignants.',
  FINANCE: 'Frais scolaires, factures, encaissements et relances.',
  EXPENSES: 'Charges à payer, salaires, versements, budget annuel et bilan recettes / dépenses.',
  GRADES: 'Périodes, évaluations, notes, bulletins et coefficients.',
  ENROLLMENT: 'Nouvelle année scolaire, réinscriptions et passage en classe supérieure.',
  CALENDAR: 'Événements, examens, réunions et vacances.',
  DISCIPLINE: 'Observations, incidents de vie scolaire et accompagnement des élèves.',
  LIBRARY: 'Catalogue, prêts et retours de livres.',
  HOMEWORK: 'Suivi des remises, corrections et commentaires sur les devoirs.',
  REQUESTS: 'Traitement des demandes de certificats et attestations.',
  PARENT_PORTAL: 'Annonces, documents, devoirs et rendez-vous avec les familles.',
  MESSAGES: 'Messagerie de l’établissement et échanges avec les familles.',
  CASH_BOOK: 'Ouverture de caisse, mouvements et clôture de caisse.',
  FINANCIAL_STATEMENTS: 'Consultation, export et impression des états financiers.',
  ASSETS: 'Bâtiments, locaux, mobilier, équipements, état et historique des biens.',
  INVENTORY: 'Articles, entrées, sorties, inventaires physiques et alertes de réapprovisionnement.',
  PAYROLL: 'Rémunérations de tous les employés, versements, fiches de paie et attestations de travail.',
  TAXES: 'Obligations fiscales, reprise IUTS / TPA, paiements, échéances et reste à régler.',
};

@Component({
  selector: 'app-staff',
  standalone: true,
  imports: [TooltipModule, NumberField, SelectOption, LoadingState, InputTextModule, ButtonModule, MessageModule, FormValidationDirective, FormsModule, DecimalPipe],
  templateUrl: './staff.html',
  styleUrl: './staff.scss',
})
export class StaffPage implements OnInit {
  readonly scopeSchoolId = input<number | null>(null);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly api = inject(StaffService);
  private readonly confirmation = inject(ConfirmationService);

  readonly modules = OWNER_MODULES.map((m) => ({ ...m, hint: MODULE_HINTS[m.code] }));
  readonly moduleGroups = [
    { title: 'Administration et enseignement', codes: ['DASHBOARD', 'MANAGEMENT', 'STUDENTS', 'TEACHERS', 'GRADES', 'ENROLLMENT'] },
    { title: 'Vie scolaire et familles', codes: ['CALENDAR', 'DISCIPLINE', 'LIBRARY', 'HOMEWORK', 'REQUESTS', 'PARENT_PORTAL', 'MESSAGES'] },
    { title: 'Finance et comptabilité', codes: ['PAYROLL', 'TAXES', 'FINANCE', 'EXPENSES', 'CASH_BOOK', 'FINANCIAL_STATEMENTS', 'ASSETS', 'INVENTORY'] },
  ].map(group => ({ title: group.title, modules: this.modules.filter(module => group.codes.includes(module.code)) }));
  readonly presets: Preset[] = [
    { title: 'Directeur des études', modules: ['DASHBOARD', 'MANAGEMENT', 'STUDENTS', 'TEACHERS', 'GRADES', 'ENROLLMENT', 'CALENDAR', 'DISCIPLINE', 'LIBRARY', 'HOMEWORK', 'REQUESTS', 'PARENT_PORTAL', 'MESSAGES'] },
    { title: 'Comptable', modules: ['DASHBOARD', 'PAYROLL', 'TAXES', 'FINANCE', 'EXPENSES', 'CASH_BOOK', 'FINANCIAL_STATEMENTS'] },
    { title: 'Secrétaire', modules: ['STUDENTS', 'FINANCE', 'ENROLLMENT', 'CALENDAR', 'REQUESTS', 'PARENT_PORTAL', 'MESSAGES'] },
    { title: 'Surveillant général', modules: ['STUDENTS', 'DISCIPLINE', 'HOMEWORK', 'MESSAGES'] },
    { title: 'Gardien', modules: [] },
    { title: 'Agent d’entretien', modules: [] },
    { title: 'Intendant / gestionnaire de matériel', modules: ['ASSETS', 'INVENTORY'] },
  ];

  readonly schools = signal<RegistrationSchool[]>([]);
  readonly schoolId = signal<number | null>(null);
  readonly staff = signal<StaffMember[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly formOpen = signal(false);

  editing: StaffMember | null = null;
  form = this.emptyForm();

  ngOnInit(): void {
    const ownerId = this.auth.user()?.id;
    if (!ownerId) {
      this.loading.set(false);
      this.error.set('Impossible d’identifier votre compte propriétaire.');
      return;
    }
    this.auth.getOwnedSchools(ownerId, 'MANAGEMENT', this.scopeSchoolId()).subscribe({
      next: (schools) => {
        if (this.scopeSchoolId() !== null) schools = schools.filter(school => school.id === this.scopeSchoolId());
        this.schools.set(schools);
        if (!schools.length) {
          this.loading.set(false);
          return;
        }
        const stored = Number(localStorage.getItem('fasoecole_owner_school'));
        this.selectSchool(schools.find((s) => s.id === stored)?.id ?? schools[0].id);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Impossible de charger vos établissements.');
      },
    });
  }

  changeSchool(event: Event): void {
    const id = Number((event.target as HTMLSelectElement).value);
    if (this.schools().some((s) => s.id === id)) this.selectSchool(id);
  }

  moduleLabel(code: OwnerModule): string {
    return this.modules.find((m) => m.code === code)?.label ?? code;
  }

  activeCount(): number {
    return this.staff().filter((s) => s.active).length;
  }

  openCreate(): void {
    this.editing = null;
    this.form = this.emptyForm();
    this.formOpen.set(true);
    this.clearMessages();
  }

  openEdit(member: StaffMember): void {
    this.editing = member;
    this.form = {
      firstName: member.firstName,
      lastName: member.lastName,
      email: member.email ?? '',
      phone: member.phone ?? '',
      jobTitle: member.jobTitle,
      monthlySalary: member.monthlySalary ?? null,
      modules: new Set(member.modules),
    };
    this.formOpen.set(true);
    this.clearMessages();
  }

  closeForm(): void {
    this.formOpen.set(false);
    this.editing = null;
  }

  applyPreset(preset: Preset): void {
    this.form.jobTitle = preset.title;
    this.form.modules = new Set(preset.modules);
  }

  toggleModule(code: OwnerModule, checked: boolean): void {
    const next = new Set(this.form.modules);
    if (checked) next.add(code);
    else next.delete(code);
    this.form.modules = next;
  }

  save(): void {
    const schoolId = this.schoolId();
    if (!schoolId) return;
    const f = this.form;
    if (!f.firstName.trim() || !f.lastName.trim() || !f.jobTitle.trim()) {
      this.error.set('Le prénom, le nom et la fonction sont obligatoires.');
      return;
    }
    if (!this.editing && f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) {
      this.error.set('Saisissez une adresse e-mail valide : elle servira d’identifiant de connexion.');
      return;
    }

    const payload: StaffPayload = {
      firstName: f.firstName.trim(),
      lastName: f.lastName.trim(),
      email: f.email.trim(),
      phone: f.phone.trim() || null,
      jobTitle: f.jobTitle.trim(),
      monthlySalary: f.monthlySalary,
      modules: this.modules.map((m) => m.code).filter((c) => f.modules.has(c)),
    };
    this.busy.set(true);
    this.clearMessages();
    if (this.editing) {
      this.api.update(this.editing.id, payload).subscribe({
        next: (member) => {
          this.replace(member);
          this.done(`Accès de ${member.firstName} ${member.lastName} mis à jour.`);
        },
        error: (err) => this.fail(err, 'Impossible de mettre à jour ce membre.'),
      });
      return;
    }
    this.api.create(schoolId, payload).subscribe({
      next: (created) => {
        this.staff.update((list) => [created.staff, ...list]);
        const name = `${created.staff.firstName} ${created.staff.lastName}`;
        this.done(`${created.existingAccount ? 'Accès ajouté' : 'Compte créé'} pour ${name}. `
          + (!payload.email ? 'Aucune invitation envoyée : aucun courriel renseigné.' : created.emailSent ? 'Le titulaire a reçu un courriel avec les instructions.'
            : 'L’envoi du courriel a échoué. La fonction a été ajoutée.'));
      },
      error: (err) => this.fail(err, 'Impossible de créer ce membre du personnel.'),
    });
  }

  async toggleActive(member: StaffMember): Promise<void> {
    const suspend = member.active;
    const ok = await this.confirmation.confirm({
      title: suspend ? 'Suspendre l’accès' : 'Réactiver l’accès',
      message: suspend
        ? `${member.firstName} ${member.lastName} ne pourra plus accéder aux modules de l’établissement. Ses informations sont conservées.`
        : `${member.firstName} ${member.lastName} retrouvera l’accès aux modules autorisés.`,
      confirmLabel: suspend ? 'Suspendre' : 'Réactiver',
      destructive: suspend,
    });
    if (!ok) return;
    this.busy.set(true);
    this.clearMessages();
    this.api.setActive(member.id, !suspend).subscribe({
      next: (updated) => {
        this.replace(updated);
        this.done(suspend ? 'Accès suspendu.' : 'Accès réactivé.');
      },
      error: (err) => this.fail(err, 'Impossible de modifier le statut.'),
    });
  }

  async resetPassword(member: StaffMember): Promise<void> {
    const ok = await this.confirmation.confirm({
      title: 'Envoyer un lien au titulaire',
      message: `Un lien sera envoyé à ${member.firstName} ${member.lastName} pour choisir son mot de passe.`,
      confirmLabel: 'Envoyer',
    });
    if (!ok) return;
    this.busy.set(true);
    this.clearMessages();
    this.api.resetPassword(member.id).subscribe({
      next: (reset) => {
        this.done(reset.emailSent ? 'Lien envoyé au titulaire du compte.' : 'L’envoi du courriel a échoué. Réessayez ultérieurement.');
      },
      error: (err) => this.fail(err, 'Impossible d’envoyer le lien.'),
    });
  }

  async remove(member: StaffMember): Promise<void> {
    const ok = await this.confirmation.confirm({
      title: 'Retirer du personnel',
      message: `${member.firstName} ${member.lastName} sera retiré du personnel de l’établissement et perdra tous ses accès. Son compte FasoÉcole n’est pas supprimé.`,
      confirmLabel: 'Retirer',
      destructive: true,
    });
    if (!ok) return;
    this.busy.set(true);
    this.clearMessages();
    this.api.remove(member.id).subscribe({
      next: () => {
        this.staff.update((list) => list.filter((s) => s.id !== member.id));
        this.done('Membre retiré du personnel.');
      },
      error: (err) => this.fail(err, 'Impossible de retirer ce membre.'),
    });
  }

  private selectSchool(id: number): void {
    this.schoolId.set(id);

    this.closeForm();
    this.loading.set(true);
    this.api.list(id).subscribe({
      next: (list) => {
        this.staff.set(list);
        const requested = Number(this.route.snapshot.queryParamMap.get('staffId'));
        const member = list.find(s => s.id === requested);
        if (member) this.openEdit(member);
        this.loading.set(false);
      },
      error: (err) => {
        this.staff.set([]);
        this.loading.set(false);
        this.error.set(err?.error?.message ?? 'Impossible de charger le personnel.');
      },
    });
  }

  private replace(member: StaffMember): void {
    this.staff.update((list) => list.map((s) => (s.id === member.id ? member : s)));
  }

  private done(message: string): void {
    this.busy.set(false);
    this.formOpen.set(false);
    this.editing = null;
    this.success.set(message);
  }

  private fail(err: { error?: { message?: string } } | null, fallback: string): void {
    this.busy.set(false);
    this.error.set(err?.error?.message ?? fallback);
  }

  private clearMessages(): void {
    this.error.set(null);
    this.success.set(null);
  }

  private emptyForm() {
    return { firstName: '', lastName: '', email: '', phone: '', jobTitle: '', monthlySalary: null as number | null, modules: new Set<OwnerModule>() };
  }
}
