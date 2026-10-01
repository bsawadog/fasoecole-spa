import { Routes } from '@angular/router';

export const ENSEIGNANT_ROUTES: Routes = [
  {
    path: 'classes',
    loadComponent: () => import('./pages/classes/classes').then((m) => m.EnseignantClasses),
  },
  {
    path: 'notes',
    loadComponent: () => import('./pages/notes/notes').then((m) => m.EnseignantNotes),
  },
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/home/home').then((m) => m.EnseignantHome),
  },
];