import { Routes } from '@angular/router';
import { PROPRIETAIRE_ROUTES } from '../dashboard-proprietaire/proprietaire.routes';
import { inject } from '@angular/core';
import { AuthService } from '../../core/auth';

export const ADMIN_ROUTES: Routes = [
  {
    path: '', pathMatch: 'full',
    canMatch: [() => inject(AuthService).user()?.rawRoles.includes('SUPER_ADMIN') === true],
    loadComponent: () => import('./pages/platform-schools/platform-schools').then(m => m.PlatformSchools),
  },
  ...PROPRIETAIRE_ROUTES.filter(route => route.path !== ''),
  {
    path: '',
    loadComponent: () => import('./pages/home/home').then((m) => m.AdminHome),
  },
];
