import { TooltipModule } from 'primeng/tooltip';
import { DateField } from '../../../../shared/ui/date-field';
import { NumberField } from '../../../../shared/ui/number-field';
import { SelectField } from '../../../../shared/ui/select-field';
import { SelectOption } from '../../../../shared/ui/select-field';
import { LoadingState } from '../../../../shared/ui/loading-state';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, input, output, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable, Subscription, forkJoin, switchMap } from 'rxjs';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';
import { FormValidationDirective } from '../../../../shared/form-validation.directive';
import { ExpenseCategory, ExpenseTaxDetails } from '../../expenses.service';
import { METHOD_LABELS, PaymentMethod } from '../../finance.service';
import { PayableOverview, PayablePayment, PayableRow, PayablesService } from '../../payables.service';

const date = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
export const PAYABLE_STATUS = { UNPAID: 'À payer', PARTIAL: 'Partiellement payée', PAID: 'Soldée', CANCELLED: 'Annulée', NOT_DUE: 'Aucun montant dû' };
export const PAYABLE_SOURCE = { MANUAL: 'Dépense ponctuelle', FIXED: 'Charge fixe', STAFF_SALARY: 'Salaire du personnel', TEACHER_SALARY: 'Salaire enseignant', TAX:'Impôt / taxe' };

@Component({
  selector: 'app-payables', standalone: true,
  imports: [TooltipModule, DateField, NumberField, SelectField, SelectOption, LoadingState, InputTextModule, ButtonModule, MessageModule, FormsModule, DatePipe, DecimalPipe, FormValidationDirective],
  templateUrl: './payables.html', styleUrl: './payables.scss',
})
export class Payables implements OnDestroy {
  readonly schoolId = input.required<number>();
  readonly salariesOnly = input(false);
  readonly mode = input<'all' | 'manual' | 'fixed' | 'list'>('all');
  readonly saved = output<void>();
  readonly formOnly = computed(() => this.mode() === 'manual' || this.mode() === 'fixed');
  private readonly api = inject(PayablesService);
  private readonly confirmation = inject(ConfirmationService);
  private requests = new Subscription();
  private detailRequest?: Subscription;
  readonly data = signal<PayableOverview | null>(null);
  readonly categories = signal<ExpenseCategory[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly selected = signal<PayableRow | null>(null);
  readonly history = signal<PayablePayment[]>([]);
  readonly historyLoading = signal(false);
  readonly historyError = signal('');
  readonly status = PAYABLE_STATUS;
  readonly sources = PAYABLE_SOURCE;
  readonly methods = Object.keys(METHOD_LABELS) as PaymentMethod[];
  readonly methodLabels = METHOD_LABELS;
  readonly today = date();
  readonly manualCategories = computed(() => this.categories().filter(c => c.active && c.systemCode !== 'PAYROLL'));
  month = date().slice(0,7);
  search = '';
  filter = 'OPEN';
  formKind: 'manual' | 'fixed' | null = null;
  taxes:{label:string;amount:number}[]=[];
  taxInvoice={invoiceNumber:'',invoiceDate:'',supplierIfu:''};
  taxTotal():number{return Math.round(this.taxes.reduce((sum,tax)=>sum+Number(tax.amount||0),0)*100)/100;}
  addTax():void{if(this.taxes.length<20)this.taxes.push({label:this.taxes.length===0?'TVA':'',amount:0});}
  form = this.emptyForm();
  pay = this.emptyPayment();
  private requestId = '';
  private paymentFingerprint = '';

  constructor() {
    effect(() => {
      const school = this.schoolId(); this.salariesOnly(); this.mode();
      this.requests.unsubscribe(); this.requests = new Subscription();
      this.busy.set(false); this.data.set(null); this.categories.set([]); this.closeDetail(); this.formKind = null;
      if (school) this.load(true);
    });
  }
  ngOnDestroy() { this.requests.unsubscribe(); this.detailRequest?.unsubscribe(); }
  load(prepare = false) {
    const school = this.schoolId(), month = this.month, salaries = this.salariesOnly();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) { this.error.set('Choisissez un mois valide.'); return; }
    this.loading.set(true); this.data.set(null); this.error.set(''); this.closeDetail(); this.formKind = null;
    this.requests.unsubscribe(); this.requests = new Subscription();
    const load = () => forkJoin({ data: this.api.overview(school,month,salaries), categories: this.api.categories(school) });
    const request = prepare ? this.api.prepare(school,month).pipe(switchMap(load)) : load();
    this.requests.add(request.subscribe({
      next: result => { this.data.set(result.data); this.categories.set(result.categories); this.loading.set(false); if(this.formOnly()) { const message=this.success(); this.openForm(this.mode() === 'fixed' ? 'fixed' : 'manual'); this.success.set(message); } },
      error: err => { this.loading.set(false); this.data.set(null); this.fail(err,'Impossible de charger les dépenses à payer.'); },
    }));
  }
  rows(): PayableRow[] {
    const query = this.search.trim().toLocaleLowerCase();
    return (this.data()?.rows ?? []).filter(r =>
      (this.filter === 'ALL' || this.filter === 'OPEN' && r.remaining > 0 && r.status !== 'CANCELLED'
        || this.filter === 'OVERDUE' && r.overdue || this.filter === r.status)
      && `${r.label} ${r.supplier ?? ''} ${r.categoryName}`.toLocaleLowerCase().includes(query));
  }
  openForm(kind: 'manual' | 'fixed') {
    this.closeDetail(); this.formKind = kind; this.form = this.emptyForm();
    this.taxes=[];this.taxInvoice={invoiceNumber:"",invoiceDate:"",supplierIfu:""};
    this.form.categoryId = this.manualCategories()[0]?.id ?? 0; this.error.set(''); this.success.set('');
  }
  save() {
    if (this.busy() || !this.formKind) return;
    const f = this.form, school = this.schoolId();
    if (!f.label.trim() || !f.categoryId || f.amount == null || f.amount <= 0) { this.error.set('Renseignez le libellé, la catégorie et un montant positif.'); return; }
    if(this.taxes.some(t=>!t.label.trim()||!Number.isFinite(Number(t.amount))||Number(t.amount)<=0)||this.taxTotal()>f.amount){this.error.set('Vérifiez les taxes : montants positifs et total des taxes inférieur ou égal au TTC.');return;}
    const taxDetails:ExpenseTaxDetails|null=this.taxes.length?{invoiceNumber:this.formKind==='manual'?(this.taxInvoice.invoiceNumber.trim()||null):null,invoiceDate:this.formKind==='manual'?(this.taxInvoice.invoiceDate||null):null,supplierIfu:this.taxInvoice.supplierIfu.trim()||null,excludingTax:Math.round((f.amount-this.taxTotal())*100)/100,taxes:this.taxes.map(t=>({label:t.label.trim(),amount:Number(t.amount)}))}:null;
    const common = { ...(taxDetails?{taxDetails}:{}), categoryId: Number(f.categoryId), label: f.label.trim(), supplier: f.supplier.trim() || null, amount: f.amount };
    const request = this.formKind === 'fixed' ? this.api.fixed(school,{...common,dueDay: f.dueDay,startMonth:this.month})
      : this.api.create(school,{...common,dueDate:f.dueDate,notes:f.notes.trim()||null});
    const targetMonth = this.formKind === 'manual' ? f.dueDate.slice(0,7) : this.month;
    this.run(request,'Dépense enregistrée.', () => { this.formKind = null; this.month = targetMonth; if(this.mode() !== 'manual') this.load(true); this.saved.emit(); });
  }
  openDetail(row: PayableRow) {
    this.detailRequest?.unsubscribe(); this.formKind = null; this.selected.set(row); this.history.set([]);
    this.historyLoading.set(true); this.historyError.set(''); this.error.set(''); this.success.set('');
    this.pay = { ...this.emptyPayment(), amount: row.remaining }; this.requestId = ''; this.paymentFingerprint = '';
    this.detailRequest = this.api.payments(this.schoolId(),row.id).subscribe({
      next: rows => { this.history.set(rows); this.historyLoading.set(false); },
      error: err => { this.historyLoading.set(false); this.historyError.set(err?.error?.message ?? 'Impossible de charger les versements.'); },
    });
  }
  closeDetail() { this.detailRequest?.unsubscribe(); this.selected.set(null); this.history.set([]); this.historyLoading.set(false); this.historyError.set(''); }
  recordPayment() {
    const row = this.selected(), school = this.schoolId();
    if (!row || this.busy()) return;
    if (!this.pay.amount || this.pay.amount > row.remaining) { this.error.set('Le paiement doit être positif et ne pas dépasser le reste à payer.'); return; }
    const content = {amount:this.pay.amount,date:this.pay.date,method:this.pay.method,reference:this.pay.reference.trim()||null};
    const fingerprint = JSON.stringify(content);
    if (!this.requestId || fingerprint !== this.paymentFingerprint) { this.requestId = crypto.randomUUID(); this.paymentFingerprint = fingerprint; }
    this.run(this.api.pay(school,row.id,{...content,requestId:this.requestId}),'Paiement enregistré.',() => {
      this.closeDetail(); this.load();
    });
  }
  async cancel(row: PayableRow) {
    if (this.busy()) return;
    const school = this.schoolId();
    const accepted = await this.confirmation.confirm({title:'Annuler la dépense',message:`Annuler « ${row.label} » ? Aucun paiement ne sera enregistré.`,confirmLabel:'Annuler la dépense',destructive:true});
    if (accepted && this.schoolId() === school) this.run(this.api.cancel(school,row.id),'Dépense annulée.',() => this.load());
  }
  toggleFixed(id: number, active: boolean) {
    if (this.busy()) return;
    this.run(this.api.setFixedActive(this.schoolId(),id,active),active ? 'Charge réactivée.' : 'Charge arrêtée pour les prochaines préparations. Les échéances existantes sont conservées.',() => this.load());
  }
  canCancel(row: PayableRow) { return row.paid === 0 && row.status !== 'CANCELLED' && (row.source === 'MANUAL' || row.source === 'FIXED'); }
  private run(request: Observable<unknown>,message: string,after: () => void) {
    this.busy.set(true); this.error.set(''); this.success.set('');
    this.requests.add(request.subscribe({next: () => { this.busy.set(false); this.success.set(message); after(); },error: err => this.fail(err,'Impossible d’enregistrer cette opération.')}));
  }
  private fail(err: {error?:{message?:string}},fallback: string) { this.busy.set(false); this.error.set(err?.error?.message ?? fallback); }
  private emptyForm() { return {categoryId:0,label:'',supplier:'',amount:null as number|null,dueDate:this.month+'-01',dueDay:5,notes:''}; }
  private emptyPayment() { return {amount:null as number|null,date:date(),method:'CASH' as PaymentMethod,reference:''}; }
}
