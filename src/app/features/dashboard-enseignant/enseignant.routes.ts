import { Routes } from '@angular/router';

export const ENSEIGNANT_ROUTES: Routes = [
  ...["calendrier","discipline","bibliotheque","suivi-devoirs"].map(lifeModule => ({
    path: lifeModule, data: { lifeModule, lifeScope: 'classes' },

    loadComponent: () => import('../../shared/school-life/school-life').then(m => m.SchoolLifePage),
  })),
  ...['emploi', 'presences', 'signalements', 'devoirs', 'documents', 'annonces', 'rendez-vous'].map(module => ({
    path: module,
    data: { module },
    loadComponent: () => import('./pages/modules/modules').then(m => m.TeacherModule),
  })),
  {
    path: 'messages',
    loadComponent: () => import('./pages/messages/messages').then((m) => m.TeacherMessages),
  },
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
