import {test,expect} from '@playwright/test';
import {mockSchool} from './ui-fixtures';
test('teacher graphs use class and evaluation filters and keep empty data distinct',async({page},info)=>{
 await mockSchool(page,'enseignant');
 await page.route('**/api/me/teacher/dashboard**',route=>{
  const url=new URL(route.request().url());const classId=Number(url.searchParams.get('classId')??11);const evaluationId=Number(url.searchParams.get('evaluationId')??1);
  return route.fulfill({json:{classes:[{classId:11,className:'CP1',schoolId:1,schoolName:'Ecole',academicYearId:1,academicYearLabel:'2026-2027',currentYear:true},{classId:12,className:'CP2',schoolId:1,schoolName:'Ecole',academicYearId:1,academicYearLabel:'2026-2027',currentYear:true}],classId,yearLabel:'2026-2027',asOf:'2026-10-18',weeks:[{start:'2026-10-05',end:'2026-10-11',present:0,absent:0,late:0,excused:0},{start:'2026-10-12',end:'2026-10-18',present:30,absent:2,late:3,excused:1}],marks:{evaluationId:classId===12?null:evaluationId,evaluations:classId===12?[]:[{id:1,title:'Controle',subject:'Maths',date:'2026-10-17'},{id:2,title:'Evaluation vide',subject:'Maths',date:'2026-10-10'}],buckets:evaluationId===2?[]:[{label:'0 à < 5',count:1},{label:'5 à < 10',count:1},{label:'10 à < 12',count:2},{label:'12 à < 16',count:4},{label:'16 à 20',count:2}],count:classId===12||evaluationId===2?0:10,average:classId===12||evaluationId===2?null:12.5},homework:classId===12?{todo:0,submitted:0,corrected:0,overdue:0}:{todo:4,submitted:3,corrected:5,overdue:2}}});
 });
 await page.goto('/enseignant');
 const priority=page.locator('.dashboard-home__priority a');await expect(priority).toHaveCount(2);await expect(priority.nth(0)).toContainText('Mes classes');await expect(priority.nth(1)).toContainText('Présences et retards');
 // Menu ordering includes the renamed attendance module immediately after classes.
 const teaching=page.locator('.shell__nav-section').filter({has:page.locator('summary',{hasText:'Enseignement'})});
 const links=await teaching.locator('a').evaluateAll(elements=>elements.map(e=>e.getAttribute('href')));
 expect(links.indexOf('/enseignant/presences')).toBe(links.indexOf('/enseignant/classes')+1);
 const charts=page.locator('app-teacher-dashboard-charts');
 await expect(charts.getByRole('heading',{name:'Présences hebdomadaires',exact:true})).toBeVisible();
 await expect(charts.getByRole('heading',{name:'Répartition des notes',exact:true})).toBeVisible();
 await expect(charts.getByRole('heading',{name:'Suivi de mes devoirs',exact:true})).toBeVisible();
 await expect(charts.locator('.week').first()).toContainText('Sans saisie');await expect(charts.locator('.mark-summary')).toContainText('12,5');await expect(charts.locator('.homework-overview dd')).toHaveText(['4','3','5']);
 await charts.locator('summary').click();await expect(charts.locator('tbody tr')).toHaveCount(2);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await charts.screenshot({path:'test-results/teacher-dashboard-'+info.project.name+'.png'});
 await charts.getByRole('combobox',{name:'Évaluation du graphique'}).selectOption({label:'Maths · Evaluation vide · 10/10/2026'});
 await expect(charts.getByText('Aucune note valide saisie pour cette évaluation.',{exact:true})).toBeVisible();
 await charts.getByRole('combobox',{name:'Classe des graphiques'}).selectOption({label:'Ecole · CP2 · 2026-2027'});
 await expect(charts.getByText('Aucune évaluation pour vos matières dans cette classe.',{exact:true})).toBeVisible();
 await expect(charts.getByText('Aucun devoir à suivre pour vos publications et les élèves actuellement inscrits.',{exact:true})).toBeVisible();
});
