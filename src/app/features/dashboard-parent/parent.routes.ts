import { Routes } from '@angular/router';

export const PARENT_ROUTES: Routes = [
  {
    path: 'enfants',
    loadComponent: () => import('./pages/children/children').then((m) => m.ParentChildren),
  },
  {
    path: 'enfants/:studentId',
    loadComponent: () => import('./pages/child-detail/child-detail').then((m) => m.ParentChildDetail),
  },
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/home/home').then((m) => m.ParentHome),
  },
];