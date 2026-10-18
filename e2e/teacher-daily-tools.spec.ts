import { test, expect, Page } from '@playwright/test';
import { mockSchool } from './ui-fixtures';
const cls={classId:11,className:'CM1',schoolId:1,schoolName:'École',academicYearId:1,academicYearLabel:'2026-2027',currentYear:true,studentCount:1,subjects:[{subjectId:1,subjectName:'Maths',classSubjectTeacherId:1}]};
const student={studentId:21,fullName:'Awa Kabore',schoolId:1,schoolName:'École',classId:11,registrationNumber:'E21'};
async function teacherMocks(page:Page){
 await mockSchool(page,'enseignant');
 await page.route('**/api/me/teacher/classes',r=>r.fulfill({json:[cls]}));
 await page.route('**/api/me/teacher/classes/11/students',r=>r.fulfill({json:[student]}));
 await page.route('**/api/me/teacher/daily/today',r=>r.fulfill({json:{date:'2026-10-18',lessons:[],tasks:[{title:'Évaluations avec des notes à saisir',count:2,route:'notes'}],reminders:[]}}));
}
test('today links to the private notebook and notes survive a failed save',async({page})=>{
 await teacherMocks(page);let rows:any[]=[];let fail=true;let saves=0;
 await page.route('**/api/me/teacher/daily/notes**',r=>{
  if(r.request().method()==='GET')return r.fulfill({json:rows});
  saves++;const payload=r.request().postDataJSON();
  if(fail)return r.fulfill({status:503,json:{message:'Carnet indisponible'}});
  rows=[{id:1,...payload}];return r.fulfill({status:200});
 });
 await page.goto('/enseignant');
 await expect(page.getByRole('region',{name:'Aujourd’hui'})).toBeVisible({timeout:120000});
 await expect(page.getByRole('link',{name:'2 · Évaluations avec des notes à saisir'})).toBeVisible();
 await page.getByRole('link',{name:'Mon carnet personnel',exact:true}).click();
 const panel=page.getByRole('region',{name:'Carnet personnel',exact:true});
 await panel.getByRole('textbox',{name:'Titre du rappel'}).fill('Préparer la séance');
 await panel.getByRole('textbox',{name:'Note personnelle'}).fill('Préparation confidentielle');
 await panel.getByRole('button',{name:'Ajouter la note',exact:true}).click();
 await expect(panel.getByRole('alert')).toContainText('Carnet indisponible');
 await expect(panel.getByRole('textbox',{name:'Note personnelle'})).toHaveValue('Préparation confidentielle');
 fail=false;await panel.getByRole('button',{name:'Ajouter la note',exact:true}).click();
 await expect(panel.getByRole('heading',{name:'Préparer la séance',exact:true})).toBeVisible();
 await panel.getByRole('button',{name:'Terminer',exact:true}).click();
 await expect(panel.getByText('Terminé',{exact:true})).toBeVisible();expect(rows[0].done).toBe(true);expect(saves).toBe(3);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
test('course journal stores a lesson privately until explicit sharing',async({page})=>{
 await teacherMocks(page);let rows:any[]=[];
 await page.route('**/api/me/teacher/classes/11/lessons**',r=>{
  if(r.request().method()==='GET')return r.fulfill({json:rows});
  const payload=r.request().postDataJSON();expect(payload.subjectId).toBe(1);expect(payload.shared).toBe(false);
  rows=[{id:1,subjectName:'Maths',...payload}];return r.fulfill({status:200});
 });
 await page.goto('/enseignant/documents');
 await page.getByText('Cahier de textes — consigner une séance',{exact:true}).click();
 const panel=page.getByRole('region',{name:'Cahier de textes',exact:true});
 await panel.getByRole('textbox',{name:'Titre de la séance'}).fill('Addition des fractions');
 await panel.getByRole('textbox',{name:'Contenu réalisé'}).fill('Exemples et exercices en classe.');
 await panel.getByRole('textbox',{name:'Objectifs pédagogiques'}).fill('Additionner des fractions.');
 await panel.getByRole('button',{name:'Ajouter la séance',exact:true}).click();
 await expect(panel.getByRole('heading',{name:'Addition des fractions · Maths'})).toBeVisible();
 await expect(panel.getByText('Privée',{exact:false})).toBeVisible();
 await panel.getByRole('button',{name:'Modifier la séance'}).click();
 await panel.getByRole('checkbox',{name:'Partager cette séance avec les élèves et les parents'}).check();
 await expect(panel.getByRole('checkbox',{name:'Partager cette séance avec les élèves et les parents'})).toBeChecked();
});
test('support keeps internal actions separate from the explicitly shared message',async({page},info)=>{
 await teacherMocks(page);let saved:any=null;
 await page.route('**/api/me/teacher/classes/11/support**',r=>{
  if(r.request().method()==='GET')return r.fulfill({json:[{studentId:21,studentName:student.fullName,absences:3,overdue:1,average:null,id:saved?1:null,action:saved?.action??'',reviewOn:null,resolved:false,familyMessage:saved?.familyMessage??'',shared:saved?.shared??false}]});
  saved=r.request().postDataJSON();return r.fulfill({status:200});
 });
 await page.goto('/enseignant/classes');await page.getByText('Élèves à accompagner',{exact:true}).first().click();
 const panel=page.getByRole('region',{name:'Élèves à accompagner',exact:true});
 await panel.getByRole('button',{name:'Accompagner Awa Kabore',exact:true}).click();
 await panel.getByRole('textbox',{name:'Observations et actions privées'}).fill('Entretien confidentiel');
 await panel.getByRole('textbox',{name:'Message destiné à la famille'}).fill('Prévoir une révision accompagnée.');
 const share=panel.getByRole('checkbox',{name:'Partager ce message et le bilan',exact:false});await expect(share).not.toBeChecked();await share.check();
 await panel.getByRole('button',{name:'Enregistrer l’accompagnement',exact:true}).click();
 await expect(panel.getByText('Enregistrement effectué.',{exact:true})).toBeVisible();
 expect(saved).toMatchObject({action:'Entretien confidentiel',familyMessage:'Prévoir une révision accompagnée.',shared:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:info.outputPath('accompagnement.png'),fullPage:true});
});
test('availability sends dated request to administration and displays its actual message link',async({page})=>{
 await teacherMocks(page);let rows:any[]=[];
 await page.route('**/api/me/teacher/employee-files',r=>r.fulfill({json:[{teacherId:81,schoolName:'École'}]}));
 await page.route('**/api/me/teacher/daily/availability',r=>{
  if(r.request().method()==='GET')return r.fulfill({json:rows});
  const payload=r.request().postDataJSON();expect(payload).toMatchObject({teacherId:81,startsAt:'2026-11-02T09:00',endsAt:'2026-11-02T12:00',replacementRequested:true});
  rows=[{id:1,schoolName:'École',conversationId:91,...payload}];return r.fulfill({status:200});
 });
 await page.goto('/enseignant/emploi');await page.getByText('Disponibilités et absences',{exact:true}).first().click();
 const panel=page.getByRole('region',{name:'Disponibilités et absences',exact:true});
 const dates=panel.locator('app-date-field input');await dates.nth(0).fill('02/11/2026 09:00');await dates.nth(0).press('Tab');await dates.nth(1).fill('02/11/2026 12:00');await dates.nth(1).press('Tab');
 await panel.getByRole('textbox',{name:'Motif de la demande'}).fill('Rendez-vous administratif');await panel.getByRole('checkbox',{name:'Demander un remplacement',exact:true}).check();
 await panel.getByRole('button',{name:'Envoyer à l’administration',exact:true}).click();
 await expect(panel.getByRole('heading',{name:'École · Demande transmise',exact:true})).toBeVisible();
 await expect(panel.getByRole('link',{name:'Consulter la réponse dans Messages',exact:true})).toHaveAttribute('href',/\/enseignant\/messages/);
});
for(const role of ['parent','etudiant'] as const)test(role+' sees shared lessons and family messages with no editing controls',async({page})=>{
 await mockSchool(page,role);
 await page.route('**/api/me/students',r=>r.fulfill({json:[student]}));
 await page.route('**/api/me/students/21/learning',r=>r.fulfill({json:{lessons:[{id:1,subjectId:1,subjectName:'Maths',lessonOn:'2026-10-18',title:'Fractions',content:'Séance réalisée',objectives:'Additionner',nextWork:'Exercice libre',shared:true}],support:[{teacherName:'Professeur',message:'Révision accompagnée',reviewOn:null,resolved:false}]}}));
 await page.goto('/'+role+'/documents');
 await expect(page.getByRole('heading',{name:'Maths · Fractions',exact:true})).toBeVisible();await expect(page.getByText('Révision accompagnée',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Modifier la séance'})).toHaveCount(0);await expect(page.getByRole('textbox',{name:'Observations et actions privées'})).toHaveCount(0);
});
