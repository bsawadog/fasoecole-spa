import { Routes } from '@angular/router';

export const ETUDIANT_ROUTES: Routes = [
  { path: 'rendez-vous', loadComponent: () => import('../../shared/appointments/personal-appointments-page').then(m => m.PersonalAppointmentsPage) },
  ...["calendrier","discipline","demandes-administratives","bibliotheque","suivi-devoirs"].map(lifeModule => ({
    path: lifeModule, data: { lifeModule, lifeScope: 'students' },

    loadComponent: () => import('../../shared/school-life/school-life').then(m => m.SchoolLifePage),
  })),
  { path: 'messages', loadComponent: () => import('./pages/messages/messages').then(m => m.StudentMessages) },
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
