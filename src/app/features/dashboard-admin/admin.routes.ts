import { Routes } from '@angular/router';
import { PROPRIETAIRE_ROUTES } from '../dashboard-proprietaire/proprietaire.routes';

export const ADMIN_ROUTES: Routes = [
  ...PROPRIETAIRE_ROUTES.filter(route => route.path !== ''),
  {
    path: '',
    loadComponent: () => import('./pages/home/home').then((m) => m.AdminHome),
  },
];
