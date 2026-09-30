import { Routes } from '@angular/router';

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/home/home').then((m) => m.AdminHome),
  },
];
