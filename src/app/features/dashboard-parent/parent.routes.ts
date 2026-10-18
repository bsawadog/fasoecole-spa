import { Routes } from '@angular/router';

export const PARENT_ROUTES: Routes = [
  { path: 'suivi-devoirs', redirectTo: 'devoirs', pathMatch: 'full' },
  ...['devoirs', 'documents'].map(path => ({ path, data: { resourceKind: path === 'devoirs' ? 'HOMEWORK' : 'DOCUMENT' }, loadComponent: () => import('../../shared/self-space/learning-resources-page').then(m => m.LearningResourcesPage) })),

  ...["calendrier","discipline","demandes-administratives","bibliotheque"].map(lifeModule => ({
    path: lifeModule, data: { lifeModule, lifeScope: 'students' },

    loadComponent: () => import('../../shared/school-life/school-life').then(m => m.SchoolLifePage),
  })),
  ...['notes', 'absences', 'frais', 'emploi', 'annonces', 'rendez-vous'].map(module => ({
    path: module,
    data: { module },
    loadComponent: () => import('./pages/modules/modules').then(m => m.ParentModule),
  })),
  {
    path: 'enfants',
    loadComponent: () => import('./pages/children/children').then((m) => m.ParentChildren),
  },
  {
    path: 'enfants/:studentId',
    loadComponent: () => import('./pages/child-detail/child-detail').then((m) => m.ParentChildDetail),
  },
  {
    path: 'messages',
    loadComponent: () => import('./pages/messages/messages').then((m) => m.ParentMessages),
  },
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/home/home').then((m) => m.ParentHome),
  },
];
