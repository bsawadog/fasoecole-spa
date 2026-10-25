import {test,expect} from '@playwright/test';
import {mockSchool} from './ui-fixtures';

for(const profile of ['parent','etudiant'] as const){
  test(`${profile}: unpublished notes, published results, errors and loading follow all themes`,async({page},testInfo)=>{
    test.setTimeout(240_000);
    await mockSchool(page,profile);
    const child={studentId:20,fullName:'Awa Kaboré',registrationNumber:'M-20',schoolId:1,schoolName:'École La Réussite',classId:11,className:'CP1-A',levelName:'CP1',academicYearLabel:'2026-2027',attendance:{absences:1,unjustifiedAbsences:0,lates:0},fees:{totalDue:50000,totalPaid:20000,balance:30000,overdueCount:0}};
    await page.route('**/api/me/students',route=>route.fulfill({json:[child]}));
    await page.route('**/api/me/students/20',route=>route.fulfill({json:child}));
    let mode:'open'|'published'|'error'|'empty'='open';
    let release=()=>{};
    let gate:Promise<void>=Promise.resolve();
    await page.route('**/api/me/students/20/grades',async route=>{
      await gate;
      if(mode==='error')return route.fulfill({status:503,json:{message:'Notes momentanément indisponibles.'}});
      const published=mode==='published';
      return route.fulfill({json:{...child,periods:mode==='empty'?[]:[{periodId:3,periodName:'Premier trimestre',status:published?'PUBLISHED':'OPEN',published,startDate:'2026-10-01',endDate:'2026-12-31',classAverage:published?15:null,
        grades:[{id:1,subjectName:'Français',title:'Devoir 1',type:'DEVOIR',date:'2026-10-16',value:15,maxValue:20}],
        bulletin:published?{studentId:20,fullName:child.fullName,average:15,rank:1,classSize:1,mention:'Bien',comment:'Bon travail',absences:1,unjustifiedAbsences:0,lates:0,lines:[{subjectName:'Français',teacherName:'Paul',coefficient:2,average:15,classAverage:15,appreciation:'Bien'}]}:null}]}});
    });
    const check=async(selector:string,token:string)=>{
      await expect(page.locator(selector).first()).toBeVisible();
      const appearance=await page.locator(selector).first().evaluate((node,token)=>{
        const probe=document.createElement('span');probe.style.background=`var(--theme-${token})`;node.appendChild(probe);
        const style=getComputedStyle(node);
        const matches=style.backgroundColor===getComputedStyle(probe).backgroundColor;probe.remove();
        const luminance=(color:string)=>color.match(/[\d.]+/g)!.slice(0,3).map(Number).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);
        const a=luminance(style.color),b=luminance(style.backgroundColor);
        return {matches,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
      },token);
      expect(appearance.matches).toBe(true);
      expect(appearance.ratio,`${profile}: ${selector} contrast`).toBeGreaterThanOrEqual(4.5);
    };
    for(const theme of ['night-violet','night-green','blue-black','classic-blue','light-gray','glossy-black','white']){
      await page.goto('/profil');await page.evaluate(theme=>localStorage.setItem('fasoecole_theme_7',theme),theme);await page.reload();
      mode='open';gate=new Promise<void>(resolve=>release=resolve);
      await page.goto(`/${profile}/notes`);
      await check('app-student-grades-view .loading-state','surface');
      release();
      if(profile==='parent'){
        expect(await page.getByRole('button',{name:'Actualiser',exact:true}).evaluate(node=>{
          const probe=document.createElement('span');probe.style.color='var(--theme-link)';node.appendChild(probe);
          const matches=getComputedStyle(node).color===getComputedStyle(probe).color;probe.remove();return matches;
        })).toBe(true);
      }
      const message=page.getByText('Les moyennes et le bulletin seront disponibles après la publication des résultats par l’école.',{exact:true});
      await expect(message).toBeVisible();await check('app-student-grades-view .ss__alert--info','soft');
      if(theme==='night-violet'||theme==='white')await page.screenshot({path:testInfo.outputPath(`${profile}-unpublished-${theme}.png`),fullPage:true});
      mode='published';await page.reload();
      await expect(page.getByRole('button',{name:'Imprimer / enregistrer le bulletin en PDF'})).toBeVisible();
      await check('app-student-grades-view .ss__card','surface');
      await page.emulateMedia({media:'print'});
      expect(await page.locator('app-student-grades-view .ss__card').evaluate(node=>getComputedStyle(node).backgroundColor)).toBe('rgb(255, 255, 255)');
      await page.emulateMedia({media:'screen'});
      mode='empty';await page.reload();await check('app-student-grades-view .ss__state','surface');
      mode='error';await page.reload();await check('app-student-grades-view .p-message-error','danger-soft');
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    }
  });
}
