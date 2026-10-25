import { test, expect, Page } from '@playwright/test';
import { mockSchool } from './ui-fixtures';
const child=(id:number)=>({studentId:id,fullName:'Enfant '+(id===11?'A':'B'),registrationNumber:'E'+id,schoolId:1,schoolName:'École de test',classId:101,className:'CM1',academicYearLabel:'2026-2027',attendance:{absences:0,unjustifiedAbsences:0,lates:0},fees:{totalDue:10000,totalPaid:5000,balance:5000,overdueCount:1}});
const overview=(id:number)=>({child:child(id),asOf:'2026-10-18',firstDay:'2026-09-01',lastDay:'2026-10-18',attendance:{present:2,absent:0,late:1,excused:0},weeks:[{start:'2026-10-05',end:'2026-10-11',attendance:{present:0,absent:0,late:0,excused:0}},{start:'2026-10-12',end:'2026-10-18',attendance:{present:2,absent:0,late:1,excused:0}}],periods:[{id:1,name:'Période publiée',published:true,average:0},{id:2,name:'Période en cours',published:false,average:null}],subjectPeriod:'Période publiée',subjects:[{name:'Matière A',average:0},{name:'Matière B',average:15.5},{name:'Matière sans note',average:null}],homework:{todo:1,submitted:1,corrected:2,overdue:1},dueHomework:[{id:1,title:'Exercices à préparer',dueOn:'2026-10-17',overdue:true}],evaluations:[{title:'Contrôle à préparer',subject:'Matière A',date:'2026-10-20'}],announcements:[{id:2,title:'Information aux familles',createdAt:'2026-10-18T10:00:00'}],events:[{title:'Réunion de classe',startsOn:'2026-10-22',endsOn:'2026-10-22'}],sharedSupport:1});
async function setup(page:Page){
 await mockSchool(page,'parent');
 await page.route('**/api/me/students',r=>r.fulfill({json:[child(11),child(12)]}));
 await page.route('**/api/conversations/unread-count',r=>r.fulfill({json:2}));
 await page.route('**/api/me/parent/dashboard?**',r=>r.fulfill({json:overview(Number(new URL(r.request().url()).searchParams.get('studentId')))}));
}
test('parent home shows reliable graphs, French money and every follow-up module',async({page},info)=>{
 await setup(page);await page.goto('/parent?studentId=12');
 const home=page.locator('.parent-home');
 await expect(home.getByRole('combobox',{name:'Enfant suivi',exact:true})).toContainText('Enfant B',{timeout:120000});
 await expect(home.getByRole('heading',{name:'Résultats par période',exact:true})).toBeVisible();
 await expect(home.getByText('Non publié',{exact:true})).toBeVisible();
 await expect(home.getByText('Sans note',{exact:true})).toBeVisible();
 await expect(home.getByText('15,5 / 20',{exact:true})).toBeVisible();
 await expect(home.getByText('Sans saisie',{exact:true})).toBeVisible();
 const money=home.getByRole('link',{name:/Frais scolaires et reçus/});await expect(money).toContainText(/5[\s\u202f\u00a0]000 F/);await expect(money).not.toContainText('5,000');
 await expect(home.getByRole('link',{name:/2 message\(s\) non lu/})).toBeVisible();
 for(const route of ['notes','absences','devoirs','documents','accompagnement','emploi','calendrier','discipline','bibliotheque','annonces','demandes-administratives','frais'])await expect(home.locator('a[href="/parent/'+route+'?studentId=12"]').first()).toBeVisible();
 await expect(home.locator('a[href="/parent/enfants/12?studentId=12"]')).toBeVisible();
 await expect(home.locator('a[href="/parent/messages"]')).toBeVisible();await expect(home.locator('a[href="/parent/rendez-vous"]')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 for(const theme of ['white','night-violet','night-green','classic-blue','light-gray','glossy-black','blue-black']){
  await page.evaluate(theme=>document.body.dataset['appTheme']=theme,theme);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 }
 await page.screenshot({path:info.outputPath('parent-home.png'),fullPage:true});
});
test('changing child ignores a late response and accompaniment shows only shared messages',async({page})=>{
 await setup(page);let release:()=>void=()=>{};let started:()=>void=()=>{};const requestStarted=new Promise<void>(resolve=>started=resolve);const hold=new Promise<void>(resolve=>release=resolve);
 await page.route('**/api/me/parent/dashboard?**',async r=>{const id=Number(new URL(r.request().url()).searchParams.get('studentId'));if(id===11){started();await hold;}const data=overview(id);if(id===12)data.homework.overdue=0;await r.fulfill({json:data});});
 await page.goto('/parent');await requestStarted;
 const combo=page.getByRole('combobox',{name:'Enfant suivi',exact:true});await combo.click();await page.getByRole('option',{name:'Enfant B · École de test',exact:true}).click();
 const overdue=page.getByRole('region',{name:'Points à suivre'}).getByRole('link',{name:/Devoirs à vérifier/});await expect(overdue).toContainText('0');release();await expect(combo).toContainText('Enfant B');await expect(overdue).toContainText('0');
 await page.route('**/api/me/students/12/learning',r=>r.fulfill({json:{lessons:[{id:1,title:'Séance partagée',subjectName:'Matière A',lessonOn:'2026-10-18',content:'Cours',objectives:'',nextWork:'',shared:true}],support:[{teacherName:'Professeur de test',message:'Prévoir une révision accompagnée.',reviewOn:'2026-10-25',resolved:false}]}}));
 await page.locator('.parent-home').getByRole('link',{name:'Accompagnement Conseils et bilans partagés par les professeurs.',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Accompagnement de mon enfant',exact:true})).toBeVisible();await expect(page.getByText('Prévoir une révision accompagnée.',{exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:/Séance partagée/})).toHaveCount(0);await expect(page.getByRole('textbox')).toHaveCount(0);
});
test('load errors do not become zero statistics and a retry recovers',async({page})=>{
 await setup(page);let fail=true;
 await page.route('**/api/me/parent/dashboard?**',r=>fail?r.fulfill({status:503,json:{message:'Suivi temporairement indisponible'}}):r.fulfill({json:overview(11)}));
 await page.goto('/parent');await expect(page.getByRole('alert')).toContainText('Suivi temporairement indisponible');await expect(page.getByRole('region',{name:'Points à suivre'})).toHaveCount(0);
 fail=false;await page.getByRole('button',{name:'Actualiser le suivi',exact:true}).click();await expect(page.getByRole('region',{name:'Points à suivre'})).toBeVisible();
});
test('empty parent space explains how to attach a child',async({page})=>{
 await mockSchool(page,'parent');await page.route('**/api/me/students',r=>r.fulfill({json:[]}));await page.goto('/parent');
 await expect(page.getByRole('heading',{name:'Commençons par le rattachement de vos enfants'})).toBeVisible();await expect(page.getByRole('link',{name:'Demander un accès à un établissement',exact:true})).toHaveAttribute('href','/profil#school-access');await expect(page.getByRole('region',{name:'Graphiques du suivi scolaire'})).toHaveCount(0);
});
