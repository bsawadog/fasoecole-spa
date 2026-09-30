import { Routes } from '@angular/router';

export const ETUDIANT_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/home/home').then((m) => m.EtudiantHome),
  },
];
