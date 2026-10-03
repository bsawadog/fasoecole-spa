import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule, NgForm } from '@angular/forms';
import {
  ApprovalRole,
  AuthService,
  ProfileUpdate,
  RegistrationSchool,
  SchoolAccessRequest,
  SchoolAccessService,
  SchoolAccessStatus,
} from '../../core/auth';

import { parseChildMatricules, childMatriculesError } from '../../core/auth/child-matricules';

const REQUESTABLE_ROLES: ApprovalRole[] = ['TEACHER', 'PARENT', 'STUDENT'];

export const ROLE_LABELS: Record<ApprovalRole, string> = {
  TEACHER: 'Enseignant',
  PARENT: 'Parent',
  STUDENT: 'Élève',
};

const STATUS_LABELS: Record<SchoolAccessStatus, string> = {
  PENDING: 'En attente',
  APPROVED: 'Acceptée',
  REJECTED: 'Refusée',
  AUTO_APPROVED: 'Accordée automatiquement',
  REVOKED: 'Accès retiré',
};

function apiMessage(error: unknown, fallback: string): string {
  const message = error instanceof HttpErrorResponse ? error.error?.message : null;
  return typeof message === 'string' && message.trim() ? message : fallback;
}

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class ProfilePage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly schoolAccess = inject(SchoolAccessService);
  private readonly destroyRef = inject(DestroyRef);

  readonly user = this.auth.user;
  readonly roleLabels = ROLE_LABELS;
  readonly requestableRoles = REQUESTABLE_ROLES;

  // Informations personnelles
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal(false);

  // Mot de passe
  readonly passwordSaving = signal(false);
  readonly passwordError = signal<string | null>(null);
  readonly passwordSuccess = signal(false);

  // Accès à d'autres établissements
  readonly canRequestSchools = computed(() => {
    const user = this.user();
    return !!user?.approved && user.emailVerified === true && REQUESTABLE_ROLES.some((role) => user.rawRoles.includes(role));
  });
  readonly schools = signal<RegistrationSchool[]>([]);
  readonly requests = signal<SchoolAccessRequest[]>([]);
  readonly accessLoading = signal(false);
  readonly accessSaving = signal(false);
  readonly accessError = signal<string | null>(null);
  readonly accessSuccess = signal<string | null>(null);

  // Vérification de l'adresse courriel
  readonly emailUnverified = computed(() => this.user()?.emailVerified === false);
  readonly verificationSending = signal(false);
  readonly verificationMessage = signal<string | null>(null);

  onboardingLabel(step: string): string {
    const labels: Record<string, string> = {
      ACCOUNT_INACTIVE: 'Compte désactivé', PASSWORD_REQUIRED: 'Mot de passe à choisir',
      EMAIL_VERIFICATION_REQUIRED: 'Courriel à confirmer', APPROVAL_REQUIRED: 'Approbation de l’établissement en attente',
      CHILD_LINK_REQUIRED: 'Enfant à rattacher par l’établissement', CLASS_ASSIGNMENT_REQUIRED: 'Classe à affecter par l’établissement',
      TEACHING_ASSIGNMENT_REQUIRED: 'Classe et matière à affecter par l’établissement', READY: 'Compte prêt',
    };
    return labels[step] ?? step;
  }

  resendVerification(): void {
    this.verificationSending.set(true);
    this.verificationMessage.set(null);
    this.auth.resendEmailVerification().subscribe({
      next: (result) => {
        this.verificationSending.set(false);
        this.verificationMessage.set(result.emailSent
          ? 'Un lien de vérification vient d’être envoyé à votre adresse courriel.'
          : 'Le courriel n’a pas pu être envoyé. Réessayez plus tard ou contactez l’établissement.');
      },
      error: () => {
        this.verificationSending.set(false);
        this.verificationMessage.set('Impossible d’envoyer le lien pour le moment. Réessayez plus tard.');
      },
    });
  }

  form: ProfileUpdate = {
    firstName: this.user()?.firstName ?? '',
    lastName: this.user()?.lastName ?? '',
    phone: this.user()?.phone ?? '',
  };

  initialChildMatricules = (this.user()?.childRegistrationNumbers ?? []).join(', ');
  accessChildMatricules = '';
  accessSchoolIdentifier = '';
  initialSchoolIdentifier = this.user()?.schoolIdentifier ?? '';

  passwordForm = { currentPassword: '', newPassword: '', confirmPassword: '' };

  accessForm: { schoolId: number | null; role: ApprovalRole } = {
    schoolId: null,
    role: this.defaultRequestedRole(),
  };

  ngOnInit(): void {
    if (this.canRequestSchools()) {
      this.loadSchoolAccess();
    }
  }

  save(profileForm: NgForm): void {
    if (this.saving()) return;
    if (profileForm.invalid || !this.form.firstName.trim() || !this.form.lastName.trim()) {
      this.error.set('Le prénom et le nom sont obligatoires.');
      this.success.set(false);
      return;
    }
    const childRegistrationNumbers = this.user()?.requestedRole === 'PARENT' && !this.user()?.approved
      ? parseChildMatricules(this.initialChildMatricules) : undefined;
    if (childRegistrationNumbers) {
      const error = childMatriculesError(childRegistrationNumbers);
      if (error) { this.error.set(error); return; }
    }
    this.error.set(null);
    this.success.set(false);
    this.saving.set(true);
    const schoolIdentifier = !this.user()?.approved && ['TEACHER', 'STUDENT'].includes(this.user()?.requestedRole ?? '') ? this.initialSchoolIdentifier.trim() : undefined;
    if (schoolIdentifier !== undefined && !schoolIdentifier) {
      this.saving.set(false); this.error.set('Renseignez votre identifiant dans l’établissement.'); return;
    }
    this.auth.updateProfile({
      schoolIdentifier,
      childRegistrationNumbers,
      firstName: this.form.firstName.trim(),
      lastName: this.form.lastName.trim(),
      phone: this.form.phone.trim(),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (user) => {
        this.form = {
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone ?? '',
        };
        this.saving.set(false);
        this.success.set(true);
      },
      error: () => {
        this.saving.set(false);
        this.error.set('Impossible d’enregistrer les modifications. Veuillez réessayer.');
      },
    });
  }

  changePassword(passwordForm: NgForm): void {
    if (this.passwordSaving()) return;
    this.passwordSuccess.set(false);
    const { currentPassword, newPassword, confirmPassword } = this.passwordForm;
    if (!currentPassword || !newPassword) {
      this.passwordError.set('Renseignez votre mot de passe actuel et le nouveau mot de passe.');
      return;
    }
    if (newPassword.length < 8) {
      this.passwordError.set('Le nouveau mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (newPassword !== confirmPassword) {
      this.passwordError.set('La confirmation ne correspond pas au nouveau mot de passe.');
      return;
    }
    if (newPassword === currentPassword) {
      this.passwordError.set('Le nouveau mot de passe doit être différent de l’actuel.');
      return;
    }
    this.passwordError.set(null);
    this.passwordSaving.set(true);
    this.auth.changePassword(currentPassword, newPassword)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.passwordSaving.set(false);
          this.passwordSuccess.set(true);
          this.passwordForm = { currentPassword: '', newPassword: '', confirmPassword: '' };
          passwordForm.resetForm(this.passwordForm);
          this.auth.logout();
        },
        error: (err) => {
          this.passwordSaving.set(false);
          this.passwordError.set(apiMessage(err, 'Impossible de modifier le mot de passe. Veuillez réessayer.'));
        },
      });
  }

  requestAccess(): void {
    if (this.accessSaving()) return;
    this.accessSuccess.set(null);
    const schoolId = Number(this.accessForm.schoolId);
    if (!schoolId) {
      this.accessError.set('Choisissez un établissement.');
      return;
    }
    const numbers = this.accessForm.role === 'PARENT' ? parseChildMatricules(this.accessChildMatricules) : undefined;
    if (numbers) {
      const error = childMatriculesError(numbers);
      if (error) { this.accessError.set(error); return; }
    }
    this.accessError.set(null);
    this.accessSaving.set(true);
    const schoolIdentifier = this.accessForm.role === 'PARENT' ? undefined : this.accessSchoolIdentifier.trim();
    if (schoolIdentifier !== undefined && !schoolIdentifier) {
      this.accessSaving.set(false); this.accessError.set('Renseignez votre identifiant dans l’établissement.'); return;
    }
    this.schoolAccess.request(schoolId, this.accessForm.role, numbers, schoolIdentifier)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          this.accessSaving.set(false);
          this.requests.update((list) => [created, ...list]);
          this.accessForm = { schoolId: null, role: this.defaultRequestedRole() };
          this.accessChildMatricules = '';
          this.accessSchoolIdentifier = '';
          this.accessSuccess.set(
            `Votre demande pour ${created.schoolName} a été envoyée au propriétaire de l’établissement.`
          );
        },
        error: (err) => {
          this.accessSaving.set(false);
          this.accessError.set(apiMessage(err, 'Impossible d’envoyer la demande. Veuillez réessayer.'));
        },
      });
  }

  cancelRequest(request: SchoolAccessRequest): void {
    if (this.accessSaving()) return;
    this.accessError.set(null);
    this.accessSuccess.set(null);
    this.accessSaving.set(true);
    this.schoolAccess.cancel(request.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.accessSaving.set(false);
          this.requests.update((list) => list.filter((r) => r.id !== request.id));
          this.accessSuccess.set(`La demande pour ${request.schoolName} a été annulée.`);
        },
        error: (err) => {
          this.accessSaving.set(false);
          this.accessError.set(apiMessage(err, 'Impossible d’annuler la demande.'));
        },
      });
  }

  statusLabel(status: SchoolAccessStatus): string {
    return STATUS_LABELS[status] ?? status;
  }

  private loadSchoolAccess(): void {
    this.accessLoading.set(true);
    this.auth.getRegistrationSchools()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (schools) => this.schools.set(schools),
        error: () => this.accessError.set('Impossible de charger la liste des établissements.'),
      });
    this.schoolAccess.mine()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (requests) => {
          this.requests.set(requests);
          this.accessLoading.set(false);
        },
        error: () => {
          this.accessLoading.set(false);
          this.accessError.set('Impossible de charger vos demandes d’accès.');
        },
      });
  }

  private defaultRequestedRole(): ApprovalRole {
    const roles = this.user()?.rawRoles ?? [];
    return REQUESTABLE_ROLES.find((role) => roles.includes(role)) ?? 'TEACHER';
  }
}
