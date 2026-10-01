import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import {
  LucideBookOpen,
  LucideBuilding2,
  LucideCalendarDays,
  LucideClock3,
  LucideGraduationCap,
  LucideHouse,
  LucideLogOut,
  LucideNotebookPen,
  LucideStar,
  LucideUsers,
  LucideWallet,
} from '@lucide/angular';
import { AuthService } from '../../auth';
import { Role } from '../../models';
import { catchError, EMPTY, exhaustMap, filter, timer } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

interface NavigationItem {
  label: string;
  icon: 'home' | 'building' | 'users' | 'notes' | 'calendar' | 'star' | 'book' | 'graduation' | 'wallet';
  routerLink: string;
}

const MENU_BY_ROLE: Record<Role, NavigationItem[]> = {
  admin: [
    { label: 'Accueil', icon: 'home', routerLink: '/admin' },
    { label: 'Écoles', icon: 'building', routerLink: '/admin/ecoles' },
    { label: 'Utilisateurs', icon: 'users', routerLink: '/admin/utilisateurs' },
  ],
  proprietaire: [
    { label: 'Accueil', icon: 'home', routerLink: '/proprietaire' },
    { label: 'Demandes de compte', icon: 'users', routerLink: '/proprietaire/demandes' },
    { label: 'Gestion de l’école', icon: 'book', routerLink: '/proprietaire/gestion' },
    { label: 'Élèves par classe', icon: 'graduation', routerLink: '/proprietaire/classes' },
    { label: 'Enseignants par classe', icon: 'users', routerLink: '/proprietaire/enseignants' },
    { label: 'Frais & paiements', icon: 'wallet', routerLink: '/proprietaire/frais' },
    { label: 'Notes & bulletins', icon: 'notes', routerLink: '/proprietaire/notes' },
  ],
  enseignant: [
    { label: 'Accueil', icon: 'home', routerLink: '/enseignant' },
    { label: 'Mes classes', icon: 'users', routerLink: '/enseignant/classes' },
    { label: 'Notes', icon: 'notes', routerLink: '/enseignant/notes' },
  ],
  etudiant: [
    { label: 'Accueil', icon: 'home', routerLink: '/etudiant' },
    { label: 'Mes notes', icon: 'star', routerLink: '/etudiant/notes' },
    { label: 'Emploi du temps', icon: 'calendar', routerLink: '/etudiant/emploi-du-temps' },
  ],
  parent: [
    { label: 'Accueil', icon: 'home', routerLink: '/parent' },
    { label: 'Mes enfants', icon: 'users', routerLink: '/parent/enfants' },
  ],
};

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    LucideBookOpen,
    LucideBuilding2,
    LucideCalendarDays,
    LucideClock3,
    LucideGraduationCap,
    LucideHouse,
    LucideLogOut,
    LucideNotebookPen,
    LucideStar,
    LucideUsers,
    LucideWallet,
  ],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
})
export class AppShell implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly user = this.auth.user;
  readonly accountStatusError = signal(false);
  readonly menuItems = computed<NavigationItem[]>(() => {
    const role = this.auth.role();
    return role ? MENU_BY_ROLE[role] : [];
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
    timer(0, 20_000)
      .pipe(
        filter(() => this.user()?.approved !== true),
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
}
