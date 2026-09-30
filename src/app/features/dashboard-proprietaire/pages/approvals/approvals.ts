import { Component, inject, OnInit, signal } from '@angular/core';
import { AuthService, ApprovalRole, RegistrationSchool } from '../../../../core/auth';
import { UserDto } from '../../../../core/models';

interface ApprovalSelection {
  schoolId: number;
  role: ApprovalRole;
}

@Component({
  selector: 'app-approvals',
  standalone: true,
  templateUrl: './approvals.html',
  styleUrl: './approvals.scss',
})
export class Approvals implements OnInit {
  private readonly auth = inject(AuthService);

  readonly pending = signal<UserDto[]>([]);
  readonly schools = signal<RegistrationSchool[]>([]);
  readonly selections = signal<Record<number, ApprovalSelection>>({});
  readonly loading = signal(true);
  readonly savingUserId = signal<number | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  ngOnInit(): void {
    const ownerId = this.auth.user()?.id;
    if (!ownerId) {
      this.loading.set(false);
      this.errorMessage.set('Impossible d’identifier votre compte.');
      return;
    }

    this.auth.getOwnedSchools(ownerId).subscribe({
      next: (schools) => {
        this.schools.set(schools);
        this.loadRequests(schools);
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Impossible de charger vos établissements.');
      },
    });
  }

  changeSchool(userId: number, event: Event): void {
    const schoolId = Number((event.target as HTMLSelectElement).value);
    this.updateSelection(userId, { schoolId });
  }

  changeRole(userId: number, event: Event): void {
    const role = (event.target as HTMLSelectElement).value as ApprovalRole;
    this.updateSelection(userId, { role });
  }

  requestedRoleLabel(role: string | null): string {
    const labels: Record<ApprovalRole, string> = {
      TEACHER: 'Enseignant',
      PARENT: 'Parent',
      STUDENT: 'Étudiant',
    };
    return role && role in labels ? labels[role as ApprovalRole] : 'Non précisé';
  }

  approve(user: UserDto): void {
    const selection = this.selections()[user.id];
    if (!selection || !selection.schoolId || this.savingUserId() !== null) {
      return;
    }

    this.savingUserId.set(user.id);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.auth.approvePendingUser(user.id, selection.schoolId, selection.role).subscribe({
      next: () => {
        this.pending.update((requests) => requests.filter((request) => request.id !== user.id));
        this.savingUserId.set(null);
        this.successMessage.set(`Le compte de ${user.firstName} ${user.lastName} est maintenant activé.`);
      },
      error: () => {
        this.savingUserId.set(null);
        this.errorMessage.set('La validation a échoué. Vérifiez vos droits et réessayez.');
      },
    });
  }

  private loadRequests(schools: RegistrationSchool[]): void {
    this.auth.getPendingApprovals().subscribe({
      next: (requests) => {
        this.pending.set(requests);
        const defaultSchoolId = schools[0]?.id ?? 0;
        this.selections.set(
          Object.fromEntries(
            requests.map((request) => [
              request.id,
              {
                schoolId: request.requestedSchoolId ?? defaultSchoolId,
                role: (request.requestedRole as ApprovalRole | null) ?? 'TEACHER',
              },
            ]),
          ),
        );
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Impossible de charger les demandes de compte.');
      },
    });
  }

  private updateSelection(userId: number, update: Partial<ApprovalSelection>): void {
    this.selections.update((current) => ({
      ...current,
      [userId]: { ...current[userId], ...update },
    }));
  }
}
