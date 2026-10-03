import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import {
  LucideBookOpen,
  LucideBuilding2,
  LucideCalendarDays,
  LucideChartPie,
  LucideClock3,
  LucideGraduationCap,
  LucideHouse,
  LucideLogOut,
  LucideMessageCircle,
  LucideMessagesSquare,
  LucideNotebookPen,
  LucideShieldCheck,
  LucideStar,
  LucideUserRound,
  LucideUsers,
  LucideWallet,
} from '@lucide/angular';
import { AuthService, OwnerModule } from '../../auth';
import { OwnerFamilyMessagesService } from '../../../features/dashboard-proprietaire/family-messages.service';
import { SelfSpaceService } from '../../../shared/self-space/self-space.service';
import { AcademicContextPicker } from '../../../shared/academic-context';
import { Role } from '../../models';
import { catchError, EMPTY, exhaustMap, filter, timer, take } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

interface NavigationItem {
  label: string;
  icon: 'home' | 'building' | 'users' | 'notes' | 'calendar' | 'star' | 'book' | 'graduation' | 'wallet' | 'chart' | 'shield' | 'message';
  routerLink: string;
  /** Espace propriétaire : module requis pour le personnel ; null = réservé au propriétaire. */
  module?: OwnerModule | null;
  badge?: number;
}

const MENU_BY_ROLE: Record<Role, NavigationItem[]> = {
  admin: [
    { label: 'Accueil', icon: 'home', routerLink: '/admin' },
    { label: 'Créer une école', icon: 'building', routerLink: '/admin/creer-ecole' },
    { label: 'Créer un employé', icon: 'users', routerLink: '/admin/employes' },
    { label: 'Inscriptions', icon: 'calendar', routerLink: '/admin/inscriptions' },
    { label: 'Clôturer année', icon: 'calendar', routerLink: '/admin/cloture' },
    { label: 'Élèves par classe', icon: 'graduation', routerLink: '/admin/classes' },
    { label: 'Enseignants par classe', icon: 'users', routerLink: '/admin/enseignants' },
    { label: 'Écoles', icon: 'building', routerLink: '/admin/ecoles' },
    { label: 'Utilisateurs', icon: 'users', routerLink: '/admin/utilisateurs' },
  ],
  proprietaire: [
    { label: 'Accueil', icon: 'home', routerLink: '/proprietaire', module: 'DASHBOARD' },
    { label: 'Créer une école', icon: 'building', routerLink: '/proprietaire/creer-ecole', module: null },
    { label: 'Créer un employé', icon: 'users', routerLink: '/proprietaire/employes', module: null },
    { label: 'Inscriptions', icon: 'calendar', routerLink: '/proprietaire/inscriptions', module: 'ENROLLMENT' },
    { label: 'Clôturer année', icon: 'calendar', routerLink: '/proprietaire/cloture', module: null },
    { label: 'Élèves par classe', icon: 'graduation', routerLink: '/proprietaire/classes', module: 'STUDENTS' },
    { label: 'Enseignants par classe', icon: 'users', routerLink: '/proprietaire/enseignants', module: 'TEACHERS' },
    { label: 'Demandes de compte', icon: 'users', routerLink: '/proprietaire/demandes', module: null },
    { label: 'Messages', icon: 'message', routerLink: '/proprietaire/messages', module: 'STUDENTS' },
    { label: 'Portail parents', icon: 'book', routerLink: '/proprietaire/portail-parents', module: 'STUDENTS' },
    { label: 'Gestion de l’école', icon: 'book', routerLink: '/proprietaire/gestion', module: 'MANAGEMENT' },
    { label: 'Frais & paiements', icon: 'wallet', routerLink: '/proprietaire/frais', module: 'FINANCE' },
    { label: 'Dépenses & budget', icon: 'chart', routerLink: '/proprietaire/depenses', module: 'EXPENSES' },
    { label: 'Notes & bulletins', icon: 'notes', routerLink: '/proprietaire/notes', module: 'GRADES' },
    { label: 'Personnel & accès', icon: 'shield', routerLink: '/proprietaire/personnel', module: null },
    { label: 'Exporter mes données', icon: 'notes', routerLink: '/proprietaire/export', module: null },
  ],
  enseignant: [
    { label: 'Accueil', icon: 'home', routerLink: '/enseignant' },
    { label: 'Mes classes', icon: 'users', routerLink: '/enseignant/classes' },
    { label: 'Messages', icon: 'message', routerLink: '/enseignant/messages' },
    { label: 'Notes', icon: 'notes', routerLink: '/enseignant/notes' },
    { label: 'Mon emploi du temps', icon: 'calendar', routerLink: '/enseignant/emploi' },
    { label: 'Présences et retards', icon: 'users', routerLink: '/enseignant/presences' },
    { label: 'Signalements des parents', icon: 'shield', routerLink: '/enseignant/signalements' },
    { label: 'Devoirs', icon: 'book', routerLink: '/enseignant/devoirs' },
    { label: 'Documents de classe', icon: 'notes', routerLink: '/enseignant/documents' },
    { label: 'Annonces de classe', icon: 'building', routerLink: '/enseignant/annonces' },
    { label: 'Rendez-vous parents', icon: 'calendar', routerLink: '/enseignant/rendez-vous' },
  ],
  etudiant: [
    { label: 'Accueil', icon: 'home', routerLink: '/etudiant' },
    { label: 'Messages', icon: 'message', routerLink: '/etudiant/messages' },
    { label: 'Mes notes', icon: 'star', routerLink: '/etudiant/notes' },
    { label: 'Emploi du temps', icon: 'calendar', routerLink: '/etudiant/emploi-du-temps' },
  ],
  parent: [
    { label: 'Accueil', icon: 'home', routerLink: '/parent' },
    { label: 'Mes enfants', icon: 'users', routerLink: '/parent/enfants' },
    { label: 'Notes et bulletins', icon: 'notes', routerLink: '/parent/notes' },
    { label: 'Présences et retards', icon: 'users', routerLink: '/parent/absences' },
    { label: 'Frais et paiements', icon: 'wallet', routerLink: '/parent/frais' },
    { label: 'Emploi du temps', icon: 'calendar', routerLink: '/parent/emploi' },
    { label: 'Devoirs et évaluations', icon: 'book', routerLink: '/parent/devoirs' },
    { label: 'Annonces', icon: 'building', routerLink: '/parent/annonces' },
    { label: 'Documents', icon: 'notes', routerLink: '/parent/documents' },
    { label: 'Rendez-vous', icon: 'calendar', routerLink: '/parent/rendez-vous' },
    { label: 'Messages', icon: 'message', routerLink: '/parent/messages' },
  ],
};

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    RouterOutlet,
    AcademicContextPicker,
    RouterLink,
    RouterLinkActive,
    LucideBookOpen,
    LucideBuilding2,
    LucideCalendarDays,
    LucideChartPie,
    LucideClock3,
    LucideGraduationCap,
    LucideHouse,
    LucideLogOut,
    LucideMessageCircle,
    LucideMessagesSquare,
    LucideNotebookPen,
    LucideShieldCheck,
    LucideStar,
    LucideUserRound,
    LucideUsers,
    LucideWallet,
  ],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
})
export class AppShell implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly familyMessages = inject(OwnerFamilyMessagesService);
  private readonly selfSpace = inject(SelfSpaceService);
  private readonly destroyRef = inject(DestroyRef);

  readonly user = this.auth.user;
  readonly accountStatusError = signal(false);
  readonly unreadMessages = signal(0);
  readonly initials = computed(() => {
    const user = this.user();
    return `${user?.firstName?.charAt(0) ?? ''}${user?.lastName?.charAt(0) ?? ''}`.toUpperCase();
  });
  private readonly accessibleNavigation = computed<NavigationItem[]>(() => {
    const role = this.auth.role();
    if (!role || this.user()?.approved !== true || this.user()?.emailVerified !== true || this.user()?.mustChangePassword) {
      return [];
    }
    if (this.user()?.rawRoles.includes('SUPER_ADMIN')) return [
      { label: 'Établissements', icon: 'building', routerLink: '/admin' },
    ];
    if (role !== 'proprietaire') {
      return MENU_BY_ROLE[role].map((item) => item.routerLink.endsWith('/messages')
        ? { ...item, badge: this.unreadMessages() } : item);
    }
    if (this.auth.isSchoolOwner()) {
      return MENU_BY_ROLE[role].map((item) => item.routerLink === '/proprietaire/messages'
        ? { ...item, badge: this.familyMessages.unreadCount() } : item);
    }
    const allowed = this.auth.ownerModules();
    return MENU_BY_ROLE[role].filter((item) => !!item.module && allowed.has(item.module))
      .map((item) => item.routerLink === '/proprietaire/messages'
        ? { ...item, badge: this.familyMessages.unreadCount() } : item);
  });
  readonly menuItems = computed(() => this.accessibleNavigation().filter(item => item.icon !== 'message')
    .map(item => item.label === 'Élèves par classe' && this.auth.selectedSchoolType() === 'UNIVERSITE'
      ? { ...item, label: 'Étudiants par classe' } : item));
  readonly messageNavigation = computed(() => this.accessibleNavigation().find(item => item.icon === 'message'));
  /** Libellé affiché sous le nom : fonction du membre du personnel, sinon le rôle. */
  readonly roleLabel = computed(() => {
    const user = this.user();
    if (!user) {
      return '';
    }
    if (user.role === 'proprietaire' && !this.auth.isSchoolOwner()) {
      const titles = [...new Set((this.auth.ownerAccess() ?? []).map((a) => a.jobTitle))];
      return titles.length ? titles.join(' · ') : 'Personnel';
    }
    return user.role;
  });

  schoolTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      PRESCOLAIRE: 'préscolaire',
      PRIMAIRE: 'primaire',
      SECONDAIRE: 'secondaire',
      MIXTE: 'établissement mixte',
      UNIVERSITE: 'université',
      FORMATION: 'centre de formation',
    };
    return labels[type] ?? type;
  }

  ngOnInit(): void {
    if (this.auth.role() === 'parent' || this.auth.role() === 'enseignant' || this.auth.role() === 'etudiant') {
      timer(0, 20_000).pipe(
        filter(() => this.user()?.approved === true && this.user()?.emailVerified === true),
        exhaustMap(() => this.selfSpace.unreadConversationCount().pipe(
          catchError(() => EMPTY),
        )),
        takeUntilDestroyed(this.destroyRef),
      ).subscribe((count) => this.unreadMessages.set(count));
    }
    if (this.auth.role() === 'proprietaire' && this.auth.isSchoolOwner()) {
      const ownerId = this.user()?.id;
      if (ownerId) {
        timer(0, 20_000).pipe(
          filter(() => this.user()?.approved === true && this.user()?.emailVerified === true),
          take(1),
          exhaustMap(() => this.auth.getOwnedSchools(ownerId, 'DASHBOARD')),
          catchError(() => EMPTY),
          takeUntilDestroyed(this.destroyRef),
        ).subscribe((schools) => {
          this.watchSchoolUnread(schools.map((school) => school.id));
        });
      }
    }
    if (this.auth.role() === 'proprietaire' && !this.auth.isSchoolOwner()) {
      timer(0, 20_000).pipe(
        filter(() => this.user()?.approved === true && this.user()?.emailVerified === true), take(1),
        exhaustMap(() => this.auth.loadOwnerAccess()), catchError(() => EMPTY), takeUntilDestroyed(this.destroyRef),
      ).subscribe((access) => {
        this.watchSchoolUnread(access.filter((school) => school.modules.includes('STUDENTS')).map((school) => school.schoolId));
      });
    }
    timer(0, 20_000)
      .pipe(
        filter(() => this.user()?.approved !== true || this.user()?.emailVerified !== true),
        exhaustMap(() =>
          this.auth.refreshCurrentUser().pipe(
            catchError(() => {
              this.accountStatusError.set(true);
              return EMPTY;
            })
          )
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => this.accountStatusError.set(false));
  }

  logout(): void {
    this.auth.logout();
  }

  private watchSchoolUnread(schoolIds: number[]): void {
    timer(0, 20_000).pipe(
      exhaustMap(() => this.familyMessages.refreshUnreadCount(schoolIds).pipe(catchError(() => EMPTY))),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe();
  }
}
