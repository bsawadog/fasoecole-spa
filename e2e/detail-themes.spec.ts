import {test,expect} from '@playwright/test';
import {mockSchool} from './ui-fixtures';

test('student and teacher sheets follow all six themes including nested forms',async({page},testInfo)=>{
  await mockSchool(page);
  const student={studentId:1,userId:20,schoolId:1,schoolName:'École La Réussite',firstName:'Awa',lastName:'Kaboré',
    email:'awa@example.test',phone:'70000000',registrationNumber:'MAT-001',birthDate:'2018-05-10',gender:'F',className:'CP1-A',
    parents:[{parentId:8,firstName:'Issa',lastName:'Kaboré',email:'parent@example.test',phone:'71000000',relationship:'Père'}],
    grades:[{id:1,subjectName:'Français',teacherName:'Awa Traoré',term:'Trimestre 1',type:'Devoir',value:15,maxValue:20,gradeDate:'2026-10-01'}],overallAverage:15,
    attendanceSummary:{totalRecords:10,presentCount:8,absentCount:1,lateCount:1,justifiedAbsences:1,unjustifiedAbsences:0,attendanceRate:80},
    recentAttendance:[{id:1,attendanceDate:'2026-10-01',status:'PRESENT',justification:null}],invoices:[],billingSummary:{totalDue:50000,totalPaid:0,totalBalance:50000}};
  const teacher={teacher:{id:3,schoolId:1,firstName:'Awa',lastName:'Traoré',email:'teacher@example.test',phone:null,specialty:'Français',subjects:['Français'],activeInClass:true,classCount:1},
    rateType:'HOURLY',rate:1000,schedule:[],month:{plannedHours:10,workedHours:8,absenceHours:2,extraHours:0,amountDue:8000,paid:3000,remaining:5000,perClass:[],sessions:[],extras:[],payments:[]}};
  await page.route('**/api/students/1/detail',route=>route.fulfill({json:student}));
  await page.route(/\/api\/teacher-work\/teachers\/3(?:\?|$)/,route=>route.fulfill({json:teacher}));
  const colors=async(selector:string)=>page.locator(selector).first().evaluate(node=>({background:getComputedStyle(node).backgroundColor,color:getComputedStyle(node).color}));
  const themes=['night-violet','night-green','blue-black','light-gray','glossy-black','white'];
  for(const theme of themes){
    // Restore through the real preference service on each navigation.
    await page.goto('/profil');
    await page.evaluate(theme=>localStorage.setItem('fasoecole_theme_7',theme),theme);
    await page.reload();
    for(const [route,root] of [['eleves/1','.student-detail'],['enseignants/3','.teacher-detail']]){
      await page.goto(`/proprietaire/${route}`);
      await expect(page.locator(`${root} h1`)).toBeVisible();
      await expect(page.locator('body')).toHaveAttribute('data-app-theme',theme);
      expect(await page.locator(root).evaluate(node=>getComputedStyle(node).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
      const expected=await page.locator('body').evaluate(node=>({surface:getComputedStyle(node).getPropertyValue('--theme-surface').trim(),raised:getComputedStyle(node).getPropertyValue('--theme-raised').trim(),inset:getComputedStyle(node).getPropertyValue('--theme-inset').trim()}));
      const resolve=async(value:string)=>page.evaluate(value=>{const node=document.createElement('span');node.style.color=value;document.body.appendChild(node);const result=getComputedStyle(node).color;node.remove();return result;},value);
      const card=`${root} ${root === '.student-detail' ? '.student-detail__card' : '.teacher-detail__panel'}`;
      expect((await colors(card)).background).toBe(await resolve(expected.surface));
      expect((await colors(`${card} > h2`)).background).toBe(await resolve(expected.raised));
      if(root === '.student-detail'){
        await page.getByRole('button',{name:'+ Signaler',exact:true}).click();
        await expect(page.locator('.student-detail__form')).toBeVisible();
        expect((await colors('.student-detail__form')).background).toBe(await resolve(expected.inset));
      } else {
        expect((await colors('.teacher-detail form')).background).toBe(await resolve(expected.inset));
        expect((await colors('.teacher-detail__stats > div')).background).toBe(await resolve(expected.inset));
      }
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
      if(theme === 'white' || theme === 'night-violet') await page.screenshot({path:testInfo.outputPath(`${root.slice(1)}-${theme}.png`),fullPage:true});
      await page.emulateMedia({media:'print'});
      expect(await page.locator(root).evaluate(node=>getComputedStyle(node).backgroundColor)).toBe('rgb(255, 255, 255)');
      await page.emulateMedia({media:'screen'});
    }
  }
});
