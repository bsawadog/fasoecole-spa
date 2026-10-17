import { ModuleHelpButton } from '../../../../shared/help/module-help-button';
import { Component, computed, HostListener, inject, OnDestroy, OnInit, signal, ChangeDetectorRef, ElementRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { Observable, Subscription } from 'rxjs';
import { AuthService, RegistrationSchool } from '../../../../core/auth';
import { DateField } from '../../../../shared/ui/date-field';
import { NumberField } from '../../../../shared/ui/number-field';
import { SelectField, SelectOption } from '../../../../shared/ui/select-field';
import { TableRow } from '../../../../shared/ui/table-row';
import { LoadingState } from '../../../../shared/ui/loading-state';
import { FormValidationDirective } from '../../../../shared/form-validation.directive';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';
import { ASSET_CATEGORIES, ASSET_STATUS, CONDITIONS, MOVEMENT_KINDS, OWNERSHIP, STOCK_CATEGORIES,
  Asset, AssetEvent, AssetInput, MovementInput, SchoolResourcesService, StockInput, StockItem, StockMovement } from '../../resources.service';

const options = <T extends Record<string, string>>(labels: T) => Object.entries(labels).map(([value, label]) => ({ value, label }));
const normalize = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const today = () => new Date().toLocaleDateString('en-CA');

@Component({
  selector: 'app-school-resources', standalone: true,
  imports: [ModuleHelpButton, FormsModule, DatePipe, DecimalPipe, ButtonModule, InputTextModule, MessageModule, TableModule, TooltipModule,
    DateField, NumberField, SelectField, SelectOption, TableRow, LoadingState, FormValidationDirective],
  templateUrl: './resources.html', styleUrl: './resources.scss',
})
export class SchoolResourcesPage implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly api = inject(SchoolResourcesService);
  private readonly confirmation = inject(ConfirmationService);
  private readonly changes = inject(ChangeDetectorRef);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly requests = new Subscription();
  private readRequest?: Subscription;
  private detailRequest?: Subscription;
  readonly mode = inject(ActivatedRoute).snapshot.data['resourceKind'] === 'stock' ? 'stock' : 'assets';
  readonly title = this.mode === 'assets' ? 'Patrimoine et mobilier' : 'Stocks et fournitures';
  readonly assetCategories = ASSET_CATEGORIES;
  readonly stockCategories = STOCK_CATEGORIES;
  readonly statusLabels = ASSET_STATUS;
  readonly conditions = CONDITIONS;
  readonly ownership = OWNERSHIP;
  readonly kindLabels = MOVEMENT_KINDS;
  readonly categoryOptions = options(this.mode === 'assets' ? ASSET_CATEGORIES : STOCK_CATEGORIES);
  readonly conditionOptions = options(CONDITIONS);
  readonly statusOptions = options(ASSET_STATUS);
  readonly ownershipOptions = options(OWNERSHIP);
  readonly movementOptions = options(MOVEMENT_KINDS);
  readonly schools = signal<RegistrationSchool[]>([]);
  readonly schoolId = signal<number | null>(null);
  readonly schoolName = computed(() => this.schools().find(item => item.id === this.schoolId())?.name ?? '');
  readonly assets = signal<Asset[]>([]);
  readonly items = signal<StockItem[]>([]);
  readonly search = signal('');
  readonly category = signal('');
  readonly filter = signal('active');
  readonly loading = signal(true);
  readonly ready = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly printing = signal(false);
  readonly panel = signal<'form' | 'movement' | 'history' | null>(null);
  readonly selected = signal<StockItem | Asset | null>(null);
  readonly selectedStock = computed(() => this.mode === 'stock' ? this.selected() as StockItem | null : null);
  readonly historyLoading = signal(false);
  readonly events = signal<AssetEvent[]>([]);
  readonly movements = signal<StockMovement[]>([]);
  readonly currentDate = today();
  readonly filteredAssets = computed(() => this.assets().filter(item => this.matches(item)
    && (this.filter() === 'all' || (this.filter() === 'retired' ? item.status === 'RETIRED'
      : this.filter() === 'maintenance' ? item.status !== 'RETIRED' && (item.status === 'MAINTENANCE' || item.condition === 'DAMAGED' || item.condition === 'UNUSABLE'
        || !!item.maintenanceOn && item.maintenanceOn <= this.currentDate) : item.status !== 'RETIRED'))));
  readonly filteredItems = computed(() => this.items().filter(item => this.matches(item)
    && (this.filter() === 'all' || (this.filter() === 'archived' ? !item.active : this.filter() === 'low' ? item.active && item.quantity <= item.minimumQuantity : item.active))));
  readonly assetValue = computed(() => this.assets().filter(item => item.status !== 'RETIRED' && item.ownership === 'OWNED')
    .reduce((sum, item) => sum + item.quantity * (item.unitValue ?? 0), 0));
  readonly activeAssets = computed(() => this.assets().filter(item => item.status !== 'RETIRED').reduce((sum,item) => sum + item.quantity,0));
  readonly maintenanceCount = computed(() => this.assets().filter(item => item.status !== 'RETIRED' && (item.status === 'MAINTENANCE' || item.condition === 'DAMAGED' || item.condition === 'UNUSABLE' || !!item.maintenanceOn && item.maintenanceOn <= this.currentDate)).length);
  readonly lowCount = computed(() => this.items().filter(item => item.active && item.quantity <= item.minimumQuantity).length);
  readonly activeItemCount = computed(() => this.items().filter(item => item.active).length);
  readonly stockValue = computed(() => this.items().filter(item => item.active).reduce((sum,item) => sum + item.quantity * (item.unitCost ?? 0),0));
  assetForm = this.emptyAsset();
  stockForm = this.emptyStock();
  movementForm = this.emptyMovement();
  private movementFingerprint = '';

  ngOnInit(): void {
    const owner = this.auth.user()?.id;
    if (!owner) { this.loading.set(false); return; }
    this.requests.add(this.auth.getOwnedSchools(owner, this.mode === 'assets' ? 'ASSETS' : 'INVENTORY').subscribe({
      next: schools => {
        this.schools.set(schools);
        this.schoolId.set(schools.find(item => item.id === Number(localStorage.getItem('fasoecole_owner_school')))?.id ?? schools[0]?.id ?? null);
        if (this.schoolId()) this.load(); else this.loading.set(false);
      }, error: () => { this.loading.set(false); this.error.set('Impossible de charger les établissements.'); },
    }));
  }
  ngOnDestroy(): void { this.requests.unsubscribe(); this.readRequest?.unsubscribe(); this.detailRequest?.unsubscribe(); }
  private matches(item: {name: string; code: string; location: string; category: string}) {
    return (!this.category() || item.category === this.category())
      && normalize(`${item.name} ${item.code} ${item.location}`).includes(normalize(this.search().trim()));
  }
  load(): void {
    const school = this.schoolId();
    if (!school || this.busy()) return;
    this.readRequest?.unsubscribe(); this.loading.set(true); this.error.set('');
    const request: Observable<{assets: Asset[]} | {items: StockItem[]}> = this.mode === 'assets' ? this.api.assets(school) : this.api.stock(school);
    this.readRequest = request.subscribe({
      next: data => { if ('assets' in data) this.assets.set(data.assets); else this.items.set(data.items); this.loading.set(false); this.ready.set(true); },
      error: err => { this.loading.set(false); this.fail(err, 'Impossible de charger le registre.'); },
    });
  }
  edit(item?: Asset | StockItem): void {
    if (this.busy()) return;
    this.detailRequest?.unsubscribe(); this.error.set(''); this.success.set('');
    this.selected.set(item ?? null); this.panel.set('form');
    if (this.mode === 'assets') {
      const {id, ...value} = item as Asset ?? {};
      this.assetForm = { ...this.emptyAsset(), ...value, changeReason: '' };
    } else {
      const {id, quantity, ...value} = item as StockItem ?? {};
      this.stockForm = { ...this.emptyStock(), ...value };
    }
    this.focusPanel();
  }
  close(): void { if (!this.busy()) { this.detailRequest?.unsubscribe(); this.panel.set(null); this.selected.set(null); } }
  async save(): Promise<void> {
    const school = this.schoolId();
    if (!school || this.busy()) return;
    if (this.mode === 'assets' && this.selected() && !this.assetForm.changeReason.trim()) { this.error.set('Précisez le motif de la modification.'); return; }
    if (this.mode === 'assets' && this.assetForm.status === 'RETIRED'
        && !await this.confirmation.confirm({title: 'Sortir ce bien du patrimoine ?', message: 'La fiche et son historique seront conservés. Le bien ne sera plus compté dans le patrimoine actif.', confirmLabel: 'Confirmer la sortie', destructive: true})) return;
    if (this.busy()) return;
    this.busy.set(true); this.error.set(''); this.success.set('');
    const request: Observable<Asset | StockItem> = this.mode === 'assets' ? this.api.saveAsset(school, this.assetForm, this.selected()?.id ?? null)
      : this.api.saveStock(school, this.stockForm, this.selected()?.id ?? null);
    this.requests.add(request.subscribe({ next: () => {
      this.busy.set(false); this.panel.set(null); this.selected.set(null);
      this.success.set(this.mode === 'assets' ? 'Fiche du bien enregistrée.' : 'Article enregistré. Utilisez « Mouvement » pour saisir le stock initial ou une réception.'); this.load();
    }, error: err => this.fail(err, 'Impossible d’enregistrer cette fiche. Vérifiez notamment que la référence est unique.') }));
  }
  openMovement(item: StockItem): void {
    if (this.busy() || !item.active) return;
    this.detailRequest?.unsubscribe(); this.selected.set(item); this.panel.set('movement');
    this.movementForm = this.emptyMovement(); this.movementFingerprint = ''; this.error.set(''); this.success.set('');
    this.focusPanel();
  }
  async saveMovement(): Promise<void> {
    const school = this.schoolId(), item = this.selected() as StockItem | null, value = this.movementForm;
    if (!school || !item || this.busy()) return;
    if (value.quantity == null || !Number.isFinite(value.quantity) || value.quantity < 0 || value.kind !== 'COUNT' && value.quantity === 0
        || !value.reason.trim() || value.kind === 'OUT' && !value.recipient.trim()) { this.error.set('Complétez la quantité, le motif et le destinataire de la sortie.'); return; }
    if (value.kind === 'OUT' && value.quantity > item.quantity) { this.error.set('Stock insuffisant pour cette sortie.'); return; }
    if (value.kind === 'COUNT' && !await this.confirmation.confirm({title: 'Valider l’inventaire physique ?',
      message: `Le stock de ${item.name} passera de ${item.quantity} à ${value.quantity} ${item.unit}. L’écart et le motif seront conservés.`, confirmLabel: 'Valider le comptage'})) return;
    if (this.busy()) return;
    const fingerprint = JSON.stringify({ ...value, requestId: undefined });
    if (fingerprint !== this.movementFingerprint) { value.requestId = crypto.randomUUID(); this.movementFingerprint = fingerprint; }
    this.busy.set(true); this.error.set(''); this.success.set('');
    this.requests.add(this.api.move(school, item.id, { ...value }).subscribe({next: () => {
      this.busy.set(false); this.panel.set(null); this.selected.set(null); this.success.set('Mouvement enregistré et stock mis à jour.'); this.load();
    }, error: err => this.fail(err, 'Impossible d’enregistrer le mouvement. Vos valeurs sont conservées pour réessayer.') }));
  }
  history(item: Asset | StockItem): void {
    if (this.busy()) return;
    this.detailRequest?.unsubscribe(); this.selected.set(item); this.panel.set('history'); this.historyLoading.set(true);
    this.events.set([]); this.movements.set([]); this.error.set('');
    this.focusPanel();
    const request: Observable<AssetEvent[] | StockMovement[]> = this.mode === 'assets' ? this.api.assetHistory(this.schoolId()!, item.id) : this.api.movements(this.schoolId()!, item.id);
    this.detailRequest = request.subscribe({ next: data => {
        if (this.mode === 'assets') this.events.set(data as AssetEvent[]); else this.movements.set(data as StockMovement[]);
        this.historyLoading.set(false);
      }, error: err => { this.historyLoading.set(false); this.fail(err, 'Impossible de charger l’historique.'); } });
  }
  eventSummary(event: AssetEvent): string {
    try { const value = JSON.parse(event.snapshot) as Asset; return `${value.location} · ${value.quantity} unité(s) · ${this.conditions[value.condition]} · ${this.statusLabels[value.status]}`; }
    catch { return ''; }
  }
  @HostListener('window:beforeprint') beforePrint(): void { this.printing.set(true); this.changes.detectChanges(); }
  @HostListener('window:afterprint') afterPrint(): void { this.printing.set(false); }
  print(): void { window.print(); }
  exportCsv(): void {
    const rows: unknown[][] = this.mode === 'assets' ? [['Référence','Désignation','Catégorie','Emplacement','Responsable','Détention','État','Statut','Quantité','Valeur unitaire FCFA','Acquisition','Entretien prévu'],
      ...this.filteredAssets().map(item => [item.code,item.name,this.assetCategories[item.category],item.location,item.custodian,this.ownership[item.ownership],this.conditions[item.condition],this.statusLabels[item.status],item.quantity,item.unitValue,item.acquiredOn,item.maintenanceOn])]
      : [['Référence','Article','Catégorie','Emplacement','Unité','Disponible','Seuil minimum','Coût de référence FCFA','Actif'],
        ...this.filteredItems().map(item => [item.code,item.name,this.stockCategories[item.category],item.location,item.unit,item.quantity,item.minimumQuantity,item.unitCost,item.active ? 'Oui' : 'Non'])];
    const cell = (value: unknown) => { let text = String(value ?? ''); if (/^[\s]*[=+@-]/.test(text)) text = "'" + text; return '"' + text.replace(/"/g, '""') + '"'; };
    const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.map(cell).join(';')).join('\r\n')], {type: 'text/csv;charset=utf-8;'}));
    const link = document.createElement('a'); link.href = url; link.download = `${this.mode === 'assets' ? 'patrimoine' : 'stocks'}-${this.schoolId()}-${today()}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url),1000);
  }
  private fail(err: {error?: {message?: string}}, fallback: string): void { this.busy.set(false); this.error.set(err?.error?.message || fallback); }
  private focusPanel(): void { setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('.resources__panel h2')?.focus(),0); }
  private emptyAsset(): AssetInput { return {code:'',name:'',category:'DESK_BENCH',location:'',custodian:'',ownership:'OWNED',condition:'GOOD',status:'IN_USE',quantity:1,unitValue:null,acquiredOn:null,maintenanceOn:null,notes:'',version:null,changeReason:''}; }
  private emptyStock(): StockInput { return {code:'',name:'',category:'TEACHING',unit:'boîte',location:'',minimumQuantity:0,unitCost:null,active:true,notes:'',version:null}; }
  private emptyMovement(): MovementInput { return {requestId:crypto.randomUUID(),kind:'IN',date:today(),quantity:null,reason:'',recipient:'',reference:''}; }
}
