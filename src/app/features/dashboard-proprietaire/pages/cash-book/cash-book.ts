import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectorRef, Component, computed, HostListener, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable, Subscription } from 'rxjs';
import { AuthService, RegistrationSchool } from '../../../../core/auth';
import { FormValidationDirective } from '../../../../shared/form-validation.directive';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';
import { CashBookService, CashDirection, CashMovement, CashOverview } from '../../cash-book.service';

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
};
@Component({
  selector: 'app-cash-book', standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe, FormValidationDirective],
  templateUrl: './cash-book.html', styleUrls: ['../expenses/expenses.scss', './cash-book.scss'],
})
export class CashBookPage implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly api = inject(CashBookService);
  private readonly confirmation = inject(ConfirmationService);
  private readonly changes = inject(ChangeDetectorRef);
  private readonly requests = new Subscription();
  private readRequest?: Subscription;
  private entryKey = crypto.randomUUID();
  private entryFingerprint = '';
  readonly schools = signal<RegistrationSchool[]>([]);
  readonly schoolId = signal<number | null>(null);
  readonly schoolName = computed(() => this.schools().find(s=>s.id===this.schoolId())?.name ?? '');
  readonly printing = signal(false);
  readonly data = signal<CashOverview | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly page = signal(0);
  readonly pageSize = 50;
  readonly pageRows = computed(() => this.data()?.rows.slice(this.page()*this.pageSize,(this.page()+1)*this.pageSize) ?? []);
  readonly pageCount = computed(() => Math.max(1,Math.ceil((this.data()?.rows.length ?? 0)/this.pageSize)));
  readonly editable = computed(() => !!this.data()?.book && !this.data()?.book?.closedOn && !this.data()?.closure && !this.loading());
  readonly hasNegativeBalance = computed(() => (this.data()?.openingBalance ?? 0)<0 || !!this.data()?.rows.some(r=>r.balance<0));
  readonly currentDate = today();
  readonly currentMonth = this.currentDate.slice(0,7);
  readonly sourceLabels = { MANUAL: 'Saisie caisse', SCHOOL_PAYMENT: 'Frais scolaires', EXPENSE: 'Dépense', TEACHER_PAYMENT: 'Salaire enseignant' };
  month = this.currentMonth;
  opening = {date: this.currentDate, amount: null as number | null};
  entry = {date: this.currentDate, direction: 'IN' as CashDirection, amount: null as number | null, label: '', reference: ''};
  countedBalance: number | null = null;
  closureNote = '';
  nextMonth(): void {
    const date=new Date(Number(this.month.slice(0,4)),Number(this.month.slice(5,7)),1);
    const next=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
    if(next<=this.currentMonth && !this.busy() && !this.data()?.book?.closedOn) {this.month=next;this.load();}
  }

  ngOnInit(): void {
    const id = this.auth.user()?.id;
    if (!id) { this.loading.set(false); return; }
    this.requests.add(this.auth.getOwnedSchools(id,'EXPENSES').subscribe({
      next: schools => {
        this.schools.set(schools);
        const stored=Number(localStorage.getItem('fasoecole_owner_school'));
        const school=schools.find(s=>s.id===stored) ?? schools[0];
        if(school) this.selectSchool(school.id); else this.loading.set(false);
      },
      error: () => { this.loading.set(false); this.error.set('Impossible de charger les établissements.'); },
    }));
  }
  selectSchool(id: number): void {
    if(this.busy() || !this.schools().some(s=>s.id===id)) return;
    this.schoolId.set(id); this.auth.selectSchoolContext(id); this.data.set(null); this.month=this.currentMonth;
    this.success.set(''); this.resetEntry(); this.load();
  }
  load(): void {
    const id=this.schoolId();
    if(!id || !/^\d{4}-(0[1-9]|1[0-2])$/.test(this.month)) return;
    this.readRequest?.unsubscribe(); this.loading.set(true); this.error.set(''); this.page.set(0);
    this.countedBalance=null; this.closureNote='';
    this.readRequest=this.api.overview(id,this.month).subscribe({
      next: data => {
        this.data.set(data); this.month=data.month;
        if(this.entry.date.slice(0,7)!==data.month) this.entry.date=data.month===this.currentMonth?this.currentDate:data.month+'-01';
        if(data.book && this.entry.date<data.book.openedOn) this.entry.date=data.book.openedOn;
        this.loading.set(false);
      },
      error: err => {this.data.set(null); this.loading.set(false); this.fail(err,'Impossible de charger le brouillard de caisse.');},
    });
  }
  open(): void {
    const id=this.schoolId(); if(!id || this.busy()) return;
    if(!this.opening.date || this.opening.date>this.currentDate || !this.validMoney(this.opening.amount,false)) {
      this.error.set('Renseignez une date passée ou actuelle et un solde initial positif ou nul.'); return;
    }
    this.month=this.opening.date.slice(0,7);
    this.perform(this.api.open(id,this.opening.date,this.opening.amount!), 'Caisse ouverte.');
  }
  saveEntry(): void {
    const id=this.schoolId(); if(!id || this.busy() || !this.editable()) return;
    if(!this.entry.date || this.entry.date.slice(0,7)!==this.month || this.entry.date>this.currentDate
        || this.entry.date<(this.data()?.book?.openedOn ?? '') || !this.entry.label.trim() || !this.validMoney(this.entry.amount,true)) {
      this.error.set('Renseignez un libellé, un montant supérieur à zéro et une date du mois consulté, entre l’ouverture et aujourd’hui.'); return;
    }
    const payload={date:this.entry.date,direction:this.entry.direction,amount:this.entry.amount!,label:this.entry.label.trim(),reference:this.entry.reference.trim() || null};
    const fingerprint=JSON.stringify({schoolId:id,...payload});
    if(fingerprint!==this.entryFingerprint) {this.entryKey=crypto.randomUUID();this.entryFingerprint=fingerprint;}
    this.perform(this.api.add(id,{requestId:this.entryKey,...payload}), 'Mouvement enregistré.', () => this.resetEntry());
  }
  async remove(row: CashMovement): Promise<void> {
    const id=this.schoolId(); if(!id || row.source!=='MANUAL' || !this.editable() || this.busy()) return;
    const approved=await this.confirmation.confirm({title:'Supprimer le mouvement',message:`Supprimer « ${row.label} » du brouillard de ${this.month} ?`,confirmLabel:'Supprimer',destructive:true});
    if(approved && id===this.schoolId() && this.editable()) this.perform(this.api.delete(id,row.id),'Mouvement supprimé.');
  }
  async close(finalClosure: boolean): Promise<void> {
    const id=this.schoolId(); if(!id || !this.editable() || this.busy()) return;
    const month=this.month;
    if(!this.validMoney(this.countedBalance,false) || Math.abs(this.countedBalance!-this.data()!.closingBalance)>0.001) {
      this.error.set('Comptez les espèces : le montant saisi doit correspondre au solde calculé. En cas d’écart, vérifiez les opérations et saisissez une régularisation justifiée.'); return;
    }
    const amount=this.countedBalance!; const note=this.closureNote.trim() || null;
    const approved=await this.confirmation.confirm({
      title:finalClosure?'Clôturer définitivement la caisse':'Clôturer le mois',
      message:finalClosure?'Cette clôture arrête la caisse et verrouille ses mouvements. La caisse restera consultable.':`Le mois ${month} sera verrouillé. Son solde sera reporté au mois suivant.`,
      confirmLabel:'Clôturer',destructive:finalClosure,
    });
    if(approved && id===this.schoolId() && month===this.month && this.editable())
      this.perform(this.api.close(id,month,amount,note,finalClosure),finalClosure?'Caisse clôturée.':'Mois clôturé. Solde reporté au mois suivant.');
  }
  private perform(operation: Observable<void>,message: string,done?: () => void): void {
    this.busy.set(true);this.error.set('');this.success.set('');
    this.requests.add(operation.subscribe({
      next: () => {this.busy.set(false);done?.();this.success.set(message);this.load();},
      error: err => {this.busy.set(false);this.fail(err,'Impossible d’enregistrer cette opération de caisse.');},
    }));
  }
  private resetEntry(): void {
    this.entry={date:this.currentDate.slice(0,7)===this.month?this.currentDate:this.month+'-01',direction:'IN',amount:null,label:'',reference:''};
    this.entryKey=crypto.randomUUID();this.entryFingerprint='';
  }
  private validMoney(value: number | null,positive: boolean): boolean {
    return value!==null && Number.isFinite(value) && (positive?value>0:value>=0) && value<=(positive?9999999999.99:999999999999.99)
      && Math.abs(value*100-Math.round(value*100))<0.0001;
  }
  private fail(err: {error?:{message?:string}},fallback: string): void {this.error.set(err?.error?.message ?? fallback);}
  @HostListener('window:beforeprint') beforePrint(): void {this.printing.set(true);this.changes.detectChanges();}
  @HostListener('window:afterprint') afterPrint(): void {this.printing.set(false);}
  print(): void {this.beforePrint();window.print();this.afterPrint();}
  exportCsv(): void {
    const data=this.data();if(!data || this.loading()) return;
    const school=this.schools().find(s=>s.id===this.schoolId());
    const rows:(string|number)[][]=[['Brouillard de caisse',school?.name ?? '',data.month],['Report initial (FCFA)',data.openingBalance],
      ['Date','Libellé','Référence','Origine','Entrées (FCFA)','Sorties (FCFA)','Solde (FCFA)'],
      ...data.rows.map(r=>[r.date,r.label,r.reference ?? '',this.sourceLabels[r.source],r.direction==='IN'?r.amount:'',r.direction==='OUT'?r.amount:'',r.balance]),
      ['Totaux','','','',data.receipts,data.payments,data.closingBalance]];
    const csv=rows.map(row=>row.map(value=>{
      let text=String(value);if(typeof value==='string' && /^[=+@-]/.test(text)) text="'"+text;
      return '"'+text.replace(/"/g,'""')+'"';
    }).join(';')).join('\r\n');
    const url=URL.createObjectURL(new Blob(['\ufeff',csv],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download=`brouillard-caisse-${this.schoolId()}-${data.month}.csv`;link.click();URL.revokeObjectURL(url);
  }
  ngOnDestroy(): void {this.requests.unsubscribe();this.readRequest?.unsubscribe();}
}
