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
    return !!user?.approved && REQUESTABLE_ROLES.some((role) => user.rawRoles.includes(role));
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

  resendVerification(): void {
    this.verificationSending.set(true);
    this.verificationMessage.set(null);
    this.auth.resendEmailVerification().subscribe({
      next: () => {
        this.verificationSending.set(false);
        this.verificationMessage.set('Un lien de vérification vient d’être envoyé à votre adresse courriel.');
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
    this.error.set(null);
    this.success.set(false);
    this.saving.set(true);
    this.auth.updateProfile({
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
    this.accessError.set(null);
    this.accessSaving.set(true);
    this.schoolAccess.request(schoolId, this.accessForm.role)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          this.accessSaving.set(false);
          this.requests.update((list) => [created, ...list]);
          this.accessForm = { schoolId: null, role: this.defaultRequestedRole() };
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
