import { Component, computed, DestroyRef, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
import { SchoolDataSyncService } from '../../../../shared/school-data-sync.service';
import { OwnerFamilyMessagesService } from '../../family-messages.service';
import { apiError } from '../../../../shared/self-space/self-space.service';

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
  private readonly family = inject(OwnerFamilyMessagesService);
  private readonly destroyRef = inject(DestroyRef);
  readonly reportBusyId = signal<number | null>(null);
  readonly reportError = signal<string | null>(null);
  readonly reportSuccess = signal<string | null>(null);
  readonly showAttendanceHistory = signal(false);
  readonly canRecordReport = computed(() => this.auth.isSchoolOwner()
    || (this.auth.ownerAccess() ?? []).some(access => access.schoolId === this.selectedSchoolId() && access.modules.includes('STUDENTS')));
  readonly sync = inject(SchoolDataSyncService);
  private syncSubscription?: Subscription;
  readonly lastUpdated = signal<Date | null>(null);
  readonly syncError = signal(false);
  private dashboardRequest?: Subscription;
  readonly user = this.auth.user;
  readonly schools = signal<RegistrationSchool[]>([]);
  readonly selectedSchoolId = signal<number | null>(null);
  readonly dashboard = signal<OwnerDashboard | null>(null);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  ngOnDestroy(): void {
    this.dashboardRequest?.unsubscribe();
    this.syncSubscription?.unsubscribe();
  }

  ngOnInit(): void {
    const ownerId = this.user()?.id;
    if (!ownerId) {
      this.loading.set(false);
      this.errorMessage.set('Impossible d’identifier votre compte propriétaire.');
      return;
    }

    this.auth.getOwnedSchools(ownerId, 'DASHBOARD').subscribe({
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
      PRESCOLAIRE: 'Établissement préscolaire',
      PRIMAIRE: 'École primaire',
      SECONDAIRE: 'Établissement secondaire',
      MIXTE: 'Établissement mixte',
      UNIVERSITE: 'Université',
      FORMATION: 'Centre de formation',
    };
    return labels[type] ?? type;
  }

  private selectSchool(schoolId: number): void {
    this.dashboardRequest?.unsubscribe();
    this.syncSubscription?.unsubscribe();
    this.selectedSchoolId.set(schoolId);
    this.auth.selectSchoolContext(schoolId);
    this.loading.set(true);
    this.dashboard.set(null);
    this.lastUpdated.set(null);
    this.errorMessage.set(null);
    this.reportError.set(null);
    this.reportSuccess.set(null);
    this.showAttendanceHistory.set(false);
    this.refreshDashboard(schoolId);
    this.syncSubscription = this.sync.watch(schoolId).subscribe(() => this.refreshDashboard(schoolId));
  }

  refreshDashboard(schoolId: number): void {
    this.dashboardRequest?.unsubscribe();
    this.dashboardRequest = this.auth.getOwnerDashboard(schoolId).subscribe({
      next: (dashboard) => {
        if (schoolId !== this.selectedSchoolId()) return;
        this.dashboard.set(dashboard);
        this.errorMessage.set(null);
        this.lastUpdated.set(new Date());
        this.syncError.set(false);
        this.loading.set(false);
      },
      error: () => {
        if (schoolId !== this.selectedSchoolId()) return;
        this.syncError.set(true);
        this.loading.set(false);
        if (!this.dashboard()) this.errorMessage.set('Impossible de charger les indicateurs de cet établissement.');
      },
    });
  }

  recordReport(report: NonNullable<OwnerDashboard['pendingAttendanceReports']>[number]): void {
    const schoolId = this.selectedSchoolId();
    if (!schoolId || this.reportBusyId() !== null || !this.canRecordReport()) return;
    this.reportBusyId.set(report.id);
    this.reportError.set(null);
    this.reportSuccess.set(null);
    this.family.recordAttendanceReport(report.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.reportBusyId.set(null);
        if (schoolId !== this.selectedSchoolId()) return;
        this.reportSuccess.set(`${report.attendanceType === 'LATE' ? 'Retard' : 'Absence'} enregistré pour ${report.studentName}.`);
        this.refreshDashboard(schoolId);
      },
      error: err => {
        this.reportBusyId.set(null);
        if (schoolId !== this.selectedSchoolId()) return;
        this.reportError.set(apiError(err, 'Impossible d’enregistrer ce signalement.'));
        this.refreshDashboard(schoolId);
      },
    });
  }
}
