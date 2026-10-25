import { test, expect } from '@playwright/test';
import { mockSchool } from './ui-fixtures';

test('prepares salaries, records a partial payment and prints preserved payroll documents', async ({page})=>{
  await mockSchool(page);
  const month=new Date().toISOString().slice(0,7),today=new Date().toISOString().slice(0,10);
  const school={id:1,name:'École La Réussite',address:'Ouagadougou',phone:'70000000',email:'ecole@test.invalid'};
  const contract={key:'teacher:9',kind:'TEACHER',jobTitle:'Enseignant',employeeNumber:'EMP-9',active:true,hireDate:'2026-10-01',rateType:'FIXED_MONTHLY',rate:80000,eligible:true,prepared:false,payableId:null as number|null,due:80000,paid:0,remaining:80000,workedHours:0,extraHours:0,iuts:0,tpa:0,net:80000,taxVersion:0,payments:[] as Record<string,unknown>[]};
  const employee={userId:20,firstName:'Awa',lastName:'Diallo',email:null,phone:null,active:true,subjects:['Français','Mathématiques'],contracts:[contract],due:80000,paid:0,remaining:80000,status:'UNPREPARED'};
  const documents:Record<string,unknown>[]=[];
  const overview=()=>({school,month,employees:[employee],due:80000,paid:employee.paid,remaining:employee.remaining});
  const detail=()=>({school,month,employee,history:[{month,due:80000,paid:employee.paid,remaining:employee.remaining,status:employee.status}],documents:documents.map(({snapshot,...summary})=>summary)});
  let paymentBody:Record<string,unknown>|undefined;
  await page.route('**/api/owner/payroll/**',route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.pathname.endsWith('/prepare')){contract.prepared=true;contract.payableId=7;employee.status='UNPAID';return route.fulfill({json:overview()});}
    if(url.pathname.includes('/employees/'))return route.fulfill({json:detail()});
    if(url.pathname.endsWith('/taxes')){
      const value=request.postDataJSON();expect(value).toMatchObject({iuts:5000,tpa:1600,version:0,reason:'Calcul comptable'});
      contract.iuts=value.iuts;contract.tpa=value.tpa;contract.taxVersion++;contract.net=contract.due-contract.iuts;
      contract.remaining=contract.net-contract.paid;employee.remaining=contract.remaining;return route.fulfill({status:200,body:''});
    }
    if(url.pathname.includes('/payments/')){
      paymentBody=request.postDataJSON();const amount=Number(paymentBody?.['amount']);contract.paid+=amount;contract.remaining-=amount;
      employee.paid=contract.paid;employee.remaining=contract.remaining;employee.status=contract.remaining===0?'PAID':'PARTIAL';
      contract.payments.push({id:1,date:today,amount,method:'CASH',reference:'PAIE-TEST'});return route.fulfill({json:{}});
    }
    if(url.pathname.endsWith('/documents')){
      const value=request.postDataJSON(),saved=JSON.parse(JSON.stringify(employee));
      if(value.kind==='EMPLOYMENT_CERTIFICATE'){
        saved.due=0;saved.paid=0;saved.remaining=0;saved.status='';saved.contracts=saved.contracts.map((c:Record<string,unknown>)=>({...c,rate:null,rateType:null,due:0,paid:0,remaining:0,payments:[]}));
      }
      const document={id:documents.length+1,reference:`DOC-${documents.length+1}`,kind:value.kind,month:value.month,createdAt:`${today}T10:00:00`,snapshot:{school,month:value.month,employee:saved,issuedOn:today}};
      documents.unshift(document);return route.fulfill({json:document});
    }
    if(/\/documents\/\d+$/.test(url.pathname))return route.fulfill({json:documents.find(d=>d['id']===Number(url.pathname.split('/').pop()))});
    return route.fulfill({json:overview()});
  });
  await page.goto('/proprietaire/salaires');
  const finance=page.locator('details').filter({has:page.locator('summary',{hasText:'Finance et comptabilité'})});
  await expect(finance.locator('a').first()).toHaveText('Salaires');
  await page.getByRole('button',{name:'Préparer les salaires du mois',exact:true}).click();
  await page.getByRole('button',{name:'Préparer les salaires',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Salaires du mois préparés');
  await page.getByRole('button',{name:'Ouvrir la paie : Awa Diallo',exact:true}).click();
  await expect(page.getByRole('region',{name:'Fiche de rémunération',exact:true})).toContainText('Français, Mathématiques');
  await page.getByRole('button',{name:'Saisir IUTS / TPA — Enseignant',exact:true}).click();
  await page.getByRole('spinbutton',{name:'IUTS retenu sur salaire (FCFA)',exact:true}).fill('5000');
  await page.getByRole('spinbutton',{name:'TPA à la charge de l’employeur (FCFA)',exact:true}).fill('1600');
  await page.getByLabel('Motif / référence du calcul',{exact:true}).fill('Calcul comptable');
  await page.getByRole('button',{name:'Enregistrer IUTS / TPA',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('IUTS et TPA enregistrés');
  await page.getByRole('button',{name:'Enregistrer un versement — Enseignant',exact:true}).click();
  await page.getByRole('spinbutton',{name:'Montant du versement (FCFA)',exact:true}).fill('30000');
  await page.getByRole('button',{name:'Enregistrer le versement',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Versement enregistré');expect(paymentBody).toMatchObject({amount:30000,method:'CASH'});
  await expect(page.getByRole('button',{name:'Saisir IUTS / TPA — Enseignant',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Éditer la fiche de paie',exact:true}).click();
  const paper=page.getByRole('article',{name:'Aperçu du document',exact:true});
  await expect(paper.getByRole('heading',{name:'Fiche de paie',exact:true})).toBeVisible();
  await expect(paper).toContainText('Partiellement payé');
  await expect(paper).toContainText('Retenues et net à verser');await expect(paper).toContainText('TPA patronale (hors net)');
  await page.emulateMedia({media:'print'});
  await expect(paper).toBeVisible();await expect(page.locator('.payroll > p-table')).toBeHidden();await expect(page.locator('.shell__sidebar')).toBeHidden();
  await page.emulateMedia({media:'screen'});
  await page.getByRole('button',{name:'Fermer l’aperçu',exact:true}).click();
  await page.getByRole('button',{name:'Éditer une attestation de travail',exact:true}).click();
  await expect(paper.getByRole('heading',{name:'Attestation de travail',exact:true})).toBeVisible();
  await expect(paper).toContainText('Awa Diallo');await expect(paper).toContainText('Français, Mathématiques');await expect(paper).not.toContainText('FCFA');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test('calculates and validates the employee net with employer TPA kept separate',async({page},info)=>{
  await mockSchool(page);
  const month=new Date().toISOString().slice(0,7);
  const school={id:1,name:'École La Réussite',address:'Ouagadougou',phone:null,email:null};
  const contract={key:'teacher:9',kind:'TEACHER',jobTitle:'Enseignant',employeeNumber:'EMP-9',active:true,hireDate:null,rateType:'FIXED_MONTHLY',rate:100000,eligible:true,prepared:true,payableId:7,due:100000,paid:0,remaining:100000,workedHours:0,extraHours:0,payments:[],iuts:0,tpa:0,net:100000,taxVersion:0,deductions:0,calculation:null as unknown};
  const employee={userId:20,firstName:'Awa',lastName:'Diallo',email:null,phone:null,active:true,subjects:[],contracts:[contract],due:100000,paid:0,remaining:100000,status:'UNPAID'};
  let calculationInput:Record<string,unknown>|null=null;
  await page.route('**/api/owner/payroll/**',route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.pathname.endsWith('/calculation/preview')) {
      calculationInput=req.postDataJSON();
      return route.fulfill({json:{result:{ruleVersion:'BF-CGI-2026-v1',month,input:calculationInput,gross:100000,pensionDeductible:0,professionalAllowance:25000,exemptions:0,taxableBase:75000,brackets:[],grossIuts:5895,familyReduction:0,iuts:5895,vacationWithholding:0,deductions:0,net:94105,tpaBase:100000,tpa:3000,employerCost:103000},versions:{'7':0},grossByPayable:{'7':100000}}});
    }
    if(url.pathname.endsWith('/calculation')) {
      if(req.method()==='GET')return route.fulfill({json:null});
      const input=req.postDataJSON();expect(input.input).toEqual(calculationInput);expect(input.versions).toEqual({'7':0});
      Object.assign(contract,{iuts:5895,tpa:3000,net:94105,remaining:94105,taxVersion:1});employee.remaining=94105;
      return route.fulfill({status:200,body:''});
    }
    if(url.pathname.includes('/employees/'))return route.fulfill({json:{school,month,employee,history:[],documents:[]}});
    return route.fulfill({json:{school,month,employees:[employee],due:100000,paid:0,remaining:employee.remaining}});
  });
  await page.goto('/proprietaire/salaires');
  await page.getByRole('button',{name:'Ouvrir la paie : Awa Diallo',exact:true}).click();
  await page.getByRole('button',{name:'Calculer la paie — IUTS et TPA',exact:true}).click();
  const calculator=page.getByRole('region',{name:'Calcul automatique de la paie',exact:true});
  await calculator.getByLabel('Statut TPA de l’établissement',{exact:true}).selectOption({label:'Assujetti — taux de 3 %'});
  await calculator.getByLabel('Motif et justificatifs du calcul',{exact:true}).fill('Justificatifs et statut fiscal vérifiés');
  await calculator.getByRole('button',{name:'Calculer l’aperçu',exact:true}).click();
  const result=calculator.getByRole('region',{name:'Aperçu du net à payer',exact:true});await expect(result).toContainText(/94[\s,]?105/);await expect(result).toContainText(/3[\s,]?000/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await calculator.screenshot({path:`test-results/payroll-calculation-${info.project.name}.png`});
  await result.getByRole('button',{name:'Valider le calcul et le net à payer',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Calcul de paie validé'})).toBeVisible();
  await expect(page.locator('.payroll__kpis')).toContainText(/94[\s,]?105/);
});

test('payroll-only staff can open salaries without other finance modules',async({page})=>{
  await mockSchool(page,'proprietaire',[],['PAYROLL']);
  await page.route('**/api/owner/payroll/**',route=>route.fulfill({json:{school:{id:1,name:'École'},month:'2026-10',employees:[],due:0,paid:0,remaining:0}}));
  await page.goto('/proprietaire');await expect(page).toHaveURL(/\/proprietaire\/salaires$/);
  await expect(page.locator('#modules-menu a[href="/proprietaire/salaires"]')).toBeVisible();
  await expect(page.locator('#modules-menu a[href="/proprietaire/depenses"]')).toHaveCount(0);
  await page.goto('/proprietaire/depenses');await expect(page).toHaveURL(/\/proprietaire\/salaires$/);
});
