import { ErrorAlert } from '../../../../shared/error-alert';
import { Component, computed, DestroyRef, HostListener, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, Subscription } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { AuthService } from '../../../../core/auth';
import { BankBookService, BankOverview } from '../../bank-book.service';
import { CashDirection, CashMovement } from '../../cash-book.service';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';
import { ModuleHelpButton } from '../../../../shared/help/module-help-button';
import { LoadingState } from '../../../../shared/ui/loading-state';
import { DateField } from '../../../../shared/ui/date-field';
import { NumberField } from '../../../../shared/ui/number-field';
import { SelectField } from '../../../../shared/ui/select-field';
import { SelectOption } from '../../../../shared/ui/select-field';
import { apiError } from '../../../../shared/self-space/self-space.service';

@Component({selector:'app-bank-book',standalone:true,
  imports:[ErrorAlert, DatePipe,DecimalPipe,FormsModule,ButtonModule,InputTextModule,MessageModule,ModuleHelpButton,LoadingState,DateField,NumberField,SelectField,SelectOption],
  templateUrl:'./bank-book.html',styleUrls:['../expenses/expenses.scss','./bank-book.scss']})
export class BankBookPage implements OnInit {
  private readonly api=inject(BankBookService);private readonly auth=inject(AuthService);
  private readonly destroy=inject(DestroyRef);private readonly confirmation=inject(ConfirmationService);
  private read?:Subscription;private key=crypto.randomUUID();private fingerprint='';
  readonly currentDate=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
  readonly currentMonth=this.currentDate.slice(0,7);month=this.currentMonth;
  readonly schoolId=signal<number|null>(null);readonly schoolName=signal('');
  readonly data=signal<BankOverview|null>(null);readonly loading=signal(true);readonly busy=signal(false);
  readonly error=signal('');readonly success=signal('');readonly page=signal(0);
  readonly pageCount=computed(()=>Math.max(1,Math.ceil((this.data()?.rows.length??0)/50)));
  readonly printing=signal(false);
  readonly rows=computed(()=>this.printing()?(this.data()?.rows??[]):(this.data()?.rows.slice(this.page()*50,(this.page()+1)*50)??[]));
  readonly sourceLabels={MANUAL:'Saisie banque',SCHOOL_PAYMENT:'Frais scolaires',EXPENSE:'Dépense',TEACHER_PAYMENT:'Salaire enseignant'};
  opening={date:this.currentDate,amount:null as number|null};
  entry={date:this.currentDate,direction:'IN' as CashDirection,amount:null as number|null,label:'',reference:''};
  ngOnInit():void {
    this.destroy.onDestroy(()=>this.read?.unsubscribe());
    const user=this.auth.user()?.id;if(!user){this.loading.set(false);return;}
    this.auth.getOwnedSchools(user,'BANK_BOOK').pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next:schools=>{const saved=Number(localStorage.getItem('fasoecole_owner_school'));const school=schools.find(s=>s.id===saved)??schools[0];
        if(!school){this.loading.set(false);return;}this.schoolId.set(school.id);this.schoolName.set(school.name);this.load();},
      error:err=>{this.loading.set(false);this.error.set(apiError(err,'Impossible de charger l’établissement.'));},
    });
  }
  load():void {
    const id=this.schoolId();if(id===null||this.busy()||!/^\d{4}-(0[1-9]|1[0-2])$/.test(this.month))return;
    this.read?.unsubscribe();this.loading.set(true);this.error.set('');this.page.set(0);
    this.read=this.api.overview(id,this.month).pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next:d=>{this.data.set(d);this.month=d.month;this.loading.set(false);
        if(this.entry.date.slice(0,7)!==d.month)this.entry.date=d.month===this.currentMonth?this.currentDate:d.month+'-01';
        if(d.book&&this.entry.date<d.book.openedOn)this.entry.date=d.book.openedOn;},
      error:err=>{this.data.set(null);this.loading.set(false);this.error.set(apiError(err,'Impossible de charger le brouillard de banque.'));},
    });
  }
  open():void {
    const id=this.schoolId();if(id===null||this.busy())return;
    if(!this.opening.date||this.opening.date>this.currentDate||!this.validMoney(this.opening.amount,false)){
      this.error.set('Renseignez une date passée ou actuelle et un solde initial avec au maximum deux décimales.');return;}
    this.month=this.opening.date.slice(0,7);
    this.perform(this.api.open(id,this.opening.date,this.opening.amount!),'Brouillard de banque ouvert.');
  }
  saveEntry():void {
    const id=this.schoolId(),book=this.data()?.book;if(id===null||!book||this.busy()||this.loading())return;
    if(!this.entry.date||this.entry.date.slice(0,7)!==this.month||this.entry.date<book.openedOn||this.entry.date>this.currentDate||!this.entry.label.trim()||!this.validMoney(this.entry.amount,true)){
      this.error.set('Renseignez le libellé, un montant positif et une date du mois consulté, entre l’ouverture et aujourd’hui.');return;}
    const payload={date:this.entry.date,direction:this.entry.direction,amount:this.entry.amount!,label:this.entry.label.trim(),reference:this.entry.reference.trim()||null};
    const fingerprint=JSON.stringify({schoolId:id,...payload});if(fingerprint!==this.fingerprint){this.key=crypto.randomUUID();this.fingerprint=fingerprint;}
    this.perform(this.api.add(id,{requestId:this.key,...payload}),'Mouvement bancaire enregistré.',()=>{
      this.entry={...this.entry,amount:null,label:'',reference:''};this.key=crypto.randomUUID();this.fingerprint='';
    });
  }
  async remove(row:CashMovement):Promise<void> {
    const id=this.schoolId();if(id===null||row.source!=='MANUAL'||this.busy()||this.loading())return;
    if(await this.confirmation.confirm({title:'Supprimer le mouvement bancaire',message:row.label,confirmLabel:'Supprimer',destructive:true})&&id===this.schoolId()&&!this.busy())
      this.perform(this.api.delete(id,row.id),'Mouvement supprimé.');
  }
  private perform(action:Observable<void>,message:string,done?:()=>void):void {
    this.busy.set(true);this.error.set('');this.success.set('');
    action.pipe(takeUntilDestroyed(this.destroy)).subscribe({next:()=>{this.busy.set(false);done?.();this.success.set(message);this.load();},
      error:err=>{this.busy.set(false);this.error.set(apiError(err,'Enregistrement impossible. Votre saisie est conservée.'));}});
  }
  private validMoney(value:number|null,positive:boolean):boolean {
    return value!==null&&Number.isFinite(value)&&(!positive||value>0)&&Math.abs(value)<=(positive?9999999999.99:999999999999.99)&&Math.abs(value*100-Math.round(value*100))<.0001;
  }
  @HostListener('window:beforeprint') beforePrint():void{this.printing.set(true);}
  @HostListener('window:afterprint') afterPrint():void{this.printing.set(false);}
  print():void{this.beforePrint();setTimeout(()=>{window.print();this.afterPrint();});}
  exportCsv():void {
    const d=this.data();if(!d||this.loading()||this.busy())return;
    const rows:(string|number)[][]=[['Brouillard de banque',this.schoolName(),d.month],['Solde avant rapprochement bancaire'],['Report initial (FCFA)',d.openingBalance],
      ['Date','Libellé','Référence','Origine','Entrées (FCFA)','Sorties (FCFA)','Solde avant rapprochement (FCFA)'],
      ...d.rows.map(r=>[r.date,r.label,r.reference??'',this.sourceLabels[r.source],r.direction==='IN'?r.amount:'',r.direction==='OUT'?r.amount:'',r.balance]),
      ['Totaux','','','',d.receipts,d.payments,d.closingBalance]];
    const csv=rows.map(row=>row.map(v=>{let text=String(v);if(typeof v==='string'&&/^[=+@-]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';}).join(';')).join('\r\n');
    const url=URL.createObjectURL(new Blob(['\ufeff',csv],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=`brouillard-banque-${this.schoolId()}-${d.month}.csv`;link.click();URL.revokeObjectURL(url);
  }
}
