import { Component, inject, OnInit, signal } from '@angular/core';
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
  EXPENSES: 'Dépenses, budget annuel et bilan recettes / dépenses.',
  GRADES: 'Périodes, évaluations, notes, bulletins et coefficients.',
  ENROLLMENT: 'Nouvelle année scolaire, réinscriptions et passage en classe supérieure.',
};

@Component({
  selector: 'app-staff',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './staff.html',
  styleUrl: './staff.scss',
})
export class StaffPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly api = inject(StaffService);
  private readonly confirmation = inject(ConfirmationService);

  readonly modules = OWNER_MODULES.map((m) => ({ ...m, hint: MODULE_HINTS[m.code] }));
  readonly presets: Preset[] = [
    { title: 'Directeur des études', modules: ['DASHBOARD', 'MANAGEMENT', 'STUDENTS', 'TEACHERS', 'GRADES', 'ENROLLMENT'] },
    { title: 'Comptable', modules: ['DASHBOARD', 'FINANCE', 'EXPENSES'] },
    { title: 'Secrétaire', modules: ['STUDENTS', 'FINANCE', 'ENROLLMENT'] },
    { title: 'Surveillant général', modules: ['STUDENTS'] },
  ];

  readonly schools = signal<RegistrationSchool[]>([]);
  readonly schoolId = signal<number | null>(null);
  readonly staff = signal<StaffMember[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly formOpen = signal(false);
  /** Identifiants à transmettre après création ou réinitialisation (affichés une seule fois). */
  readonly credentials = signal<{ name: string; email: string; password: string; emailSent: boolean } | null>(null);

  editing: StaffMember | null = null;
  form = this.emptyForm();

  ngOnInit(): void {
    const ownerId = this.auth.user()?.id;
    if (!ownerId) {
      this.loading.set(false);
      this.error.set('Impossible d’identifier votre compte propriétaire.');
      return;
    }
    this.auth.getOwnedSchools(ownerId).subscribe({
      next: (schools) => {
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
      email: member.email,
      phone: member.phone ?? '',
      jobTitle: member.jobTitle,
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
    if (!this.editing && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) {
      this.error.set('Saisissez une adresse e-mail valide : elle servira d’identifiant de connexion.');
      return;
    }
    if (!f.modules.size) {
      this.error.set('Cochez au moins un module.');
      return;
    }
    const payload: StaffPayload = {
      firstName: f.firstName.trim(),
      lastName: f.lastName.trim(),
      email: f.email.trim(),
      phone: f.phone.trim() || null,
      jobTitle: f.jobTitle.trim(),
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
        if (created.temporaryPassword) {
          this.credentials.set({ name, email: created.staff.email, password: created.temporaryPassword,
            emailSent: created.emailSent });
          this.done(`Compte créé pour ${name}.`);
        } else {
          this.done(`${name} possède déjà un compte FasoÉcole : l’accès à l’établissement lui a été ajouté`
            + (created.emailSent ? ' et un e-mail l’en informe.' : '.'));
        }
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
      title: 'Nouveau mot de passe',
      message: `Un nouveau mot de passe provisoire sera généré pour ${member.firstName} ${member.lastName}. L’ancien ne fonctionnera plus.`,
      confirmLabel: 'Générer',
    });
    if (!ok) return;
    this.busy.set(true);
    this.clearMessages();
    this.api.resetPassword(member.id).subscribe({
      next: (reset) => {
        this.credentials.set({ name: `${member.firstName} ${member.lastName}`, email: member.email,
          password: reset.temporaryPassword, emailSent: reset.emailSent });
        this.done('Nouveau mot de passe généré.');
      },
      error: (err) => this.fail(err, 'Impossible de générer un nouveau mot de passe.'),
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

  copyCredentials(): void {
    const c = this.credentials();
    if (!c) return;
    const text = `Identifiant : ${c.email}\nMot de passe provisoire : ${c.password}`;
    navigator.clipboard?.writeText(text).then(
      () => this.success.set('Identifiants copiés.'),
      () => this.error.set('Copie impossible : notez les identifiants manuellement.')
    );
  }

  private selectSchool(id: number): void {
    this.schoolId.set(id);
    localStorage.setItem('fasoecole_owner_school', String(id));
    this.closeForm();
    this.credentials.set(null);
    this.loading.set(true);
    this.api.list(id).subscribe({
      next: (list) => {
        this.staff.set(list);
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
    return { firstName: '', lastName: '', email: '', phone: '', jobTitle: '', modules: new Set<OwnerModule>() };
  }
}
