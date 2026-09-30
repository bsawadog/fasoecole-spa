import { Routes } from '@angular/router';

export const PROPRIETAIRE_ROUTES: Routes = [
  {
    path: 'demandes',
    loadComponent: () => import('./pages/approvals/approvals').then((m) => m.Approvals),
  },
  {
    path: 'gestion',
    loadComponent: () => import('./pages/management/management').then((m) => m.OwnerManagement),
  },
  {
    path: 'classes',
    loadComponent: () => import('./pages/class-roster/class-roster').then((m) => m.ClassRoster),
  },
  {
    path: 'eleves/:studentId',
    loadComponent: () => import('./pages/student-detail/student-detail').then((m) => m.StudentDetailPage),
  },
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/home/home').then((m) => m.ProprietaireHome),
  },
];
