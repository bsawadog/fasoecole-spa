import {test,expect} from '@playwright/test';
import {mockSchool} from './ui-fixtures';

test('all grading steps and filled report cards follow the selected theme',async({page},testInfo)=>{
  await mockSchool(page);
  const period={id:3,schoolId:1,academicYearId:1,academicYearLabel:'2026-2027',code:'T1',name:'Premier trimestre',startDate:'2026-10-01',endDate:'2026-12-31',passMark:10,status:'OPEN',publishedAt:null,evaluationCount:1};
  const evaluation={id:51,classSubjectTeacherId:31,subjectId:41,subjectName:'Mathématiques',teacherName:'Paul Ouédraogo',periodId:3,title:'Devoir 1',type:'DEVOIR',evalDate:'2026-10-16',maxValue:20,weight:1,gradedCount:1,studentCount:1,averageOn20:15};
  const subject={subjectId:41,subjectName:'Mathématiques',coefficient:2,defaultCoefficient:2,overridden:false,assignments:[{classSubjectTeacherId:31,teacherId:8,teacherName:'Paul Ouédraogo',active:true}]};
  const student={studentId:20,fullName:'Awa Kaboré',registrationNumber:'M-20',subjectAverages:{41:15},average:15,rank:1,mention:'Bien',passed:true,comment:'Bon travail',reportCardGenerated:true,validated:false};
  const stats={classAverage:15,rankedCount:1,studentCount:1,passRate:100,passCount:1,highest:15,lowest:15,mentions:{Bien:1}};
  await page.route('**/api/owner/grades/**',route=>{
    const path=new URL(route.request().url()).pathname;
    let json:unknown=[];
    if(path.endsWith('/periods')) json=[period];
    else if(path.endsWith('/summary')) json={period,average:15,passRate:100,studentCount:1,rankedCount:1,classes:[]};
    else if(path.endsWith('/subjects')) json=[subject];
    else if(path.endsWith('/evaluations')) json=[evaluation];
    else if(path.endsWith('/sheet')) json={evaluation,period,className:'CP1-A',rows:[{...student,value:15}]};
    else if(path.endsWith('/results')) json={period,className:'CP1-A',levelName:'CP1',subjects:[subject],students:[student],stats};
    else if(path.endsWith('/history')) json=[{id:1,evaluationTitle:'Devoir 1',studentName:student.fullName,action:'UPDATE',oldValue:14,newValue:15,changedByName:'Paul',changedAt:'2026-10-16T10:00:00',reason:'Correction'}];
    else if(path.endsWith('/bulletins')) json={schoolName:'École La Réussite',schoolAddress:'Ouagadougou',schoolPhone:'70000000',schoolEmail:'ecole@example.test',className:'CP1-A',periodName:period.name,academicYearLabel:'2026-2027',published:false,classAverage:15,bulletins:[{...student,birthDate:'2018-05-10',classSize:1,totalCoefficients:2,totalWeighted:30,decision:'Admis',absences:0,unjustifiedAbsences:0,lates:0,lines:[{subjectName:'Mathématiques',coefficient:2,average:15,weighted:30,classAverage:15,min:15,max:15,appreciation:'Bien',teacherName:'Paul'}]}]};
    return route.fulfill({json});
  });
  for(const theme of ['night-violet','night-green','blue-black','classic-blue','light-gray','glossy-black','white']){
    await page.goto('/profil'); await page.evaluate(theme=>localStorage.setItem('fasoecole_theme_7',theme),theme); await page.reload();
    await page.goto('/proprietaire/notes');
    for(const label of ['Créer les périodes','Créer les évaluations','Entrer les notes','Résultats et classement','Bulletins','Synthèse','Coefficients des matières','Historique des notes']){
      await page.getByRole('navigation').getByRole('button',{name:label,exact:true}).click();
      await expect(page.locator('.gr__guide')).toContainText(label);
      if(label === 'Entrer les notes') await page.getByRole('button',{name:'Saisir les notes',exact:true}).click();
      if(label === 'Bulletins') await expect(page.locator('.gr__bulletin')).toBeVisible();
      const failures=await page.locator('.gr__status, .gr__act, .gr__kpi span, .gr__count, .gr__b-id span, .gr__b-summary span, .gr__b-comment span').evaluateAll(nodes=>{
        const luminance=(rgb:number[])=>rgb.slice(0,3).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);
        return nodes.filter(node=>node.getClientRects().length).flatMap(node=>{
          let parent:Element|null=node, background='';
          while(parent){background=getComputedStyle(parent).backgroundColor;if(/^rgb\(/.test(background))break;parent=parent.parentElement;}
          if(!parent)return [];
          const foreground=getComputedStyle(node).color;
          const a=luminance(foreground.match(/[\d.]+/g)!.map(Number)),b=luminance(background.match(/[\d.]+/g)!.map(Number));
          const ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
          return ratio<4.5?[{text:node.textContent,foreground,background,ratio}]:[];
        });
      });
      expect(failures,`${theme}: ${label} text contrast`).toEqual([]);
      if(label === 'Bulletins'){
        if(theme === 'night-violet' || theme === 'white')await page.screenshot({path:testInfo.outputPath(`bulletin-${theme}.png`),fullPage:true});
        await page.emulateMedia({media:'print'});
        expect(await page.locator('.gr__bulletin').evaluate(node=>getComputedStyle(node).backgroundColor)).toBe('rgb(255, 255, 255)');
        await page.emulateMedia({media:'screen'});
      }
    }
  }
});
