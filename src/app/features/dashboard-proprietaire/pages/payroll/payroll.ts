import { PayrollCalculator } from './payroll-calculator';
import { ModuleHelpButton } from '../../../../shared/help/module-help-button';
import { ChangeDetectorRef, Component, computed, ElementRef, HostListener, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { Subscription } from 'rxjs';
import { AuthService, RegistrationSchool } from '../../../../core/auth';
import { DateField } from '../../../../shared/ui/date-field';
import { NumberField } from '../../../../shared/ui/number-field';
import { SelectField, SelectOption } from '../../../../shared/ui/select-field';
import { LoadingState } from '../../../../shared/ui/loading-state';
import { TableRow } from '../../../../shared/ui/table-row';
import { FormValidationDirective } from '../../../../shared/form-validation.directive';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';
import { METHOD_LABELS, PaymentMethod } from '../../finance.service';
import { PayrollService, PayrollOverview, PayrollDetail, PayrollDocument, PayrollDocumentKind, PayrollEmployee, SALARY_STATUS, SALARY_RATES, SalaryContract } from '../../payroll.service';

const today=()=>new Date().toLocaleDateString('en-CA');
const normalize=(value:string)=>value.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();

@Component({
  selector:'app-payroll',standalone:true,
  imports: [PayrollCalculator, ModuleHelpButton, FormsModule,DatePipe,DecimalPipe,ButtonModule,InputTextModule,MessageModule,TableModule,TooltipModule,
    DateField,NumberField,SelectField,SelectOption,LoadingState,TableRow,FormValidationDirective],
  templateUrl:'./payroll.html',styleUrl:'./payroll.scss',
})
export class PayrollPage implements OnInit,OnDestroy {
  private readonly auth=inject(AuthService);
  private readonly api=inject(PayrollService);
  private readonly confirmation=inject(ConfirmationService);
  private readonly changes=inject(ChangeDetectorRef);
  private readonly host:ElementRef<HTMLElement>=inject(ElementRef);
  private readonly requests=new Subscription();
  private readRequest?:Subscription;
  private detailRequest?:Subscription;
  private documentRequest?:Subscription;
  readonly schools=signal<RegistrationSchool[]>([]);
  readonly schoolId=signal<number|null>(null);
  readonly data=signal<PayrollOverview|null>(null);
  readonly detail=signal<PayrollDetail|null>(null);
  readonly document=signal<PayrollDocument|null>(null);
  readonly detailLoading=signal(false);
  readonly selectedUser=signal<number|null>(null);
  readonly paymentContract=signal<SalaryContract|null>(null);
  readonly calculatorOpen=signal(false);
  readonly taxContract=signal<SalaryContract|null>(null);
  taxForm={iuts:0 as number|null,tpa:0 as number|null,reason:''};
  readonly loading=signal(true);
  readonly busy=signal(false);
  readonly error=signal('');
  readonly success=signal('');
  readonly search=signal('');
  readonly filter=signal('ACTIVE');
  readonly printing=signal(false);
  readonly printMode=signal<'register'|'document'>('register');
  readonly statuses=SALARY_STATUS;
  readonly rates=SALARY_RATES;
  readonly methods=Object.keys(METHOD_LABELS) as PaymentMethod[];
  readonly methodLabels=METHOD_LABELS;
  readonly currentDate=today();
  readonly currentMonth=this.currentDate.slice(0,7);
  month=inject(ActivatedRoute, {optional:true})?.snapshot.queryParamMap.get('month') ?? this.currentMonth;
  payment={amount:null as number|null,date:this.currentDate,method:'CASH' as PaymentMethod,reference:''};
  private paymentKey='';
  private paymentFingerprint='';
  private documentKey='';
  private documentFingerprint='';
  readonly employees=computed(()=> (this.data()?.employees??[]).filter(employee=>{
    const content=normalize([employee.firstName,employee.lastName,employee.email??'',...employee.subjects,...employee.contracts.map(c=>`${c.jobTitle} ${c.employeeNumber??''}`)].join(' '));
    return content.includes(normalize(this.search().trim())) && (this.filter()==='ALL' || this.filter()==='ACTIVE' && employee.active
      || this.filter()==='OPEN' && employee.remaining>0 || this.filter()==='PAID' && employee.status==='PAID' || this.filter()==='UNCONFIGURED' && employee.status==='UNCONFIGURED');
  }));
  readonly canIssueSlip=computed(()=>{
    const contracts=this.detail()?.employee.contracts??[];
    return contracts.some(c=>c.prepared||c.paid>0) && !contracts.some(c=>c.eligible&&(c.rate??0)>0&&!c.prepared&&!(c.kind==='TEACHER'&&c.paid>0));
  });
  ngOnInit():void {
    const owner=this.auth.user()?.id;
    if(!owner){this.loading.set(false);return;}
    this.requests.add(this.auth.getOwnedSchools(owner,'PAYROLL').subscribe({next:schools=>{
      this.schools.set(schools);this.schoolId.set(schools.find(s=>s.id===Number(localStorage.getItem('fasoecole_owner_school')))?.id??schools[0]?.id??null);
      if(this.schoolId())this.load();else this.loading.set(false);
    },error:()=>{this.loading.set(false);this.error.set('Impossible de charger les établissements.');}}));
  }
  ngOnDestroy():void {this.requests.unsubscribe();this.readRequest?.unsubscribe();this.detailRequest?.unsubscribe();this.documentRequest?.unsubscribe();}
  changeMonth():void {if(this.busy())return;this.closeDetail();this.document.set(null);this.data.set(null);this.printMode.set('register');this.success.set('');this.load();}
  load():void {
    if(!this.schoolId()||this.busy())return;
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(this.month)){this.error.set('Choisissez un mois valide.');return;}
    this.readRequest?.unsubscribe();this.loading.set(true);this.error.set('');
    this.readRequest=this.api.overview(this.schoolId()!,this.month).subscribe({next:data=>{this.data.set(data);this.loading.set(false);},error:err=>{this.loading.set(false);this.fail(err,'Impossible de charger les salaires.');}});
  }
  async prepare():Promise<void> {
    if(!this.schoolId()||this.busy())return;
    if(!await this.confirmation.confirm({title:'Préparer les salaires du mois ?',message:'Les rémunérations configurées seront préparées une seule fois pour ce mois. Les montants du personnel déjà préparés sont conservés. Aucun versement ne sera enregistré.',confirmLabel:'Préparer les salaires'}))return;
    if(this.busy())return;
    this.busy.set(true);this.error.set('');
    this.requests.add(this.api.prepare(this.schoolId()!,this.month).subscribe({next:data=>{
      this.data.set(data);this.busy.set(false);this.success.set('Salaires du mois préparés. Vous pouvez enregistrer les versements et éditer les fiches.');
      if(this.selectedUser())this.openDetail(this.selectedUser()!);
    },error:err=>this.fail(err,'Impossible de préparer les salaires.')}));
  }
  openDetail(user:number):void {
    if(this.busy())return;
    this.detailRequest?.unsubscribe();this.selectedUser.set(user);this.detail.set(null);this.paymentContract.set(null);this.taxContract.set(null);this.calculatorOpen.set(false);this.detailLoading.set(true);this.error.set('');
    this.focus('.payroll__detail-title');
    this.detailRequest=this.api.detail(this.schoolId()!,user,this.month).subscribe({next:value=>{this.detail.set(value);this.detailLoading.set(false);},error:err=>{this.detailLoading.set(false);this.fail(err,'Impossible de charger la fiche de l’employé.');}});
  }
  closeDetail():void {if(this.busy())return;this.detailRequest?.unsubscribe();this.selectedUser.set(null);this.detail.set(null);this.detailLoading.set(false);this.paymentContract.set(null);this.taxContract.set(null);this.calculatorOpen.set(false);}
  canCalculate():boolean {
    const employee=this.detail()?.employee;
    return !!employee && this.month<=this.currentMonth && employee.contracts.some(c=>c.due>0) && employee.contracts.filter(c=>c.due>0).every(c=>c.prepared) && employee.contracts.every(c=>c.paid===0);
  }
  openCalculator():void {if(!this.canCalculate()||this.busy())return;this.taxContract.set(null);this.paymentContract.set(null);this.calculatorOpen.set(true);}
  calculationSaved():void {
    this.calculatorOpen.set(false);this.success.set('Calcul de paie validé. Le net à payer et la TPA sont actualisés ; aucun versement enregistré.');
    const user=this.selectedUser();this.load();if(user)this.openDetail(user);
  }
  registerNet():number {return (this.data()?.employees??[]).reduce((sum,e)=>sum+this.net(e),0);}
  calculation(employee:PayrollEmployee){return employee.contracts.find(c=>c.calculation)?.calculation;}
  openTaxes(contract:SalaryContract):void {
    if(this.busy()||!contract.payableId||contract.paid>0||contract.calculation||this.month>this.currentMonth)return;
    this.paymentContract.set(null);this.taxContract.set(contract);this.taxForm={iuts:contract.iuts??0,tpa:contract.tpa??0,reason:''};this.error.set('');this.focus('.payroll__tax-title');
  }
  saveTaxes():void {
    const contract=this.taxContract(),{iuts,tpa,reason}=this.taxForm;
    if(!contract?.payableId||this.busy())return;
    if(iuts==null||tpa==null||!Number.isFinite(iuts)||!Number.isFinite(tpa)||iuts<0||tpa<0||iuts>contract.due-(contract.deductions??0)||!reason.trim()){
      this.error.set('Renseignez des montants positifs ou nuls et un motif. L’IUTS ne peut pas dépasser la rémunération du mois.');return;
    }
    this.busy.set(true);this.error.set('');this.success.set('');
    this.requests.add(this.api.taxes(this.schoolId()!,contract.payableId,{iuts,tpa,version:contract.taxVersion??0,reason:reason.trim()}).subscribe({next:()=>{
      this.busy.set(false);this.success.set('IUTS et TPA enregistrés. Le net à verser est actualisé ; aucun paiement fiscal n’a été enregistré.');
      const user=this.selectedUser();this.load();if(user)this.openDetail(user);
    },error:err=>this.fail(err,'Impossible d’enregistrer les montants. Actualisez la fiche si elle a changé.')}));
  }
  sumTax(employee:PayrollEmployee,field:'iuts'|'tpa'|'deductions'):number {return employee.contracts.reduce((sum,c)=>sum+(c[field]??0),0);}
  net(employee:PayrollEmployee):number {return employee.contracts.reduce((sum,c)=>sum+(c.net??c.due),0);}
  registerTax(field:'iuts'|'tpa'|'deductions'):number {return (this.data()?.employees??[]).reduce((sum,e)=>sum+this.sumTax(e,field),0);}
  openPayment(contract:SalaryContract):void {
    if(this.busy()||!contract.payableId||contract.remaining<=0)return;
    this.taxContract.set(null);this.calculatorOpen.set(false);
    this.paymentContract.set(contract);this.payment={amount:contract.remaining,date:this.currentDate,method:'CASH',reference:''};
    this.paymentKey='';this.paymentFingerprint='';this.error.set('');this.focus('.payroll__payment-title');
  }
  recordPayment():void {
    const contract=this.paymentContract(),amount=this.payment.amount;
    if(!contract?.payableId||this.busy())return;
    if(amount==null||!Number.isFinite(amount)||amount<=0||amount>contract.remaining){this.error.set('Le versement doit être positif et ne pas dépasser le reste à payer.');return;}
    const content={amount,date:this.payment.date,method:this.payment.method,reference:this.payment.reference.trim()||null};
    const fingerprint=JSON.stringify({id:contract.payableId,...content});
    if(fingerprint!==this.paymentFingerprint){this.paymentKey=crypto.randomUUID();this.paymentFingerprint=fingerprint;}
    this.busy.set(true);this.error.set('');this.success.set('');
    this.requests.add(this.api.pay(this.schoolId()!,contract.payableId,{...content,requestId:this.paymentKey}).subscribe({next:()=>{
      this.busy.set(false);this.success.set('Versement enregistré dans la paie et les dépenses, sans double saisie.');
      const user=this.selectedUser();this.load();if(user)this.openDetail(user);
    },error:err=>this.fail(err,'Impossible d’enregistrer le versement. Vos valeurs sont conservées pour réessayer.')}));
  }
  issue(kind:PayrollDocumentKind):void {
    const employee=this.detail()?.employee;
    if(!employee||this.busy())return;
    const month=kind==='PAYSLIP'?this.month:null,fingerprint=JSON.stringify({user:employee.userId,kind,month});
    if(fingerprint!==this.documentFingerprint){this.documentKey=crypto.randomUUID();this.documentFingerprint=fingerprint;}
    this.busy.set(true);this.error.set('');this.success.set('');
    this.requests.add(this.api.issue(this.schoolId()!,employee.userId,kind,month,this.documentKey).subscribe({next:document=>{
      this.busy.set(false);this.document.set(document);this.documentFingerprint='';this.documentKey='';this.printMode.set('document');
      this.success.set('Document conservé. Vérifiez l’aperçu avant de l’imprimer et de le faire signer.');
      this.openDetail(employee.userId);this.focus('.payroll__document-title');
    },error:err=>this.fail(err,'Impossible d’éditer le document.')}));
  }
  openDocument(id:number):void {
    if(this.busy())return;
    this.documentRequest?.unsubscribe();this.error.set('');
    this.documentRequest=this.api.document(this.schoolId()!,id).subscribe({next:value=>{this.document.set(value);this.printMode.set('document');this.focus('.payroll__document-title');},error:err=>this.fail(err,'Impossible de consulter ce document.')});
  }
  personName(employee:PayrollEmployee):string {return `${employee.firstName} ${employee.lastName}`;}
  jobs(employee:PayrollEmployee):string {return employee.contracts.map(c=>c.jobTitle).join(' · ');}
  canPay(contract:SalaryContract):boolean {return !!contract.payableId&&contract.remaining>0&&this.month<=this.currentMonth;}
  print(mode:'register'|'document'):void {this.printMode.set(mode);this.changes.detectChanges();window.print();}
  @HostListener('window:beforeprint') beforePrint():void {this.printing.set(true);this.changes.detectChanges();}
  @HostListener('window:afterprint') afterPrint():void {this.printing.set(false);}
  exportCsv():void {
    const rows:unknown[][]=[['Employé','Fonctions','Matières','Rémunérations','Mois','Avant retenue FCFA','IUTS FCFA','Autres retenues FCFA','Net à verser FCFA','TPA patronale FCFA','Versé FCFA','Reste FCFA','Statut'],...this.employees().map(e=>[
      this.personName(e),this.jobs(e),e.subjects.join(', '),e.contracts.map(c=>`${c.jobTitle}: ${c.rate??'Non défini'} ${this.rates[c.rateType??'']??''}`).join(' / '),this.month,e.due,this.sumTax(e,'iuts'),this.sumTax(e,'deductions'),this.net(e),this.sumTax(e,'tpa'),e.paid,e.remaining,this.statuses[e.status]??e.status])];
    const cell=(value:unknown)=>{let text=String(value??'');if(/^[\s]*[=+@-]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';};
    const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(row=>row.map(cell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8;'}));
    const link=document.createElement('a');link.href=url;link.download=`salaires-${this.schoolId()}-${this.month}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  private fail(err:{error?:{message?:string}},fallback:string):void {this.busy.set(false);this.error.set(err?.error?.message||fallback);}
  private focus(selector:string):void {setTimeout(()=>this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus(),0);}
}
