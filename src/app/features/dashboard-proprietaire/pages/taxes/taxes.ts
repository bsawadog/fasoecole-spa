import { ChangeDetectorRef,Component,computed,ElementRef,HostListener,inject,OnDestroy,OnInit,signal } from '@angular/core';
import { DatePipe,DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { Subscription,Observable } from 'rxjs';
import { AuthService,RegistrationSchool } from '../../../../core/auth';
import { DateField } from '../../../../shared/ui/date-field';
import { NumberField } from '../../../../shared/ui/number-field';
import { SelectField,SelectOption } from '../../../../shared/ui/select-field';
import { LoadingState } from '../../../../shared/ui/loading-state';
import { TableRow } from '../../../../shared/ui/table-row';
import { FormValidationDirective } from '../../../../shared/form-validation.directive';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';
import { METHOD_LABELS,PaymentMethod } from '../../finance.service';
import { SchoolTaxesService,TAX_CODES,TaxCode,TaxRow,TaxDetail,TaxOverview,TaxPayrollPreview } from '../../taxes.service';

const today=()=>new Date().toLocaleDateString('en-CA');
const normalize=(s:string)=>s.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
@Component({selector:'app-school-taxes',standalone:true,
  imports:[DatePipe,DecimalPipe,FormsModule,ButtonModule,InputTextModule,MessageModule,TableModule,TooltipModule,DateField,NumberField,SelectField,SelectOption,LoadingState,TableRow,FormValidationDirective],
  templateUrl:'./taxes.html',styleUrl:'./taxes.scss'})
export class SchoolTaxesPage implements OnInit,OnDestroy {
  private readonly auth=inject(AuthService);private readonly api=inject(SchoolTaxesService);
  private readonly confirmation=inject(ConfirmationService);private readonly changes=inject(ChangeDetectorRef);
  private readonly host:ElementRef<HTMLElement>=inject(ElementRef);
  private readonly requests=new Subscription();private readRequest?:Subscription;private detailRequest?:Subscription;private previewRequest?:Subscription;
  readonly schools=signal<RegistrationSchool[]>([]);readonly schoolId=signal<number|null>(null);
  readonly schoolName=computed(()=>this.schools().find(s=>s.id===this.schoolId())?.name??'');
  readonly data=signal<TaxOverview|null>(null);readonly detail=signal<TaxDetail|null>(null);readonly detailLoading=signal(false);
  readonly loading=signal(true);readonly busy=signal(false);readonly error=signal('');readonly success=signal('');
  readonly search=signal('');readonly codeFilter=signal('ALL');readonly statusFilter=signal('ALL');readonly printing=signal(false);
  readonly formOpen=signal(false);readonly editing=signal<TaxRow|null>(null);readonly paymentOpen=signal(false);readonly payrollOpen=signal(false);
  readonly preview=signal<TaxPayrollPreview|null>(null);readonly previewLoading=signal(false);
  readonly labels=TAX_CODES;readonly codes=Object.keys(TAX_CODES) as TaxCode[];
  readonly statuses:Record<string,string>={UNPAID:'À payer',PARTIAL:'Partiellement réglé',PAID:'Soldé',CANCELLED:'Annulé',NOT_DUE:'Montant nul'};
  readonly eventLabels:Record<string,string>={CREATE:'Création',EDIT:'Correction',CANCEL:'Annulation',IMPORT:'Reprise des salaires',REFRESH:'Actualisation des salaires'};
  readonly methods=Object.keys(METHOD_LABELS) as PaymentMethod[];readonly methodLabels=METHOD_LABELS;
  readonly currentDate=today();readonly currentMonth=this.currentDate.slice(0,7);year=new Date().getFullYear();
  form=this.emptyForm();payment={amount:null as number|null,date:this.currentDate,method:'BANK_TRANSFER' as PaymentMethod,reference:''};
  payroll={month:this.currentMonth,dueDate:'',creditor:'Direction générale des impôts',declarationReference:'',reason:''};
  cancelReason='';private createKey='';private createFingerprint='';private paymentKey='';private paymentFingerprint='';
  readonly rows=computed(()=> (this.data()?.rows??[]).filter(r=>{
    const p=r.obligation,status=this.statusFilter();
    return (this.codeFilter()==='ALL'||r.code===this.codeFilter()) && (status==='ALL'||status==='OPEN'&&p.remaining>0||status==='OVERDUE'&&p.overdue||status===p.status)
      && normalize(`${this.labels[r.code]} ${p.label} ${p.supplier??''} ${r.declarationReference??''} ${r.periodStart} ${r.periodEnd}`).includes(normalize(this.search().trim()));
  }));
  readonly summaries=computed(()=>this.codes.map(code=>{
    const rows=(this.data()?.rows??[]).filter(r=>r.code===code&&r.obligation.status!=='CANCELLED');
    return {code,count:rows.length,due:rows.reduce((n,r)=>n+r.obligation.amount,0),paid:rows.reduce((n,r)=>n+r.obligation.paid,0),remaining:rows.reduce((n,r)=>n+r.obligation.remaining,0)};
  }));
  ngOnInit():void {
    const user=this.auth.user()?.id;if(!user){this.loading.set(false);return;}
    this.requests.add(this.auth.getOwnedSchools(user,'TAXES').subscribe({next:schools=>{
      this.schools.set(schools);this.schoolId.set(schools.find(s=>s.id===Number(localStorage.getItem('fasoecole_owner_school')))?.id??schools[0]?.id??null);
      if(this.schoolId())this.load();else this.loading.set(false);
    },error:err=>{this.loading.set(false);this.fail(err,'Impossible de charger les établissements.');}}));
  }
  ngOnDestroy():void{this.requests.unsubscribe();this.readRequest?.unsubscribe();this.detailRequest?.unsubscribe();this.previewRequest?.unsubscribe();}
  changeYear():void {if(this.busy())return;this.data.set(null);this.closePanels();this.load();}
  load():void {
    if(!this.schoolId()||this.busy())return;
    if(!Number.isInteger(Number(this.year))||this.year<1900||this.year>2200){this.error.set('Choisissez une année entre 1900 et 2200.');return;}
    this.readRequest?.unsubscribe();this.loading.set(true);this.error.set('');
    this.readRequest=this.api.overview(this.schoolId()!,Number(this.year)).subscribe({next:value=>{this.data.set(value);this.loading.set(false);},error:err=>{this.loading.set(false);this.fail(err,'Impossible de charger les impôts et taxes.');}});
  }
  openCreate():void {if(this.busy())return;this.closePanels();this.editing.set(null);this.form=this.emptyForm();this.form.periodStart=`${this.year}-01-01`;this.form.periodEnd=`${this.year}-12-31`;this.formOpen.set(true);this.createKey='';this.createFingerprint='';this.focus('.taxes__form-title');}
  openEdit(row:TaxRow):void {
    if(this.busy()||row.obligation.paid>0||row.obligation.status==='CANCELLED')return;
    this.closePanels();this.editing.set(row);this.form={code:row.code,label:row.obligation.label,periodStart:row.periodStart,periodEnd:row.periodEnd,amount:row.obligation.amount,dueDate:row.obligation.dueDate,creditor:row.obligation.supplier??'',declarationReference:row.declarationReference??'',notes:row.obligation.notes??'',reason:''};
    this.formOpen.set(true);this.focus('.taxes__form-title');
  }
  save():void {
    if(this.busy()||!this.schoolId())return;
    const f=this.form,row=this.editing();
    if(f.amount==null||!Number.isFinite(f.amount)||f.amount<0||!f.label.trim()||!f.creditor.trim()||!f.dueDate||!f.periodStart||!f.periodEnd||f.periodEnd<f.periodStart||row&&!f.reason.trim()){
      this.error.set('Renseignez une période valide, le montant, l’organisme et l’échéance. Une correction nécessite un motif.');return;
    }
    const common={amount:f.amount,dueDate:f.dueDate,creditor:f.creditor.trim(),declarationReference:f.declarationReference.trim()||null,notes:f.notes.trim()||null};
    let request:Observable<unknown>;
    if(row)request=this.api.edit(this.schoolId()!,row.id,{...common,version:row.version,reason:f.reason.trim()});
    else {
      const content={...common,code:f.code,label:f.label.trim(),periodStart:f.periodStart,periodEnd:f.periodEnd},fingerprint=JSON.stringify(content);
      if(fingerprint!==this.createFingerprint){this.createKey=crypto.randomUUID();this.createFingerprint=fingerprint;}
      request=this.api.create(this.schoolId()!,{...content,requestId:this.createKey});
    }
    this.run(request,'Obligation fiscale enregistrée.',()=>{this.year=Number(f.periodStart.slice(0,4));this.closePanels();this.load();});
  }
  openDetail(row:TaxRow):void {
    if(this.busy())return;this.closePanels();this.detailLoading.set(true);this.focus('.taxes__detail-title');
    this.detailRequest=this.api.detail(this.schoolId()!,row.id).subscribe({next:value=>{this.detail.set(value);this.detailLoading.set(false);},error:err=>{this.detailLoading.set(false);this.fail(err,'Impossible de charger les paiements.');}});
  }
  openPayment():void {
    const row=this.detail()?.tax;if(!row||this.busy()||row.obligation.remaining<=0||row.obligation.status==='CANCELLED')return;
    this.payment={amount:row.obligation.remaining,date:this.currentDate,method:'BANK_TRANSFER',reference:''};this.paymentKey='';this.paymentFingerprint='';this.paymentOpen.set(true);this.focus('.taxes__payment-title');
  }
  recordPayment():void {
    const row=this.detail()?.tax,amount=this.payment.amount;if(!row||this.busy())return;
    if(amount==null||!Number.isFinite(amount)||amount<=0||amount>row.obligation.remaining){this.error.set('Le règlement doit être positif et ne pas dépasser le reste à payer.');return;}
    const content={amount,date:this.payment.date,method:this.payment.method,reference:this.payment.reference.trim()||null};
    const fingerprint=JSON.stringify({id:row.id,...content});if(fingerprint!==this.paymentFingerprint){this.paymentKey=crypto.randomUUID();this.paymentFingerprint=fingerprint;}
    this.run(this.api.pay(this.schoolId()!,row.id,{...content,requestId:this.paymentKey}),'Règlement enregistré dans les dépenses, sans double saisie.',()=>{this.load();this.openDetail(row);});
  }
  async cancel():Promise<void>{
    const row=this.detail()?.tax;if(!row||this.busy()||row.origin!=='MANUAL'||row.obligation.paid>0||row.obligation.status==='CANCELLED')return;
    if(!this.cancelReason.trim()){this.error.set('Renseignez le motif de l’annulation.');return;}
    if(!await this.confirmation.confirm({title:'Annuler cette obligation ?',message:'L’obligation restera visible avec son motif d’annulation. Aucun paiement ne sera supprimé.',confirmLabel:'Annuler l’obligation'}))return;
    if(this.busy())return;
    this.run(this.api.cancel(this.schoolId()!,row.id,row.version,this.cancelReason.trim()),'Obligation annulée et conservée dans l’historique.',()=>{this.load();this.openDetail(row);});
  }
  openPayroll():void {if(this.busy())return;this.closePanels();this.payrollOpen.set(true);this.payroll={month:this.currentMonth,dueDate:'',creditor:'Direction générale des impôts',declarationReference:'',reason:''};this.loadPreview();}
  loadPreview():void {
    this.previewRequest?.unsubscribe();this.preview.set(null);this.previewLoading.set(true);this.error.set('');
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(this.payroll.month)){this.previewLoading.set(false);return;}
    this.previewRequest=this.api.preview(this.schoolId()!,this.payroll.month).subscribe({next:value=>{this.preview.set(value);this.previewLoading.set(false);},error:err=>{this.previewLoading.set(false);this.fail(err,'Impossible de reprendre les montants des salaires.');}});
  }
  importPayroll():void {
    if(this.busy()||!this.preview()||this.payroll.month>this.currentMonth)return;
    if(!this.payroll.dueDate||!this.payroll.creditor.trim()||!this.payroll.reason.trim()){this.error.set('Renseignez l’échéance, l’organisme et le motif de la reprise.');return;}
    this.run(this.api.importPayroll(this.schoolId()!,{...this.payroll,creditor:this.payroll.creditor.trim(),declarationReference:this.payroll.declarationReference.trim()||null,reason:this.payroll.reason.trim()}),
      'IUTS / TPA repris ou actualisés. Les règlements déjà enregistrés sont conservés.',()=>{this.year=Number(this.payroll.month.slice(0,4));this.closePanels();this.load();});
  }
  closePanels():void {if(this.busy())return;this.detailRequest?.unsubscribe();this.previewRequest?.unsubscribe();this.detail.set(null);this.detailLoading.set(false);this.formOpen.set(false);this.editing.set(null);this.paymentOpen.set(false);this.payrollOpen.set(false);this.preview.set(null);this.previewLoading.set(false);this.cancelReason='';}
  print():void {this.changes.detectChanges();window.print();}
  @HostListener('window:beforeprint') beforePrint():void{this.printing.set(true);this.changes.detectChanges();}
  @HostListener('window:afterprint') afterPrint():void{this.printing.set(false);}
  exportCsv():void {
    const rows:unknown[][]=[['Type','Libellé','Début période','Fin période','Échéance','Organisme','Référence déclaration','Origine','Dû FCFA','Réglé FCFA','Reste FCFA','Statut'],...this.rows().map(r=>[this.labels[r.code],r.obligation.label,r.periodStart,r.periodEnd,r.obligation.dueDate,r.obligation.supplier,r.declarationReference,r.origin==='PAYROLL'?'Reprise des salaires':'Saisie manuelle',r.obligation.amount,r.obligation.paid,r.obligation.remaining,this.statuses[r.obligation.status]])];
    const cell=(value:unknown)=>{let s=String(value??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
    const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(r=>r.map(cell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8;'}));
    const link=document.createElement('a');link.href=url;link.download=`impots-taxes-${this.schoolId()}-${this.year}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  private emptyForm(){return {code:'TVA' as TaxCode,label:'TVA',periodStart:'',periodEnd:'',amount:null as number|null,dueDate:'',creditor:'Direction générale des impôts',declarationReference:'',notes:'',reason:''};}
  private run(request:Observable<unknown>,message:string,done:()=>void):void{this.busy.set(true);this.error.set('');this.success.set('');this.requests.add(request.subscribe({next:()=>{this.busy.set(false);this.success.set(message);done();},error:err=>this.fail(err,'Impossible d’enregistrer. Vos valeurs sont conservées.')}));}
  private fail(err:{error?:{message?:string}},fallback:string):void{this.busy.set(false);this.error.set(err?.error?.message||fallback);}
  private focus(selector:string):void{setTimeout(()=>this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus(),0);}
}
