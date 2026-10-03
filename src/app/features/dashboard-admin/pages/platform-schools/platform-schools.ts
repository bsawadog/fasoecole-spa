import { Component, DestroyRef, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, debounceTime, merge, of, startWith, switchMap, timer } from 'rxjs';
import { environment } from '../../../../../environments/environment';

interface SchoolRow {
  id: number; name: string; type: string; status: string; ownerId: number;
  ownerName: string; ownerEmail: string | null; ownerPhone: string | null;
  activatedAt: string | null; deactivatedAt: string | null;
}
interface SchoolPage { items: SchoolRow[]; total: number; page: number; size: number; }

@Component({
  selector: 'app-platform-schools', standalone: true, imports: [FormsModule, DatePipe],
  template: `
    <section class="platform">
      <header><div class="eyebrow">ADMINISTRATION DE LA PLATEFORME</div><h1>Établissements</h1>
        <p>Gérez les accès des établissements et contactez leurs propriétaires.</p></header>
      <div class="toolbar">
        <label class="search">Rechercher
          <input type="search" [(ngModel)]="search" (ngModelChange)="searchChanged()" maxlength="200"
            placeholder="École, propriétaire, courriel ou téléphone" /></label>
        <label>Statut<select [(ngModel)]="status" (ngModelChange)="filterChanged()">
          <option value="">Tous les statuts</option><option value="ACTIVE">Actifs</option>
          <option value="SUSPENDED">Désactivés</option><option value="DRAFT">En création</option>
          <option value="ARCHIVED">Archivés</option></select></label>
        <button type="button" class="secondary" (click)="reload.next()" [disabled]="loading()">Actualiser</button>
      </div>
      @if (notice()) { <p class="notice" role="status">{{ notice() }}</p> }
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      <div class="summary">{{ total() }} établissement(s) @if (loading()) { <span>· Chargement…</span> }</div>
      <div class="table-wrap"><table><thead><tr><th>Établissement</th><th>Propriétaire</th><th>Statut</th>
        <th>Dernière activation</th><th>Dernière désactivation</th><th>Actions</th></tr></thead><tbody>
        @for (school of rows(); track school.id) {
          <tr><td><strong>{{ school.name }}</strong><small>{{ typeLabel(school.type) }}</small></td>
            <td>{{ school.ownerName }}<small>{{ school.ownerEmail || 'Courriel non renseigné' }}</small></td>
            <td><span class="badge" [class.active]="school.status === 'ACTIVE'">{{ statusLabel(school.status) }}</span></td>
            <td>{{ school.activatedAt ? (school.activatedAt | date:'dd/MM/yyyy HH:mm') : '—' }}</td>
            <td>{{ school.deactivatedAt ? (school.deactivatedAt | date:'dd/MM/yyyy HH:mm') : '—' }}</td>
            <td><div class="actions"><button type="button" [class.danger]="school.status === 'ACTIVE'"
              [disabled]="saving()" (click)="confirmation.set(school)">{{ school.status === 'ACTIVE' ? 'Désactiver' : 'Activer' }}</button>
              <button type="button" class="secondary" (click)="contact.set(school)">Contacter</button></div></td></tr>
        } @empty { <tr><td colspan="6">{{ loading() ? 'Chargement des établissements…' : 'Aucun établissement ne correspond à la recherche.' }}</td></tr> }
      </tbody></table></div>
      <footer><span>Page {{ page + 1 }} / {{ pageCount() }}</span><div class="actions">
        <button class="secondary" type="button" (click)="changePage(-1)" [disabled]="page === 0 || loading()">Précédente</button>
        <button class="secondary" type="button" (click)="changePage(1)" [disabled]="(page + 1) * size >= total() || loading()">Suivante</button></div></footer>
    </section>
    @if (confirmation(); as school) {
      <div class="overlay"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="activation-title">
        <h2 id="activation-title">{{ school.status === 'ACTIVE' ? 'Désactiver' : 'Activer' }} {{ school.name }} ?</h2>
        <p>{{ school.status === 'ACTIVE' ? 'L’établissement sera suspendu. Ses données seront conservées.' : 'L’établissement sera actif et disponible pour les inscriptions.' }}</p>
        @if (actionError()) { <p class="error" role="alert">{{ actionError() }}</p> }
        <div class="actions"><button type="button" class="secondary" (click)="confirmation.set(null); actionError.set('')" [disabled]="saving()">Annuler</button>
          <button type="button" (click)="saveStatus(school)" [disabled]="saving()">{{ saving() ? 'Enregistrement…' : 'Confirmer' }}</button></div>
      </section></div>
    }
    @if (contact(); as school) {
      <div class="overlay"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="contact-title">
        <h2 id="contact-title">Contacter {{ school.ownerName }}</h2><p>{{ school.name }}</p>
        <div class="contact-links">
          @if (school.ownerEmail) { <a [href]="'mailto:' + school.ownerEmail">Envoyer un courriel · {{ school.ownerEmail }}</a> }
          @if (school.ownerPhone) { <a [href]="'tel:' + school.ownerPhone">Appeler · {{ school.ownerPhone }}</a> }
          @if (!school.ownerEmail && !school.ownerPhone) { <p>Aucune coordonnée disponible.</p> }
        </div><button type="button" class="secondary" (click)="contact.set(null)">Fermer</button>
      </section></div>
    }
  `,
  styles: [`
    :host{display:block;color:#19352d}.platform{max-width:1500px;margin:auto;padding:12px}
    header{margin-bottom:28px}.eyebrow{font-size:11px;font-weight:700;letter-spacing:.12em;color:#23815c}h1{font-size:30px;margin:8px 0}header p{color:#64756e}
    .toolbar{display:flex;align-items:end;gap:16px;background:#fff;border:1px solid #e2eae5;border-radius:16px;padding:20px}.search{flex:1}
    label{display:grid;gap:7px;font-size:13px;font-weight:600}input,select{padding:12px;border:1px solid #d7e3db;border-radius:9px;font:inherit;min-width:180px}input{width:100%;box-sizing:border-box}
    button{background:#19764f;color:white;border:1px solid transparent;border-radius:9px;padding:10px 14px;cursor:pointer;font:inherit;font-size:13px;font-weight:600}button:disabled{opacity:.5;cursor:default}.secondary{background:#fff;border-color:#d7e3db;color:#274b3b}.danger{background:#fff3f1;color:#a5392d;border-color:#f2d2ce}
    .summary{margin:22px 0 12px;color:#64756e;font-size:13px}.table-wrap{overflow:auto;background:white;border:1px solid #e2eae5;border-radius:14px}table{border-collapse:collapse;width:100%;font-size:13px}th{text-align:left;background:#f5f9f6;color:#62766b;font-size:12px}td,th{padding:17px 16px;border-bottom:1px solid #edf1ee}small{display:block;color:#718278;margin-top:5px}.actions{display:flex;gap:8px;white-space:nowrap}.badge{display:inline-block;padding:5px 10px;border-radius:20px;background:#f4eae6;color:#8a5141}.badge.active{background:#e4f4eb;color:#19764f}footer{display:flex;justify-content:space-between;align-items:center;margin-top:18px;font-size:13px}
    .notice{background:#e4f4eb;padding:14px;border-radius:9px}.error{background:#fff0ed;color:#a5392d;padding:14px;border-radius:9px}.overlay{position:fixed;inset:0;background:#132b2355;display:grid;place-items:center;z-index:1000;padding:20px}.dialog{background:#fff;border-radius:18px;padding:28px;max-width:500px;width:100%;box-sizing:border-box;box-shadow:0 20px 60px #132b2333}.dialog h2{font-size:21px;margin-top:0}.dialog p{line-height:1.6}.contact-links{display:grid;gap:16px;margin:22px 0}.contact-links a{color:#19764f;overflow-wrap:anywhere} @media(max-width:700px){.toolbar{flex-direction:column;align-items:stretch}.platform{padding:0}footer{gap:12px;flex-wrap:wrap}}
  `],
})
export class PlatformSchools {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly endpoint = `${environment.apiUrl}/platform/schools`;
  readonly reload = new Subject<void>();
  private readonly searchInput = new Subject<void>();
  readonly rows = signal<SchoolRow[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly actionError = signal('');
  readonly notice = signal('');
  readonly confirmation = signal<SchoolRow | null>(null);
  readonly contact = signal<SchoolRow | null>(null);
  search = ''; status = ''; page = 0; readonly size = 20;
  constructor() {
    merge(this.reload, this.searchInput.pipe(debounceTime(300)), timer(20_000,20_000)).pipe(
      startWith(undefined),
      switchMap(() => {
        this.loading.set(true); this.error.set('');
        return this.http.get<SchoolPage>(this.endpoint, {params:{search:this.search.trim(),status:this.status,page:this.page,size:this.size}})
          .pipe(catchError(() => { this.error.set('Impossible de charger les établissements.'); return of(null); }));
      }), takeUntilDestroyed(this.destroyRef),
    ).subscribe(result => {
      this.loading.set(false);
      if (result) { this.rows.set(result.items); this.total.set(result.total); }
    });
  }
  searchChanged(): void { this.page=0; this.searchInput.next(); }
  filterChanged(): void { this.page=0; this.reload.next(); }
  changePage(delta:number): void { this.page+=delta; this.reload.next(); }
  pageCount(): number { return Math.max(1,Math.ceil(this.total()/this.size)); }
  statusLabel(status:string): string { return ({ACTIVE:'Actif',SUSPENDED:'Désactivé',DRAFT:'En création',ARCHIVED:'Archivé'} as Record<string,string>)[status] ?? status; }
  typeLabel(type:string): string { return ({PRESCOLAIRE:'Préscolaire',PRIMAIRE:'Primaire',SECONDAIRE:'Secondaire',MIXTE:'Établissement mixte',UNIVERSITE:'Université',FORMATION:'Centre de formation'} as Record<string,string>)[type] ?? type; }
  saveStatus(school:SchoolRow): void {
    if (this.saving()) return;
    this.saving.set(true); this.actionError.set('');
    const active=school.status !== 'ACTIVE';
    this.http.patch<void>(`${this.endpoint}/${school.id}/activation`,{active}).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next:()=>{ this.saving.set(false);this.confirmation.set(null);this.notice.set(`${school.name} : établissement ${active ? 'activé' : 'désactivé'}.`);this.reload.next(); },
      error:()=>{ this.saving.set(false);this.actionError.set('La modification a échoué. Réessayez.'); },
    });
  }
}
