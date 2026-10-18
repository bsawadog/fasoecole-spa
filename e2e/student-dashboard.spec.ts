import { test, expect, Page } from '@playwright/test';
import { mockSchool } from './ui-fixtures';
const child=(id:number)=>({studentId:id,fullName:'Enfant '+(id===11?'A':'B'),registrationNumber:'E'+id,schoolId:1,schoolName:'École de test',classId:101,className:'CM1',academicYearLabel:'2026-2027',attendance:{absences:0,unjustifiedAbsences:0,lates:0},fees:{totalDue:10000,totalPaid:5000,balance:5000,overdueCount:1}});
const overview=(id:number)=>({child:child(id),asOf:'2026-10-18',firstDay:'2026-09-01',lastDay:'2026-10-18',attendance:{present:2,absent:0,late:1,excused:0},weeks:[{start:'2026-10-05',end:'2026-10-11',attendance:{present:0,absent:0,late:0,excused:0}},{start:'2026-10-12',end:'2026-10-18',attendance:{present:2,absent:0,late:1,excused:0}}],periods:[{id:1,name:'Période publiée',published:true,average:0},{id:2,name:'Période en cours',published:false,average:null}],subjectPeriod:'Période publiée',subjects:[{name:'Matière A',average:0},{name:'Matière B',average:15.5},{name:'Matière sans note',average:null}],homework:{todo:1,submitted:1,corrected:2,overdue:1},dueHomework:[{id:1,title:'Exercices à préparer',dueOn:'2026-10-17',overdue:true}],evaluations:[{title:'Contrôle à préparer',subject:'Matière A',date:'2026-10-20'}],announcements:[{id:2,title:'Information aux familles',createdAt:'2026-10-18T10:00:00'}],events:[{title:'Réunion de classe',startsOn:'2026-10-22',endsOn:'2026-10-22'}],sharedSupport:1});

async function setup(page:Page){
 await mockSchool(page,'etudiant');
 await page.route('**/api/me/student/profiles',r=>r.fulfill({json:[child(11)]}));
 await page.route('**/api/me/student/dashboard?**',r=>r.fulfill({json:{...overview(11),profile:child(11),courses:[],tasks:[],pendingTasks:0,overdueTasks:0}}));
}
test('student home exposes study modules and published graphs on desktop and mobile',async({page},info)=>{
 await setup(page);await page.goto('/etudiant');const home=page.locator('.student-home');
 await expect(home.getByRole('heading',{name:'Résultats par période',exact:true})).toBeVisible({timeout:120000});
 await expect(home.getByText('Non publié',{exact:true})).toBeVisible();await expect(home.getByText('Sans saisie',{exact:true})).toBeVisible();
 await expect(home.getByText('15,5 / 20',{exact:true})).toBeVisible();
 for(const route of ['notes','devoirs','documents','organisation','accompagnement','presences','emploi-du-temps','calendrier','discipline','bibliotheque','annonces','demandes-administratives','dossier'])await expect(home.locator('a[href="/etudiant/'+route+'?studentId=11"]').first()).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:info.outputPath('student-home.png'),fullPage:true});
});
test('student organisation displays private reminders and preserves input after a failed save',async({page})=>{
 await setup(page);await page.route('**/api/me/student/profiles/11/tasks',r=>r.request().method()==='GET'?r.fulfill({json:[]}):r.fulfill({status:503,json:{message:'Réessayez le rappel'}}));
 await page.goto('/etudiant/organisation?studentId=11');
 await expect(page.getByRole('heading',{name:'Mon organisation',exact:true})).toBeVisible({timeout:120000});
 const title=page.getByLabel('Titre de mon rappel',{exact:true});await title.fill('Réviser le chapitre');
 await page.getByRole('button',{name:'Ajouter mon rappel',exact:true}).click();
 await expect(page.getByText('Réessayez le rappel',{exact:true})).toBeVisible();await expect(title).toHaveValue('Réviser le chapitre');
});
