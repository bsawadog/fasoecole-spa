import { Routes } from '@angular/router';

export const ENSEIGNANT_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/home/home').then((m) => m.EnseignantHome),
  },
];
