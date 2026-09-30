import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  LucideArrowRight,
  LucideBookOpen,
  LucideBuilding2,
  LucideCalendarCheck2,
  LucideGraduationCap,
  LucideHeartHandshake,
  LucideLayers3,
  LucideMail,
  LucideMessageCircle,
  LucidePanelsTopLeft,
  LucideReceiptText,
  LucideTrendingUp,
  LucideUserRoundCheck,
  LucideUsers,
  LucideWallet,
} from '@lucide/angular';
import { AuthService, OwnerDashboard, RegistrationSchool } from '../../../../core/auth';

@Component({
  selector: 'app-proprietaire-home',
  standalone: true,
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    LucideArrowRight,
    LucideBookOpen,
    LucideBuilding2,
    LucideCalendarCheck2,
    LucideGraduationCap,
    LucideHeartHandshake,
    LucideLayers3,
    LucideMail,
    LucideMessageCircle,
    LucidePanelsTopLeft,
    LucideReceiptText,
    LucideTrendingUp,
    LucideUserRoundCheck,
    LucideUsers,
    LucideWallet,
  ],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class ProprietaireHome implements OnDestroy, OnInit {
  private readonly auth = inject(AuthService);
  private dashboardRequest?: Subscription;
  readonly user = this.auth.user;
  readonly schools = signal<RegistrationSchool[]>([]);
  readonly selectedSchoolId = signal<number | null>(null);
  readonly dashboard = signal<OwnerDashboard | null>(null);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  ngOnDestroy(): void {
    this.dashboardRequest?.unsubscribe();
  }

  ngOnInit(): void {
    const ownerId = this.user()?.id;
    if (!ownerId) {
      this.loading.set(false);
      this.errorMessage.set('Impossible d’identifier votre compte propriétaire.');
      return;
    }

    this.auth.getOwnedSchools(ownerId).subscribe({
      next: (schools) => {
        this.schools.set(schools);
        if (schools.length === 0) {
          this.loading.set(false);
          return;
        }
        const storedId = Number(localStorage.getItem('fasoecole_owner_school'));
        const activeSchool = schools.find((school) => school.id === storedId) ?? schools[0];
        this.selectSchool(activeSchool.id);
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Impossible de charger vos établissements.');
      },
    });
  }

  onSchoolChange(event: Event): void {
    const schoolId = Number((event.target as HTMLSelectElement).value);
    if (this.schools().some((school) => school.id === schoolId)) {
      this.selectSchool(schoolId);
    }
  }

  formatAmount(amount: number): string {
    return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(amount)} FCFA`;
  }

  schoolTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      PRIMAIRE: 'École primaire',
      SECONDAIRE: 'Établissement secondaire',
      UNIVERSITE: 'Université',
      FORMATION: 'Centre de formation',
    };
    return labels[type] ?? type;
  }

  private selectSchool(schoolId: number): void {
    this.dashboardRequest?.unsubscribe();
    this.selectedSchoolId.set(schoolId);
    localStorage.setItem('fasoecole_owner_school', String(schoolId));
    this.loading.set(true);
    this.errorMessage.set(null);
    this.dashboardRequest = this.auth.getOwnerDashboard(schoolId).subscribe({
      next: (dashboard) => {
        this.dashboard.set(dashboard);
        this.loading.set(false);
      },
      error: () => {
        this.dashboard.set(null);
        this.loading.set(false);
        this.errorMessage.set('Impossible de charger les indicateurs de cet établissement.');
      },
    });
  }
}
