import { Component, inject, OnInit, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LucideArrowLeft, LucideArrowRight, LucideEye, LucideEyeOff, LucideGraduationCap } from '@lucide/angular';
import { AuthService, RegistrationSchool } from '../../../../core/auth';

type AuthMode = 'login' | 'register' | 'forgot' | 'reset';

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
    LucideGraduationCap,
  ],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  readonly mode = signal<AuthMode>(this.route.snapshot.queryParamMap.has('token') ? 'reset' : 'login');
  readonly loading = signal(false);
  readonly schoolsLoading = signal(true);
  readonly schools = signal<RegistrationSchool[]>([]);
  readonly schoolsError = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly showPassword = signal(false);
  readonly resetToken = this.route.snapshot.queryParamMap.get('token');

  ngOnInit(): void {
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
    email: ['', [Validators.required, Validators.email]],
    phone: [''],
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
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }
    const { firstName, lastName, email, phone, schoolId, requestedRole, password, confirmPassword } = this.registerForm.getRawValue();
    if (this.schools().length === 0) {
      this.errorMessage.set('Aucun établissement disponible pour le moment.');
      return;
    }
    if (password !== confirmPassword) {
      this.errorMessage.set('Les deux mots de passe ne correspondent pas.');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);
    this.auth.register({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      password,
      schoolId,
      requestedRole,
    }).subscribe({
      next: () => {
        this.loading.set(false);
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
    if (!this.resetToken) {
      this.errorMessage.set('Le lien de réinitialisation est invalide ou incomplet.');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);
    this.auth.resetPassword(this.resetToken, password).subscribe({
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
