import type { OwnerModule } from '../../core/auth/auth.service';
import type { Role } from '../../core/models';

export interface HelpQuestion {
  id:string;category:string;question:string;steps:string[];note?:string;route:string;linkLabel:string;
}
export interface HelpModule {
  key:string;title:string;route:string;primary:string;topics:string[];role:Role|'common';access?:OwnerModule|null;
}
type OwnerGuide=[string,string,string,string[],OwnerModule|null];
const ownerGuides:OwnerGuide[]=[
  ['', 'Tableau de bord','dashboard',['dashboard','year','attendance','profiles'],'DASHBOARD'],
  ['gestion','Configuration de l’école','setup',['setup','classes'],'MANAGEMENT'],
  ['classes','Élèves par classe','roster',['roster','parent','import','import-error'],'STUDENTS'],
  ['eleves','Élèves et dossiers','student-directory',['student-directory','student-file'],'STUDENTS'],
  ['parents','Parents','parent-directory',['parent-directory','parent'],'STUDENTS'],
  ['enseignants','Enseignants par classe','existing-teacher',['existing-teacher','teacher-file','invitation'],'TEACHERS'],
  ['employes','Créer un employé','employee',['employee','teacher','teacher-pay','shared-account'],null],
  ['tous-les-employes','Tous les employés','employee-directory',['employee-directory','shared-account'],null],
  ['personnel','Personnel et accès','permissions',['permissions'],null],
  ['inscriptions','Inscriptions','student',['student'], 'ENROLLMENT'],
  ['cloture','Clôturer année','closure',['closure'],null],
  ['demandes','Demandes de compte','approval',['approval'],null],
  ['creer-ecole','Créer une école','request',['request','pending'],null],
  ['notes','Notes et bulletins','grades',['grades'],'GRADES'],
  ['salaires','Salaires','payroll',['payroll','payroll-taxes','payroll-documents'],'PAYROLL'],
  ['impots-taxes','Impôts et taxes','tax-obligations',['tax-obligations'],'TAXES'],
  ['frais','Recouvrement','fees',['fees'],'FINANCE'],
  ['depenses','Dépenses et budget','expenses',['expenses'],'EXPENSES'],
  ['caisse','Brouillard de caisse','cash-book',['cash-book'],'CASH_BOOK'],
  ['etats-financiers','États financiers','financial-tools',['financial-tools'],'FINANCIAL_STATEMENTS'],
  ['patrimoine','Patrimoine et mobilier','assets',['assets'],'ASSETS'],
  ['stocks','Stocks et fournitures','stock',['stock'],'INVENTORY'],
  ['calendrier','Calendrier scolaire','calendar',['calendar'],'CALENDAR'],
  ['discipline','Discipline et vie scolaire','discipline',['discipline'],'DISCIPLINE'],
  ['bibliotheque','Bibliothèque','library',['library'],'LIBRARY'],
  ['suivi-devoirs','Suivi des devoirs','homework',['homework'],'HOMEWORK'],
  ['portail-parents','Portail parents','parent-portal',['parent-portal'],'PARENT_PORTAL'],
  ['rendez-vous','Rendez-vous','appointments',['appointments'],'PARENT_PORTAL'],
  ['messages','Messages','message',['message'],'MESSAGES'],
  ['demandes-administratives','Demandes administratives','administrative-requests',['administrative-requests'],'REQUESTS'],
  ['export','Exporter mes données','export',['export'],null],
  ['incidents','Assistance et incidents','support',['support'],null],
];
const personalRoutes:Partial<Record<Role,[string,string][]>>={
  enseignant:[['','Accueil enseignant'],['classes','Mes classes'],['notes','Notes'],['emploi','Mon emploi du temps'],['presences','Présences et retards'],['signalements','Signalements des parents'],['devoirs','Devoirs'],['suivi-devoirs','Suivi des devoirs'],['documents','Documents de classe'],['annonces','Annonces de classe'],['rendez-vous','Rendez-vous parents'],['messages','Messages'],['calendrier','Calendrier scolaire'],['discipline','Discipline et vie scolaire'],['bibliotheque','Bibliothèque']],
  parent:[['','Accueil parent'],['enfants','Mes enfants'],['notes','Notes et bulletins'],['absences','Présences et retards'],['frais','Recouvrement'],['emploi','Emploi du temps'],['devoirs','Devoirs et évaluations'],['suivi-devoirs','Suivi des devoirs'],['annonces','Annonces de l’établissement'],['documents','Documents'],['rendez-vous','Rendez-vous'],['messages','Messages'],['calendrier','Calendrier scolaire'],['discipline','Discipline et vie scolaire'],['bibliotheque','Bibliothèque'],['demandes-administratives','Demandes administratives']],
  etudiant:[['','Accueil élève'],['notes','Notes et bulletins'],['emploi-du-temps','Emploi du temps'],['suivi-devoirs','Suivi des devoirs'],['messages','Messages'],['rendez-vous','Rendez-vous'],['calendrier','Calendrier scolaire'],['discipline','Discipline et vie scolaire'],['bibliotheque','Bibliothèque'],['demandes-administratives','Demandes administratives']],
  admin:[['','Établissements de la plateforme'],['mes-rendez-vous','Mes rendez-vous']],
};
const ownerModules=(prefix:'proprietaire'|'admin'):HelpModule[]=>ownerGuides.map(([slug,title,primary,topics,access])=>({key:`${prefix}:${slug||'home'}`,title,primary,topics,access,role:prefix,route:`/${prefix}${slug?'/'+slug:''}`}));
export const HELP_MODULES:HelpModule[]=[
  ...ownerModules('proprietaire'),...ownerModules('admin').filter(m=>m.route!=='/admin'),
  ...Object.entries(personalRoutes).flatMap(([role,routes])=>routes.map(([slug,title])=>({key:`${role}:${slug||'home'}`,title,route:`/${role}${slug?'/'+slug:''}`,primary:`${role}-${slug||'home'}`,topics:[`${role}-${slug||'home'}`],role:role as Role}))),
  {key:'common:profile',title:'Mon profil',route:'/profil',primary:'account-profile',topics:['account-profile'],role:'common'},
];
export function helpModuleForRoute(url:string):HelpModule|undefined {
  const path=url.split(/[?#]/)[0].replace(/\/$/,'')||'/';
  if(path==='/aide'||/\/(aide)$/.test(path))return undefined;
  const module=HELP_MODULES.filter(m=>path===m.route||m.route.split('/').length>2&&path.startsWith(m.route+'/'))
    .sort((a,b)=>b.route.length-a.route.length)[0];
  if(module && /^\/(proprietaire|admin)\/(enseignants|eleves)\/[^/]+$/.test(path))
    return {...module,primary:path.includes('/enseignants/')?'teacher-file':'student-file'};
  return module;
}
