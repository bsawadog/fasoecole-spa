import {test,expect} from '@playwright/test';
import {mockSchool} from './ui-fixtures';
test('class timetable supports week selection, conflict warnings and printing',async({page},info)=>{
 await mockSchool(page);
 await page.route('**/api/owner/class-timetables/schools/1**',route=>{
  const url=new URL(route.request().url());const classId=Number(url.searchParams.get('classId')??11);
  return route.fulfill({json:{schoolName:'École La Réussite',yearLabel:'2026-2027',yearStart:'2026-10-01',yearEnd:'2027-07-30',classId,className:classId===11?'CP1-A':'CP2',weekStart:url.searchParams.get('date')==='2026-10-21'?'2026-10-19':'2026-10-12',classes:[{id:11,name:'CP1-A'},{id:12,name:'CP2'}],lessons:classId===12?[]:[
   {id:1,dayOfWeek:1,date:'2026-10-12',startTime:'08:00:00',endTime:'10:00:00',teacherName:'Awa Traoré',subjects:'Mathématiques'},
   {id:2,dayOfWeek:1,date:'2026-10-12',startTime:'09:00:00',endTime:'11:00:00',teacherName:'Issa Diallo',subjects:'Français'},
   {id:3,dayOfWeek:3,date:'2026-10-14',startTime:'10:00:00',endTime:'11:00:00',teacherName:'Awa Traoré',subjects:'Mathématiques'}
  ]}});
 });
 await page.goto('/proprietaire/emplois-du-temps');
 await expect(page.getByRole('heading',{name:'Emplois du temps des classes',exact:true})).toBeVisible();
 await expect(page.locator('.lesson')).toHaveCount(3);
 const colors=await page.locator('.lesson').evaluateAll(elements=>elements.map(el=>getComputedStyle(el).backgroundColor));
 expect(colors[0]).toBe(colors[2]);expect(colors[0]).not.toBe(colors[1]);
 await expect(page.getByLabel('Couleurs des matières')).toBeVisible();
 const checkContrast=async()=>{
  const results=await page.locator('.lesson :is(strong,p,span,small), .subject-legend span').evaluateAll(elements=>elements.map(element=>{
   const card=element.closest('.lesson')??element;
   const luminance=(color:string)=>{const values=(color.match(/[\d.]+/g)??[]).slice(0,3).map(Number).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;});return values.reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);};
   const a=luminance(getComputedStyle(element).color),b=luminance(getComputedStyle(card).backgroundColor);
   return {text:element.textContent,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
  }));
  for(const result of results)expect(result.ratio,result.text??'Text contrast').toBeGreaterThanOrEqual(4.5);
 };
 for(const theme of ['night-violet','night-green','blue-black','classic-blue','light-gray','glossy-black','white']){
  await page.evaluate(theme=>document.body.dataset['appTheme']=theme,theme);
  await checkContrast();
 }
 // The neutral fallback must also stay readable if no subject color is available.
 const previous=await page.locator('.lesson').first().evaluate(element=>{const node=element as HTMLElement;const previous=node.style.getPropertyValue('--lesson-bg');node.style.removeProperty('--lesson-bg');return previous;});
 await checkContrast();
 await page.locator('.lesson').first().evaluate((element,previous)=>(element as HTMLElement).style.setProperty('--lesson-bg',previous),previous);
 await page.evaluate(()=>document.body.dataset['appTheme']='blue-black');
 await page.locator('.sheet').screenshot({path:'test-results/class-timetable-readable-'+info.project.name+'.png'});

 await expect(page.locator('.lesson-conflict')).toHaveCount(2);
 await expect(page.locator('.conflict-warning')).toContainText('2 créneaux');
 await expect(page.getByRole('button',{name:'Imprimer / PDF'})).toBeEnabled();
 await page.evaluate(()=>{(window as any).printed=false;window.print=()=>{(window as any).printed=true;};});
 await page.getByRole('button',{name:'Imprimer / PDF'}).click();
 expect(await page.evaluate(()=>(window as any).printed)).toBe(true);
 await page.getByLabel('Date dans la semaine').fill('2026-10-21');
 await page.getByLabel('Date dans la semaine').dispatchEvent('change');
 await expect(page.locator('.lesson')).toHaveCount(3);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
 await expect(page.getByText('Semaine du 19/10/2026')).toBeVisible();
 await page.emulateMedia({media:'print'});
 await expect(page.locator('.filters')).toBeHidden();
 await expect(page.locator('.sheet')).toBeVisible();
 await expect(page.locator('.grid-wrap')).toHaveCSS('overflow','visible');
 await checkContrast();
 if(info.project.name==='desktop')await page.locator('.sheet').screenshot({path:'test-results/class-timetable-print.png'});
 if(info.project.name==='desktop')await page.pdf({path:'test-results/class-timetable.pdf',format:'A4',landscape:true,printBackground:false});
 await page.emulateMedia({media:'screen'});
 await page.getByRole('combobox',{name:'Classe',exact:true}).selectOption({label:'CP2'});
 await expect(page.getByText('Aucun créneau enseignant pour cette classe durant cette semaine.')).toBeVisible();
 await expect(page.getByRole('button',{name:'Imprimer / PDF'})).toBeDisabled();
});
