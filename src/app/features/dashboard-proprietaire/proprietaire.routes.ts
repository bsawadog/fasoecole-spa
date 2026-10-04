import { Routes } from '@angular/router';
import { ownerModuleGuard } from '../../core/auth';

export const PROPRIETAIRE_ROUTES: Routes = [
 { path: 'incidents', canActivate: [ownerModuleGuard(null)], loadComponent: () => import('../../shared/support-incidents').then(m => m.SupportIncidents) },
  { path: 'aide', canActivate: [ownerModuleGuard(null)],
    loadComponent: () => import('./pages/help/help').then(m => m.OwnerHelp) },
  { path: 'export', canActivate: [ownerModuleGuard(null)],
    loadComponent: () => import('./pages/data-export/data-export').then(m => m.SchoolDataExport) },
  { path: 'cloture', data: { closure: true }, canActivate: [ownerModuleGuard(null)],
    loadComponent: () => import('./pages/enrollment/enrollment').then(m => m.EnrollmentPage) },
  { path: 'employes', canActivate: [ownerModuleGuard(null)],
    loadComponent: () => import('./pages/employees/employees').then(m => m.EmployeesPage) },
  {
    path: 'portail-parents',
    canActivate: [ownerModuleGuard('STUDENTS')],
    loadComponent: () => import('./pages/parent-portal/parent-portal').then(m => m.OwnerParentPortal),
  },
  {
    path: 'creer-ecole',
    canActivate: [ownerModuleGuard(null)],
    loadComponent: () => import('./pages/school-setup/school-setup').then((m) => m.SchoolSetup),
  },
  {
    path: 'demandes',
    canActivate: [ownerModuleGuard(null)],
    loadComponent: () => import('./pages/approvals/approvals').then((m) => m.Approvals),
  },
  {
    path: 'messages',
    canActivate: [ownerModuleGuard('STUDENTS')],
    loadComponent: () => import('./pages/messages/messages').then((m) => m.OwnerMessages),
  },
  {
    path: 'personnel',
    canActivate: [ownerModuleGuard(null)],
    loadComponent: () => import('./pages/staff/staff').then((m) => m.StaffPage),
  },
  {
    path: 'gestion',
    canActivate: [ownerModuleGuard('MANAGEMENT')],
    loadComponent: () => import('./pages/management/management').then((m) => m.OwnerManagement),
  },
  {
    path: 'classes',
    canActivate: [ownerModuleGuard('STUDENTS')],
    loadComponent: () => import('./pages/class-roster/class-roster').then((m) => m.ClassRoster),
  },
  {
    path: 'enseignants',
    canActivate: [ownerModuleGuard('TEACHERS')],
    loadComponent: () => import('./pages/teacher-roster/teacher-roster').then((m) => m.TeacherRoster),
  },
  {
    path: 'enseignants/:teacherId',
    canActivate: [ownerModuleGuard('TEACHERS')],
    loadComponent: () => import('./pages/teacher-detail/teacher-detail').then((m) => m.TeacherDetailPage),
  },
  {
    path: 'frais',
    canActivate: [ownerModuleGuard('FINANCE')],
    loadComponent: () => import('./pages/finance/finance').then((m) => m.FinancePage),
  },
  {
    path: 'depenses',
    canActivate: [ownerModuleGuard('EXPENSES')],
    loadComponent: () => import('./pages/expenses/expenses').then((m) => m.ExpensesPage),
  },
  {
    path: 'notes',
    canActivate: [ownerModuleGuard('GRADES')],
    loadComponent: () => import('./pages/grades/grades').then((m) => m.GradesPage),
  },
  {
    path: 'inscriptions',
    canActivate: [ownerModuleGuard('ENROLLMENT')],
    loadComponent: () => import('./pages/enrollment/enrollment').then((m) => m.EnrollmentPage),
  },
  {
    path: 'eleves/:studentId',
    canActivate: [ownerModuleGuard('STUDENTS')],
    loadComponent: () => import('./pages/student-detail/student-detail').then((m) => m.StudentDetailPage),
  },
  {
    path: '',
    pathMatch: 'full',
    canActivate: [ownerModuleGuard('DASHBOARD')],
    loadComponent: () => import('./pages/home/home').then((m) => m.ProprietaireHome),
  },
];
