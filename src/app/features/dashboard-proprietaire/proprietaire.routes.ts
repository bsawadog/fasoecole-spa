import { Routes } from '@angular/router';
import { ownerModuleGuard, OWNER_LIFE_MODULES } from '../../core/auth';

export const PROPRIETAIRE_ROUTES: Routes = [
  { path: 'impots-taxes', canActivate: [ownerModuleGuard('TAXES')],
    loadComponent: () => import('./pages/taxes/taxes').then(m => m.SchoolTaxesPage) },
  { path: 'salaires', canActivate: [ownerModuleGuard('PAYROLL')],
    loadComponent: () => import('./pages/payroll/payroll').then(m => m.PayrollPage) },
  { path: 'patrimoine', data: { resourceKind: 'assets' }, canActivate: [ownerModuleGuard('ASSETS')],
    loadComponent: () => import('./pages/resources/resources').then(m => m.SchoolResourcesPage) },
  { path: 'stocks', data: { resourceKind: 'stock' }, canActivate: [ownerModuleGuard('INVENTORY')],
    loadComponent: () => import('./pages/resources/resources').then(m => m.SchoolResourcesPage) },
  { path: 'caisse', canActivate: [ownerModuleGuard('CASH_BOOK')],
    loadComponent: () => import('./pages/cash-book/cash-book').then(m => m.CashBookPage) },
  { path: 'etats-financiers', canActivate: [ownerModuleGuard('FINANCIAL_STATEMENTS')],
    loadComponent: () => import('./pages/financial-statements/financial-statements').then(m => m.FinancialStatements) },
  { path: 'tous-les-employes', canActivate: [ownerModuleGuard(null)],
    loadComponent: () => import('./pages/employee-directory/employee-directory').then(m => m.EmployeeDirectory) },
  {
    path: 'rendez-vous', canActivate: [ownerModuleGuard('PARENT_PORTAL')],
    loadComponent: () => import('./pages/appointments/appointments').then(m => m.OwnerAppointmentsPage),
  },
  ...['eleves', 'parents'].map(path => ({
    path, canActivate: [ownerModuleGuard('STUDENTS')],
    loadComponent: () => import('./pages/people-directory/people-directory').then(m => m.PeopleDirectory),
  })),
  ...Object.entries(OWNER_LIFE_MODULES).map(([lifeModule, module]) => ({
    path: lifeModule, data: { lifeModule, lifeScope: 'schools' },
    canActivate: [ownerModuleGuard(module)],
    loadComponent: () => import('../../shared/school-life/school-life').then(m => m.SchoolLifePage),
  })),
 { path: 'incidents', canActivate: [ownerModuleGuard(null)], loadComponent: () => import('../../shared/support-incidents').then(m => m.SupportIncidents) },
  { path: 'aide',
    loadComponent: () => import('./pages/help/help').then(m => m.OwnerHelp) },
  { path: 'export', canActivate: [ownerModuleGuard(null)],
    loadComponent: () => import('./pages/data-export/data-export').then(m => m.SchoolDataExport) },
  { path: 'cloture', data: { closure: true }, canActivate: [ownerModuleGuard(null)],
    loadComponent: () => import('./pages/enrollment/enrollment').then(m => m.EnrollmentPage) },
  { path: 'employes', canActivate: [ownerModuleGuard(null)],
    loadComponent: () => import('./pages/employees/employees').then(m => m.EmployeesPage) },
  {
    path: 'portail-parents',
    canActivate: [ownerModuleGuard('PARENT_PORTAL')],
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
    canActivate: [ownerModuleGuard('MESSAGES')],
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
