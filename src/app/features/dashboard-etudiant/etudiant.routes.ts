import { Routes } from '@angular/router';

export const ETUDIANT_ROUTES: Routes = [
  ...['presences','annonces','accompagnement','dossier','organisation'].map(studentModule=>({path:studentModule,data:{studentModule},loadComponent:()=>import('./pages/home/study-module').then(m=>m.StudentStudyModule)})),
  { path: 'suivi-devoirs', redirectTo: 'devoirs', pathMatch: 'full' },
  ...['devoirs', 'documents'].map(path => ({ path, data: { resourceKind: path === 'devoirs' ? 'HOMEWORK' : 'DOCUMENT' }, loadComponent: () => import('../../shared/self-space/learning-resources-page').then(m => m.LearningResourcesPage) })),

  { path: 'rendez-vous', loadComponent: () => import('../../shared/appointments/personal-appointments-page').then(m => m.PersonalAppointmentsPage) },
  ...["calendrier","discipline","demandes-administratives","bibliotheque"].map(lifeModule => ({
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
