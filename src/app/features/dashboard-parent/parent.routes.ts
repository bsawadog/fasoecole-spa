import { Routes } from '@angular/router';

export const PARENT_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/home/home').then((m) => m.ParentHome),
  },
];
