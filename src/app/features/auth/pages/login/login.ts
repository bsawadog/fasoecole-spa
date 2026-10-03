import { Component, inject, OnInit, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LucideArrowLeft, LucideArrowRight, LucideEye, LucideEyeOff } from '@lucide/angular';
import { AuthService, RegistrationSchool } from '../../../../core/auth';

import { parseChildMatricules, childMatriculesError } from '../../../../core/auth/child-matricules';

type AuthMode = 'login' | 'register' | 'forgot' | 'reset' | 'activate';

function initialMode(params: { has(name: string): boolean }): AuthMode {
  if (params.has('activate')) return 'activate';
  if (params.has('token')) return 'reset';
  return 'login';
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    LucideArrowLeft,
    LucideArrowRight,
    LucideEye,
    LucideEyeOff,
  ],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  readonly mode = signal<AuthMode>(initialMode(this.route.snapshot.queryParamMap));
  readonly loading = signal(false);
  readonly schoolsLoading = signal(true);
  readonly schools = signal<RegistrationSchool[]>([]);
  readonly schoolsError = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly showPassword = signal(false);
  readonly imagePaused = signal(false);
  readonly resetToken = this.route.snapshot.queryParamMap.get('token');
  readonly activationToken = this.route.snapshot.queryParamMap.get('activate');
  private readonly verificationToken = this.route.snapshot.queryParamMap.get('verify');

  ngOnInit(): void {
    if (this.verificationToken) {
      this.confirmEmail(this.verificationToken);
    }
    this.auth.getRegistrationSchools().subscribe({
      next: (schools) => {
        this.schools.set(schools);
        this.schoolsLoading.set(false);
      },
      error: () => {
        this.schoolsLoading.set(false);
        this.schoolsError.set('La liste des établissements est indisponible. Réessayez plus tard.');
      },
    });
  }

  readonly loginForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  readonly registerForm = this.fb.nonNullable.group({
    firstName: ['', [Validators.required, Validators.maxLength(100)]],
    lastName: ['', [Validators.required, Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(150)]],
    phone: ['', Validators.maxLength(30)],
    childMatricules: ['', Validators.maxLength(1100)],
    schoolIdentifier: ['', Validators.maxLength(50)],
    schoolId: [0, [Validators.required, Validators.min(1)]],
    requestedRole: ['TEACHER' as 'TEACHER' | 'PARENT' | 'STUDENT', Validators.required],
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', Validators.required],
  });

  readonly emailForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  readonly resetForm = this.fb.nonNullable.group({
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', Validators.required],
  });

  togglePasswordVisibility(): void {
    this.showPassword.update((visible) => !visible);
  }

  setMode(mode: AuthMode): void {
    this.mode.set(mode);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.showPassword.set(false);
  }

  submitLogin(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.errorMessage.set(null);
    const { email, password } = this.loginForm.getRawValue();
    this.auth.login(email.trim().toLowerCase(), password).subscribe({
      next: () => {
        this.loading.set(false);
        this.auth.redirectAfterLogin();
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Adresse e-mail ou mot de passe incorrect.');
      },
    });
  }

  submitRegistration(): void {
    if (this.loading()) return;
    this.errorMessage.set(null);
    const controls = this.registerForm.controls;
    for (const control of [controls.firstName, controls.lastName, controls.email, controls.phone]) {
      control.setValue(control.value.trim());
    }
    if (this.schoolsLoading()) {
      this.errorMessage.set('Veuillez attendre le chargement des établissements.');
      return;
    }
    if (this.schools().length === 0) {
      this.errorMessage.set(this.schoolsError() ?? 'Aucun établissement disponible pour le moment.');
      return;
    }
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      this.errorMessage.set('La demande n’a pas été envoyée. Corrigez les champs indiqués ci-dessous.');
      return;
    }
    const { firstName, lastName, email, phone, schoolId, requestedRole, password, confirmPassword } = this.registerForm.getRawValue();
    if (!this.schools().some(school => school.id === schoolId)) {
      this.errorMessage.set('Choisissez un établissement dans la liste.');
      return;
    }
    if (password !== confirmPassword) {
      this.errorMessage.set('Les deux mots de passe ne correspondent pas.');
      return;
    }

    const schoolIdentifier = requestedRole === 'PARENT' ? undefined : controls.schoolIdentifier.value.trim();
    if (requestedRole !== 'PARENT' && !schoolIdentifier) {
      this.errorMessage.set(requestedRole === 'STUDENT' ? 'Renseignez votre matricule.' : 'Renseignez votre numéro d’employé.');
      controls.schoolIdentifier.markAsTouched(); return;
    }
    const childRegistrationNumbers = requestedRole === 'PARENT' ? parseChildMatricules(controls.childMatricules.value) : [];
    if (requestedRole === 'PARENT') {
      const error = childMatriculesError(childRegistrationNumbers);
      if (error) { this.errorMessage.set(error); controls.childMatricules.markAsTouched(); return; }
    }
    this.loading.set(true);
    this.errorMessage.set(null);
    this.auth.register({
      schoolIdentifier,
      childRegistrationNumbers,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      password,
      schoolId,
      requestedRole,
    }).subscribe({
      next: (result) => {
        this.loading.set(false);
        if ('activationRequired' in result) {
          this.registerForm.reset();
          this.mode.set('login');
          this.errorMessage.set(null);
          this.successMessage.set(result.message);
          return;
        }
        this.auth.redirectAfterLogin();
      },
      error: (error: HttpErrorResponse) => {
        this.loading.set(false);
        const message = error.error?.message;
        this.errorMessage.set(
          typeof message === 'string'
            ? message
            : 'Impossible de créer la demande. Vérifiez les informations ou contactez l’établissement.',
        );
      },
    });
  }

  registrationFieldError(field: keyof typeof this.registerForm.controls): string | null {
    const control = this.registerForm.controls[field];
    if (!control.touched) return null;
    if (field === 'schoolId' && control.invalid) return 'Choisissez un établissement.';
    if (control.hasError('required')) return 'Ce champ est obligatoire.';
    if (control.hasError('email')) return 'Saisissez une adresse e-mail valide.';
    if (control.hasError('minlength')) return 'Le mot de passe doit contenir au moins 8 caractères.';
    if (control.hasError('maxlength')) return `Ce champ est limité à ${control.getError('maxlength').requiredLength} caractères.`;
    if (field === 'confirmPassword' && control.value !== this.registerForm.controls.password.value) {
      return 'Les deux mots de passe ne correspondent pas.';
    }
    return null;
  }

  /** Lien « vérifier mon adresse » : confirmé automatiquement à l'ouverture de la page. */
  private confirmEmail(token: string): void {
    this.loading.set(true);
    this.auth.verifyEmail(token).subscribe({
      next: () => {
        this.loading.set(false);
        this.successMessage.set('Votre adresse courriel est confirmée. Connectez-vous pour accéder à votre espace.');
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Ce lien de vérification est invalide ou expiré. Demandez-en un nouveau depuis votre profil.');
      },
    });
  }

  submitForgotPassword(): void {
    if (this.emailForm.invalid) {
      this.emailForm.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.errorMessage.set(null);
    const email = this.emailForm.controls.email.value.trim().toLowerCase();
    this.auth.requestPasswordReset(email).subscribe({
      next: (response) => {
        this.loading.set(false);
        this.successMessage.set(response.message);
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Le service de réinitialisation est momentanément indisponible. Réessayez plus tard.');
      },
    });
  }

  submitPasswordReset(): void {
    if (this.resetForm.invalid) {
      this.resetForm.markAllAsTouched();
      return;
    }
    const { password, confirmPassword } = this.resetForm.getRawValue();
    if (password !== confirmPassword) {
      this.errorMessage.set('Les deux mots de passe ne correspondent pas.');
      return;
    }
    if (!this.resetToken && !this.activationToken) {
      this.errorMessage.set('Le lien de réinitialisation est invalide ou incomplet.');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);
    if (this.mode() === 'activate' && this.activationToken) {
      this.auth.verifyEmail(this.activationToken, password).subscribe({
        next: () => {
          this.loading.set(false);
          this.resetForm.reset();
          this.setMode('login');
          this.successMessage.set('Votre compte est activé. Connectez-vous avec votre courriel et votre nouveau mot de passe.');
        },
        error: (error: HttpErrorResponse) => {
          this.loading.set(false);
          const message = error.error?.message;
          this.errorMessage.set(typeof message === 'string' && message
            ? message : 'Ce lien d’activation est invalide ou expiré. Recommencez l’inscription pour en recevoir un nouveau.');
        },
      });
      return;
    }
    this.auth.resetPassword(this.resetToken!, password).subscribe({
      next: () => {
        this.loading.set(false);
        this.resetForm.reset();
        this.setMode('login');
        this.successMessage.set('Votre mot de passe a été modifié. Vous pouvez maintenant vous connecter.');
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Ce lien est invalide ou expiré. Demandez une nouvelle réinitialisation.');
      },
    });
  }
}
