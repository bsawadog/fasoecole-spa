import { ErrorAlert } from '../../../../shared/error-alert';
import { Component, inject, input, output, OnInit, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { Subscription } from 'rxjs';
import { NumberField } from '../../../../shared/ui/number-field';
import { PayrollService, PayrollEmployee, PayrollCalculationInput, PayrollCalculationPreview } from '../../payroll.service';

@Component({
  selector:'app-payroll-calculator',standalone:true,imports:[ErrorAlert, FormsModule,DecimalPipe,ButtonModule,NumberField],
  templateUrl:'./payroll-calculator.html',styleUrl:'./payroll-calculator.scss',
})
export class PayrollCalculator implements OnInit,OnDestroy {
  readonly school=input.required<number>(); readonly month=input.required<string>(); readonly employee=input.required<PayrollEmployee>();
  readonly saved=output<void>(); readonly cancelled=output<void>(); readonly working=output<boolean>();
  private readonly api=inject(PayrollService); private readonly requests=new Subscription();
  readonly busy=signal(false); readonly loading=signal(true); readonly error=signal(''); readonly preview=signal<PayrollCalculationPreview|null>(null);
  form:PayrollCalculationInput={regime:'SALARIED',baseSalary:0,housing:0,functionAllowance:0,transport:0,benefitsInKind:0,pension:0,otherSocial:0,otherDeductions:0,employerContributions:0,upperCategory:false,familyCharges:0,tpaExempt:null,approvedManagementCenter:false,reason:''};
  private previewInput:PayrollCalculationInput|null=null; private requestId='';
  readonly fields=[['baseSalary','Salaire de base compris dans le brut'],['housing','Indemnité de logement comprise dans le brut'],['functionAllowance','Indemnité de fonction comprise dans le brut'],['transport','Indemnité de transport comprise dans le brut'],['benefitsInKind','Avantages en nature, hors brut en espèces'],['pension','Retenue retraite salariale effective'],['otherSocial','Autres cotisations salariales effectives'],['otherDeductions','Avances et autres retenues justifiées'],['employerContributions','Autres cotisations patronales']] as const;
  ngOnInit():void {
    this.form.baseSalary=this.employee().due;
    this.requests.add(this.api.calculationDefaults(this.school(),this.employee().userId,this.month()).subscribe({next:value=>{
      if(value) this.form={...value,reason:''};this.loading.set(false);
    },error:()=>{this.loading.set(false);this.error.set('Les paramètres précédents sont indisponibles. Renseignez les informations du mois.');}}));
  }
  ngOnDestroy():void {this.requests.unsubscribe();this.working.emit(false);}
  private setBusy(value:boolean):void {this.busy.set(value);this.working.emit(value);}
  changed():void {this.preview.set(null);this.previewInput=null;this.requestId='';this.error.set('');}
  regimeChanged():void {
    if(this.form.regime==='TEACHING_VACATION') Object.assign(this.form,{baseSalary:0,housing:0,functionAllowance:0,transport:0,benefitsInKind:0,pension:0,otherSocial:0,familyCharges:0,upperCategory:false});
    this.changed();
  }
  calculate():void {
    if(this.busy()||this.loading())return;
    this.changed();this.setBusy(true);const input={...this.form};
    this.requests.add(this.api.previewCalculation(this.school(),this.employee().userId,this.month(),input).subscribe({next:value=>{
      this.previewInput=input;this.preview.set(value);this.requestId=crypto.randomUUID();this.setBusy(false);
    },error:err=>this.fail(err,'Impossible de calculer la paie. Vérifiez les informations saisies.')}));
  }
  save():void {
    const preview=this.preview(),input=this.previewInput;
    if(!preview||!input||this.busy())return;
    if(JSON.stringify(input)!==JSON.stringify(this.form)){this.changed();this.error.set('Les paramètres ont changé. Recalculez l’aperçu.');return;}
    this.setBusy(true);this.error.set('');
    this.requests.add(this.api.applyCalculation(this.school(),this.employee().userId,this.month(),{input,requestId:this.requestId,versions:preview.versions,grossByPayable:preview.grossByPayable}).subscribe({next:()=>{this.setBusy(false);this.saved.emit();},error:err=>this.fail(err,'Impossible de valider la paie. Actualisez la fiche et recalculez si elle a changé.')}));
  }
  private fail(err:{error?:{message?:string}},fallback:string):void {this.setBusy(false);this.error.set(err?.error?.message||fallback);}
}
