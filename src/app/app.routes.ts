import { Routes } from '@angular/router';
import { authGuard, roleGuard, roleHomeRedirectGuard } from './core/auth';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./features/home/home').then((m) => m.Home),
  },
  {
    path: 'login',
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },
  {
    path: 'services/:slug',
    loadComponent: () => import('./features/home/service-detail').then((m) => m.ServiceDetail),
  },
  {
    path: 'etablissements/:id',
    loadComponent: () => import('./features/home/school-directory').then((m) => m.SchoolDirectory),
  },
  {
    path: 'etablissements',
    loadComponent: () => import('./features/home/school-directory').then((m) => m.SchoolDirectory),
  },
  {
    path: 'unauthorized',
    loadComponent: () =>
      import('./shared/components/unauthorized/unauthorized').then((m) => m.Unauthorized),
  },
  {
    path: '',
    loadComponent: () => import('./core/layout/app-shell/app-shell').then((m) => m.AppShell),
    canActivate: [authGuard],
    children: [
      {
        path: 'profil',
        loadComponent: () => import('./features/profile/profile').then((m) => m.ProfilePage),
      },
      {
        path: 'admin',
        canActivate: [roleGuard(['admin'])],
        loadChildren: () => import('./features/dashboard-admin/admin.routes').then((m) => m.ADMIN_ROUTES),
      },
      {
        path: 'proprietaire',
        canActivate: [roleGuard(['proprietaire'])],
        loadChildren: () =>
          import('./features/dashboard-proprietaire/proprietaire.routes').then((m) => m.PROPRIETAIRE_ROUTES),
      },
      {
        path: 'enseignant',
        canActivate: [roleGuard(['enseignant'])],
        loadChildren: () =>
          import('./features/dashboard-enseignant/enseignant.routes').then((m) => m.ENSEIGNANT_ROUTES),
      },
      {
        path: 'etudiant',
        canActivate: [roleGuard(['etudiant'])],
        loadChildren: () =>
          import('./features/dashboard-etudiant/etudiant.routes').then((m) => m.ETUDIANT_ROUTES),
      },
      {
        path: 'parent',
        canActivate: [roleGuard(['parent'])],
        loadChildren: () => import('./features/dashboard-parent/parent.routes').then((m) => m.PARENT_ROUTES),
      },
      { path: '', pathMatch: 'full', redirectTo: 'login' },
      { path: '**', canActivate: [roleHomeRedirectGuard], children: [] },
    ],
  },
  { path: '**', redirectTo: 'login' },
];
