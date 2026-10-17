import { ModuleHelpButton } from '../../../../shared/help/module-help-button';
import { SelectField } from '../../../../shared/ui/select-field';
import { SelectOption } from '../../../../shared/ui/select-field';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../../core/auth';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, debounceTime, merge, of, startWith, switchMap, timer } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { AppointmentCounter } from '../../../../shared/appointments/appointment-counter';

interface SchoolRow {
  id: number; name: string; type: string; status: string; ownerId: number;
  ownerName: string; ownerEmail: string | null; ownerPhone: string | null;
  submittedAt: string | null; activatedAt: string | null; deactivatedAt: string | null;
  address: string | null; expectedStudentCount: number | null; expectedClassCount: number | null; expectedTeacherCount: number | null;
}
interface SchoolPage { items: SchoolRow[]; total: number; page: number; size: number; }

@Component({
  selector: 'app-platform-schools', standalone: true, imports: [ModuleHelpButton, SelectField, SelectOption, InputTextModule, ButtonModule, MessageModule, FormsModule, DatePipe, AppointmentCounter],
  template: `
    <section class="platform">
      <header class="module-help-header ui-page-header">
    <app-module-help /><div class="eyebrow">ADMINISTRATION DE LA PLATEFORME</div><h1>Établissements</h1>
        <p>Gérez les accès des établissements et contactez leurs propriétaires.</p></header>
      <app-appointment-counter profile="personal" pageLink="/admin/mes-rendez-vous" />
      <div class="toolbar">
        <label class="search">Rechercher
          <input pInputText type="search" [(ngModel)]="search" (ngModelChange)="searchChanged()" maxlength="200"
            placeholder="École, propriétaire, courriel ou téléphone" /></label>
        <label>Statut<app-select-field [(ngModel)]="status" (ngModelChange)="filterChanged()" [ariaLabel]="(&quot;Statut&quot;).trim()">
          <app-select-option [value]="&quot;&quot;" [label]="(&quot;Tous les statuts&quot;).trim()" /><app-select-option [value]="&quot;ACTIVE&quot;" [label]="(&quot;Actifs&quot;).trim()" />
          <app-select-option [value]="&quot;SUSPENDED&quot;" [label]="(&quot;Désactivés&quot;).trim()" /><app-select-option [value]="&quot;DRAFT&quot;" [label]="(&quot;En création&quot;).trim()" />
          <app-select-option [value]="&quot;PENDING_APPROVAL&quot;" [label]="(&quot;En attente de validation&quot;).trim()" /><app-select-option [value]="&quot;ARCHIVED&quot;" [label]="(&quot;Archivés&quot;).trim()" /></app-select-field></label>
        <button pButton severity="secondary" variant="outlined" type="button" class="secondary" (click)="reload.next()" [disabled]="loading()">Actualiser</button>
      </div>
      @if (notice()) { <p-message severity="success" class="notice" role="status">{{ notice() }}</p-message> }
      @if (error()) { <p-message severity="error" class="error" role="alert">{{ error() }}</p-message> }
      <div class="summary">{{ total() }} établissement(s) @if (loading()) { <span>· Chargement…</span> }</div>
      <div class="table-wrap"><table><thead><tr><th>Établissement</th><th>Propriétaire</th><th>Statut</th>
        <th>Dernière activation</th><th>Dernière désactivation</th><th>Actions</th></tr></thead><tbody>
        @for (school of rows(); track school.id) {
          <tr><td><strong>{{ school.name }}</strong><small>{{ typeLabel(school.type) }}</small><small>{{ school.address }}</small>
            @if (school.expectedClassCount !== null) { <small>Prévu : {{ school.expectedStudentCount }} élèves / étudiants · {{ school.expectedClassCount }} classes · {{ school.expectedTeacherCount }} enseignants</small> }
          </td>
            <td>{{ school.ownerName }}<small>{{ school.ownerEmail || 'Courriel non renseigné' }}</small></td>
            <td><span class="badge" [class.active]="school.status === 'ACTIVE'">{{ statusLabel(school.status) }}</span>@if (school.submittedAt) { <small>Soumis le {{ school.submittedAt | date:'dd/MM/yyyy HH:mm' }}</small> }</td>
            <td>{{ school.activatedAt ? (school.activatedAt | date:'dd/MM/yyyy HH:mm') : '—' }}</td>
            <td>{{ school.deactivatedAt ? (school.deactivatedAt | date:'dd/MM/yyyy HH:mm') : '—' }}</td>
            <td><div class="actions"><button pButton type="button" [class.danger]="school.status === 'ACTIVE'"
              [disabled]="saving() || school.status === 'DRAFT'" (click)="confirmation.set(school)">{{ school.status === 'ACTIVE' ? 'Désactiver' : school.status === 'PENDING_APPROVAL' ? 'Valider et activer' : 'Activer' }}</button>
              <button pButton severity="secondary" variant="outlined" type="button" class="secondary" (click)="openSchool(school.id)">Ouvrir l’espace</button><button pButton severity="secondary" variant="outlined" type="button" class="secondary" (click)="contact.set(school)">Contacter</button></div></td></tr>
        } @empty { <tr><td colspan="6">{{ loading() ? 'Chargement des établissements…' : 'Aucun établissement ne correspond à la recherche.' }}</td></tr> }
      </tbody></table></div>
      <footer><span>Page {{ page + 1 }} / {{ pageCount() }}</span><div class="actions">
        <button pButton severity="secondary" variant="outlined" class="secondary" type="button" (click)="changePage(-1)" [disabled]="page === 0 || loading()">Précédente</button>
        <button pButton severity="secondary" variant="outlined" class="secondary" type="button" (click)="changePage(1)" [disabled]="(page + 1) * size >= total() || loading()">Suivante</button></div></footer>
    </section>
    @if (confirmation(); as school) {
      <div class="overlay"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="activation-title">
        <h2 id="activation-title">{{ school.status === 'ACTIVE' ? 'Désactiver' : 'Activer' }} {{ school.name }} ?</h2>
        <p>{{ school.status === 'ACTIVE' ? 'L’établissement sera suspendu. Ses données seront conservées.' : 'L’établissement sera actif et disponible pour les inscriptions.' }}</p>
        @if (actionError()) { <p-message severity="error" class="error" role="alert">{{ actionError() }}</p-message> }
        <div class="actions"><button pButton severity="secondary" variant="outlined" type="button" class="secondary" (click)="confirmation.set(null); actionError.set('')" [disabled]="saving()">Annuler</button>
          <button pButton type="button" (click)="saveStatus(school)" [disabled]="saving()">{{ saving() ? 'Enregistrement…' : 'Confirmer' }}</button></div>
      </section></div>
    }
    @if (contact(); as school) {
      <div class="overlay"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="contact-title">
        <h2 id="contact-title">Contacter {{ school.ownerName }}</h2><p>{{ school.name }}</p>
        <div class="contact-links">
          @if (school.ownerEmail) { <a [href]="'mailto:' + school.ownerEmail">Envoyer un courriel · {{ school.ownerEmail }}</a> }
          @if (school.ownerPhone) { <a [href]="'tel:' + school.ownerPhone">Appeler · {{ school.ownerPhone }}</a> }
          @if (!school.ownerEmail && !school.ownerPhone) { <p>Aucune coordonnée disponible.</p> }
        </div><button pButton severity="secondary" variant="outlined" type="button" class="secondary" (click)="contact.set(null)">Fermer</button>
      </section></div>
    }
  `,
  styles: [`@layer legacy {
    :host{display:block;color:var(--theme-ink, #19352d)}.platform{max-width:1500px;margin:auto;padding:12px}
    header{margin-bottom:28px}.eyebrow{font-size:11px;font-weight:700;letter-spacing:.12em;color:var(--theme-accent, #23815c)}h1{font-size:30px;margin:8px 0}header p{color:var(--theme-muted, #64756e)}
    .toolbar{display:flex;align-items:end;gap:16px;background:var(--theme-surface, #fff);border:1px solid var(--theme-border, #e2eae5);border-radius:16px;padding:20px}.search{flex:1}
    label{display:grid;gap:7px;font-size:13px;font-weight:600}input,select{padding:12px;border:1px solid var(--theme-control-border, #d7e3db);border-radius:9px;font:inherit;min-width:180px}input{width:100%;box-sizing:border-box}
    button{background:var(--theme-link, #19764f);color:var(--theme-button-ink, white);border:1px solid transparent;border-radius:9px;padding:10px 14px;cursor:pointer;font:inherit;font-size:13px;font-weight:600}button:disabled{opacity:.5;cursor:default}.secondary{background:var(--theme-surface, #fff);border-color:var(--theme-control-border, #d7e3db);color:var(--theme-ink, #274b3b)}.danger{background:var(--theme-danger-soft, #fff3f1);color:var(--theme-danger, #a5392d);border-color:var(--theme-danger-border, #f2d2ce)}
    .summary{margin:22px 0 12px;color:var(--theme-muted, #64756e);font-size:13px}.table-wrap{overflow:auto;background:var(--theme-surface, white);border:1px solid var(--theme-border, #e2eae5);border-radius:14px}table{border-collapse:collapse;width:100%;font-size:13px}th{text-align:left;background:var(--theme-inset, #f5f9f6);color:var(--theme-muted, #62766b);font-size:12px}td,th{padding:17px 16px;border-bottom:1px solid var(--theme-border, #edf1ee)}small{display:block;color:var(--theme-muted, #718278);margin-top:5px}.actions{display:flex;gap:8px;white-space:nowrap}.badge{display:inline-block;padding:5px 10px;border-radius:20px;background:var(--theme-soft, #f4eae6);color:var(--theme-warning, #8a5141)}.badge.active{background:var(--theme-success-soft, #e4f4eb);color:var(--theme-link, #19764f)}footer{display:flex;justify-content:space-between;align-items:center;margin-top:18px;font-size:13px}
    .notice{background:var(--theme-success-soft, #e4f4eb);padding:14px;border-radius:9px}.error{background:var(--theme-danger-soft, #fff0ed);color:var(--theme-danger, #a5392d);padding:14px;border-radius:9px}.overlay{position:fixed;inset:0;background:#132b2355;display:grid;place-items:center;z-index:1000;padding:20px}.dialog{background:var(--theme-surface, #fff);border-radius:18px;padding:28px;max-width:500px;width:100%;box-sizing:border-box;box-shadow:0 20px 60px #132b2333}.dialog h2{font-size:21px;margin-top:0}.dialog p{line-height:1.6}.contact-links{display:grid;gap:16px;margin:22px 0}.contact-links a{color:var(--theme-link, #19764f);overflow-wrap:anywhere} @media(max-width:700px){.toolbar{flex-direction:column;align-items:stretch}.platform{padding:0}footer{gap:12px;flex-wrap:wrap}}
   }`],
})
export class PlatformSchools {
 private auth = inject(AuthService); private router = inject(Router);
 openSchool(id:number):void {this.http.post(environment.apiUrl+'/support/school-access/'+id,{}).subscribe({next:()=>{this.auth.selectSchoolContext(id);this.router.navigateByUrl('/proprietaire');},error:()=>this.error.set('Acc?s impossible.')});}
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
  statusLabel(status:string): string { return ({PENDING_APPROVAL:'En attente de validation',ACTIVE:'Actif',SUSPENDED:'Désactivé',DRAFT:'En création',ARCHIVED:'Archivé'} as Record<string,string>)[status] ?? status; }
  typeLabel(type:string): string { return ({PRESCOLAIRE:'Maternelle',PRIMAIRE:'Primaire',SECONDAIRE:'Secondaire',MIXTE:'Établissement mixte',UNIVERSITE:'Université',FORMATION:'Centre de formation'} as Record<string,string>)[type] ?? type; }
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
