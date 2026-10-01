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
    path: 'enseignants',
    loadComponent: () => import('./pages/teacher-roster/teacher-roster').then((m) => m.TeacherRoster),
  },
  {
    path: 'enseignants/:teacherId',
    loadComponent: () => import('./pages/teacher-detail/teacher-detail').then((m) => m.TeacherDetailPage),
  },
  {
    path: 'frais',
    loadComponent: () => import('./pages/finance/finance').then((m) => m.FinancePage),
  },
  {
    path: 'notes',
    loadComponent: () => import('./pages/grades/grades').then((m) => m.GradesPage),
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
