import { Routes } from '@angular/router';

export const ETUDIANT_ROUTES: Routes = [
  {
    path: 'notes',
    loadComponent: () => import('./pages/notes/notes').then((m) => m.EtudiantNotes),
  },
  {
    path: 'emploi-du-temps',
    loadComponent: () => import('./pages/schedule/schedule').then((m) => m.EtudiantSchedule),
  },
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/home/home').then((m) => m.EtudiantHome),
  },
];