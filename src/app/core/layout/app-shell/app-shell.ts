import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
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
import { catchError, EMPTY, exhaustMap, filter, timer, take, map } from 'rxjs';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';

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
    { label: 'Calendrier scolaire', icon: 'calendar', routerLink: '/proprietaire/calendrier', module: 'STUDENTS' },
    { label: 'Discipline et vie scolaire', icon: 'shield', routerLink: '/proprietaire/discipline', module: 'STUDENTS' },
    { label: 'Bibliothèque', icon: 'book', routerLink: '/proprietaire/bibliotheque', module: 'STUDENTS' },
    { label: 'Suivi des devoirs', icon: 'notes', routerLink: '/proprietaire/suivi-devoirs', module: 'STUDENTS' },
    { label: 'Demandes administratives', icon: 'notes', routerLink: '/proprietaire/demandes-administratives', module: 'STUDENTS' },
    { label: 'Incidents', icon: 'shield', routerLink: '/proprietaire/incidents', module: null },
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
    { label: 'Recouvrement', icon: 'wallet', routerLink: '/proprietaire/frais', module: 'FINANCE' },
    { label: 'Dépenses & budget', icon: 'chart', routerLink: '/proprietaire/depenses', module: 'EXPENSES' },
    { label: 'Notes & bulletins', icon: 'notes', routerLink: '/proprietaire/notes', module: 'GRADES' },
    { label: 'Personnel & accès', icon: 'shield', routerLink: '/proprietaire/personnel', module: null },
    { label: 'Exporter mes données', icon: 'notes', routerLink: '/proprietaire/export', module: null },
    { label: 'Aide', icon: 'book', routerLink: '/proprietaire/aide', module: null },
  ],
  enseignant: [
    { label: 'Calendrier scolaire', icon: 'calendar', routerLink: '/enseignant/calendrier' },
    { label: 'Discipline et vie scolaire', icon: 'shield', routerLink: '/enseignant/discipline' },
    { label: 'Bibliothèque', icon: 'book', routerLink: '/enseignant/bibliotheque' },
    { label: 'Suivi des devoirs', icon: 'notes', routerLink: '/enseignant/suivi-devoirs' },
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
    { label: 'Calendrier scolaire', icon: 'calendar', routerLink: '/etudiant/calendrier' },
    { label: 'Discipline et vie scolaire', icon: 'shield', routerLink: '/etudiant/discipline' },
    { label: 'Bibliothèque', icon: 'book', routerLink: '/etudiant/bibliotheque' },
    { label: 'Suivi des devoirs', icon: 'notes', routerLink: '/etudiant/suivi-devoirs' },
    { label: 'Demandes administratives', icon: 'notes', routerLink: '/etudiant/demandes-administratives' },
    { label: 'Accueil', icon: 'home', routerLink: '/etudiant' },
    { label: 'Messages', icon: 'message', routerLink: '/etudiant/messages' },
    { label: 'Mes notes', icon: 'star', routerLink: '/etudiant/notes' },
    { label: 'Emploi du temps', icon: 'calendar', routerLink: '/etudiant/emploi-du-temps' },
  ],
  parent: [
    { label: 'Calendrier scolaire', icon: 'calendar', routerLink: '/parent/calendrier' },
    { label: 'Discipline et vie scolaire', icon: 'shield', routerLink: '/parent/discipline' },
    { label: 'Bibliothèque', icon: 'book', routerLink: '/parent/bibliotheque' },
    { label: 'Suivi des devoirs', icon: 'notes', routerLink: '/parent/suivi-devoirs' },
    { label: 'Demandes administratives', icon: 'notes', routerLink: '/parent/demandes-administratives' },
    { label: 'Accueil', icon: 'home', routerLink: '/parent' },
    { label: 'Mes enfants', icon: 'users', routerLink: '/parent/enfants' },
    { label: 'Notes et bulletins', icon: 'notes', routerLink: '/parent/notes' },
    { label: 'Présences et retards', icon: 'users', routerLink: '/parent/absences' },
    { label: 'Recouvrement', icon: 'wallet', routerLink: '/parent/frais' },
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
    NgTemplateOutlet,
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
  private readonly supportHttp = inject(HttpClient);
  readonly incidentsAttention = signal(0);
  private readonly familyMessages = inject(OwnerFamilyMessagesService);
  private readonly selfSpace = inject(SelfSpaceService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly routeUrl = toSignal(this.router.events.pipe(filter(event => event instanceof NavigationEnd), map(() => this.router.url)), { initialValue: this.router.url });
  readonly contextSchools = computed(() => this.auth.ownerAccess() ?? []);
  readonly selectedContextSchool = computed(() => this.contextSchools().find(school => school.schoolId === this.auth.schoolContextId()) ?? this.contextSchools()[0]);
  readonly schoolPreview = computed(() => {
    if (this.auth.role() !== 'proprietaire' || this.user()?.rawRoles.includes('SUPER_ADMIN')) return null;
    const school = this.selectedContextSchool();
    return school && ['DRAFT', 'PENDING_APPROVAL'].includes(school.status ?? '') ? school : null;
  });
  readonly previewPage = computed(() => !!this.schoolPreview() && this.routeUrl().split('?')[0].startsWith('/proprietaire') && !/\/(creer-ecole|aide|incidents)(?:\?|$)/.test(this.routeUrl()));
  readonly ownerContextLoading = computed(() => this.auth.role() === 'proprietaire' && this.auth.ownerAccess() === null && this.routeUrl().startsWith('/proprietaire') && !/\/(creer-ecole|aide|incidents)(?:\?|$)/.test(this.routeUrl()));
  readonly previewTitle = computed(() => this.menuItems().find(item => item.routerLink === this.routeUrl().split('?')[0])?.label ?? 'Découvrez votre espace établissement');
  readonly previewDescription = computed(() => {
    const route = this.routeUrl().split('?')[0].split('/').pop() ?? '';
    return ({ gestion: 'Années scolaires, niveaux, classes, matières et organisation de votre établissement.', classes: 'Listes par classe, matricules, responsables et import Excel / CSV des élèves ou étudiants.', enseignants: 'Enseignants, matières, affectations, emplois du temps et import de fichiers.', inscriptions: 'Inscription des élèves et étudiants avec leurs parents et leurs frais scolaires.', employes: 'Création des enseignants, comptables, secrétaires et autres employés.', frais: 'Tarifs, factures, paiements et soldes des élèves.', depenses: 'Dépenses, budgets et suivi des comptes.', notes: 'Évaluations, moyennes, notes et bulletins.', cloture: 'Passages, redoublements et report des soldes vers une nouvelle année.', messages: 'Messages individuels ou groupés et partage de documents.', demandes: 'Approbation des comptes et rattachement des parents à leurs enfants.', personnel: 'Gestion du personnel et des accès aux modules.', export: 'Export Excel des données et téléchargement des documents.', 'portail-parents': 'Suivi des familles, rendez-vous et signalements.', proprietaire: 'Synthèse des effectifs, présences, signalements et finances.' } as Record<string, string>)[route] ?? 'Découvrez les fonctionnalités dans le menu. Vous renseignerez les données après approbation.';
  });
  selectPreviewSchool(event: Event): void {
    const id = Number((event.target as HTMLSelectElement).value);
    if (this.contextSchools().some(school => school.schoolId === id)) this.auth.selectSchoolContext(id);
  }

  readonly user = this.auth.user;
  readonly platformIntervention = computed(() => this.user()?.rawRoles.includes('SUPER_ADMIN') && this.routeUrl().startsWith('/proprietaire'));
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
    if (this.user()?.rawRoles.includes('SUPER_ADMIN') && this.routeUrl().startsWith('/proprietaire')) return [
      { label: 'Administration plateforme', icon: 'shield', routerLink: '/admin' }, ...MENU_BY_ROLE.proprietaire
    ];
    if (this.user()?.rawRoles.includes('SUPER_ADMIN')) return [
      { label: 'Incidents', icon: 'shield', routerLink: '/admin/incidents' },
      { label: 'Accueil', icon: 'home', routerLink: '/admin' },
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
    .sort((a, b) => Number(b.icon === 'home') - Number(a.icon === 'home'))
    .map(item => item.routerLink.endsWith('/incidents') ? { ...item, badge: this.incidentsAttention() } : item)
    .map(item => item.label === 'Élèves par classe' && this.auth.selectedSchoolType() === 'UNIVERSITE'
      ? { ...item, label: 'Étudiants par classe' } : item));
  readonly messageNavigation = computed(() => this.accessibleNavigation().find(item => item.icon === 'message'));
  readonly navigationSections = computed(() => {
    const items = this.menuItems();
    const role = items.some(item => item.routerLink.startsWith('/proprietaire')) ? 'proprietaire' : this.auth.role();
    if (!role) return [{ title: '', items, active: false }];
    const groupsByRole: Record<Role, { title: string; routes: string[] }[]> = {
      proprietaire: [
      { title: 'Scolarité', routes: ['inscriptions', 'classes', 'enseignants', 'notes', 'suivi-devoirs'] },
      { title: 'Vie scolaire et familles', routes: ['calendrier', 'discipline', 'bibliotheque', 'portail-parents', 'demandes-administratives'] },
      { title: 'Finances', routes: ['frais', 'depenses'] },
      { title: 'Administration', routes: ['gestion', 'creer-ecole', 'employes', 'demandes', 'personnel', 'cloture', 'export'] },
      { title: 'Assistance', routes: ['incidents', 'aide'] },
      ],
      enseignant: [
        { title: 'Enseignement', routes: ['classes', 'notes', 'devoirs', 'suivi-devoirs', 'documents'] },
        { title: 'Vie scolaire', routes: ['emploi', 'calendrier', 'presences', 'discipline', 'bibliotheque'] },
        { title: 'Relations avec les familles', routes: ['annonces', 'rendez-vous', 'signalements'] },
      ],
      parent: [
        { title: 'Suivi de mes enfants', routes: ['enfants', 'notes', 'devoirs', 'suivi-devoirs', 'absences', 'discipline'] },
        { title: 'Vie scolaire', routes: ['emploi', 'calendrier', 'bibliotheque'] },
        { title: 'Relations avec l’école', routes: ['annonces', 'documents', 'rendez-vous', 'demandes-administratives'] },
        { title: 'Finances', routes: ['frais'] },
      ],
      etudiant: [
        { title: 'Mes études', routes: ['notes', 'suivi-devoirs'] },
        { title: 'Vie scolaire', routes: ['emploi-du-temps', 'calendrier', 'discipline', 'bibliotheque'] },
        { title: 'Démarches', routes: ['demandes-administratives'] },
      ],
      admin: [
        { title: 'Établissements', routes: ['ecoles', 'creer-ecole'] },
        { title: 'Scolarité', routes: ['inscriptions', 'classes', 'enseignants', 'cloture'] },
        { title: 'Utilisateurs et personnel', routes: ['utilisateurs', 'employes'] },
        { title: 'Assistance', routes: ['incidents'] },
      ],
    };
    const groups = groupsByRole[role];
    const prefix = `/${role}`;
    const route = this.routeUrl().split('?')[0];
    const groupedRoutes = new Set(groups.flatMap(group => group.routes.map(slug => `${prefix}/${slug}`)));
    return [
      { title: '', items: items.filter(item => !groupedRoutes.has(item.routerLink)), active: false },
      ...groups.map(group => ({
        title: group.title,
        items: group.routes.flatMap(slug => items.filter(item => item.routerLink === `${prefix}/${slug}`)),
        active: group.routes.some(slug => route === `${prefix}/${slug}` || route.startsWith(`${prefix}/${slug}/`)),
      })).filter(group => group.items.length > 0),
    ];
  });
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
    if (this.auth.isSchoolOwner()) {
      timer(0, 20_000).pipe(
        filter(() => this.user()?.approved === true && this.user()?.emailVerified === true),
        exhaustMap(() => this.supportHttp.get<number>(`${environment.apiUrl}/support/incidents/attention-count`).pipe(catchError(() => EMPTY))),
        takeUntilDestroyed(this.destroyRef),
      ).subscribe(count => this.incidentsAttention.set(count));
    }
    if (this.auth.role() === 'proprietaire' || this.user()?.rawRoles.includes('SUPER_ADMIN')) {
      timer(0, 20_000).pipe(
        filter(() => this.user()?.approved === true && this.user()?.emailVerified === true),
        exhaustMap(() => this.auth.loadOwnerAccess(true).pipe(catchError(() => EMPTY))),
        takeUntilDestroyed(this.destroyRef),
      ).subscribe();
    }
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
          this.watchSchoolUnread(schools.filter(school => !school.status || school.status === 'ACTIVE').map((school) => school.id));
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
