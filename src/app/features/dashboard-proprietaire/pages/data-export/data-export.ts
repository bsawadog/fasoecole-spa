import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { environment } from '../../../../../environments/environment';

interface SchoolChoice { id:number;name:string;status:string; }
@Component({
  selector:'app-school-data-export',standalone:true,imports:[FormsModule],
  template:`
    <main class="export">
      <header><p class="eyebrow">VOS DONNÉES</p><h1>Exporter les données de mon établissement</h1>
        <p>Conservez une copie de vos dossiers et de vos activités, consultable sans FasoEcole.</p></header>
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      @if (loading()) { <p>Chargement de vos établissements…</p> }
      @else if (!schools().length) { <section class="card"><h2>Aucun établissement à exporter</h2>
        <p>Ce téléchargement est réservé au propriétaire de l’établissement.</p></section> }
      @else {
        <section class="card">
          <label>Établissement<select [(ngModel)]="schoolId" [disabled]="busy()">
            @for (school of schools();track school.id) { <option [ngValue]="school.id">{{ school.name }}{{ school.status === 'SUSPENDED' ? ' · désactivé' : school.status === 'ARCHIVED' ? ' · archivé' : '' }}</option> }
          </select></label>
          <div class="scope"><strong>Toutes les années scolaires</strong><p>L’année en cours et les archives sont incluses, quelle que soit l’année sélectionnée ailleurs dans l’application.</p></div>
          <h2>Un classeur organisé pour continuer votre activité</h2>
          <div class="categories">
            <div><h3>Personnes et dossiers</h3><p>Élèves et étudiants, parents et enfants associés, enseignants, employés et coordonnées.</p></div>
            <div><h3>Vie scolaire</h3><p>Classes, inscriptions, passages, notes, bulletins, présences, signalements et emplois du temps.</p></div>
            <div><h3>Finances</h3><p>Factures, paiements, impayés, soldes d’ouverture, dépenses, budgets et paiements des enseignants.</p></div>
            <div><h3>Activités et communications</h3><p>Devoirs, publications, rendez-vous, conversations accessibles à l’établissement et inventaire des documents.</p></div>
          </div>
          <div class="downloads">
            <div class="download"><h3>Classeur Excel</h3><p>Les données dans des feuilles séparées, avec filtres et sommaire.</p>
              <button type="button" [disabled]="busy() || !schoolId" (click)="download(false)">{{ busy() && !withFiles() ? 'Préparation du classeur…' : 'Télécharger Excel' }}</button></div>
            <div class="download recommended"><h3>Archive avec documents</h3><p>Le même classeur Excel et les fichiers joints stockés dans FasoEcole, réunis dans un ZIP.</p>
              <button type="button" [disabled]="busy() || !schoolId" (click)="download(true)">{{ busy() && withFiles() ? 'Préparation de l’archive…' : 'Télécharger Excel et documents' }}</button></div>
          </div>
          @if (busy()) { <p class="progress" role="status">Préparation de votre copie. Le téléchargement peut prendre quelques minutes selon le volume des données et des documents.</p> }
          @if (success()) { <p class="success" role="status">{{ success() }}</p> }
          <p class="details">Nom du classeur : <strong>donnees_etablissement_date.xlsx</strong>, avec la date et l’heure d’export.
            Les matricules et numéros d’employé sont conservés comme du texte.</p>
          <p class="details">Les documents enregistrés comme liens externes sont référencés dans le classeur ; leur contenu n’est pas inclus dans le ZIP.
            Les échanges privés sans participation de l’établissement ou de son propriétaire sont exclus.</p>
        </section>
      }
    </main>
  `,
  styles:[`
    :host{display:block;color:#213e32}.export{max-width:1150px;margin:auto;padding:12px}header{margin-bottom:28px}.eyebrow{color:#19764f;font-size:11px;letter-spacing:.15em;font-weight:700}h1{font-size:29px;margin:8px 0 12px}header p{color:#697c70;line-height:1.6}.card{background:white;border:1px solid #e0e9e2;border-radius:18px;padding:28px}label{display:grid;gap:8px;max-width:520px;font-size:13px;font-weight:600}select{font:inherit;padding:12px;border:1px solid #cfded3;border-radius:9px;background:white}.scope{background:#eff7f2;border-radius:12px;padding:18px;margin:24px 0}.scope p{margin-bottom:0;font-size:13px;line-height:1.6}h2{font-size:20px}h3{font-size:15px}.categories{display:grid;grid-template-columns:1fr 1fr;gap:12px 28px;margin:20px 0}.categories p,.download p{font-size:13px;line-height:1.7;color:#6b7c70}.downloads{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:24px 0}.download{border:1px solid #e0e9e2;border-radius:14px;padding:22px}.recommended{border-color:#a5ceb5;background:#f8fcf9}button{font:inherit;font-size:13px;font-weight:600;background:#19764f;color:white;border:0;border-radius:9px;padding:12px 18px;cursor:pointer}button:disabled{opacity:.55;cursor:default}.details{font-size:12px;color:#697c70;line-height:1.7}.progress,.success,.error{padding:15px;border-radius:10px;font-size:13px;line-height:1.6}.progress{background:#f0f5ff;color:#39577b}.success{background:#eaf7ef;color:#19764f}.error{background:#fff0ed;color:#a23f31}@media(max-width:700px){.categories,.downloads{grid-template-columns:1fr}.card{padding:20px}.export{padding:0}h1{font-size:24px}}
  `],
})
export class SchoolDataExport {
  private readonly http=inject(HttpClient);
  private readonly destroyRef=inject(DestroyRef);
  private readonly endpoint=`${environment.apiUrl}/owner/export`;
  readonly schools=signal<SchoolChoice[]>([]);
  readonly loading=signal(true);
  readonly busy=signal(false);
  readonly withFiles=signal(false);
  readonly error=signal('');
  readonly success=signal('');
  schoolId:number|null=null;
  constructor() {
    this.http.get<SchoolChoice[]>(`${this.endpoint}/schools`).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next:schools=>{ this.schools.set(schools);const stored=Number(localStorage.getItem('fasoecole_owner_school'));this.schoolId=schools.find(s=>s.id===stored)?.id??schools[0]?.id??null;this.loading.set(false); },
      error:()=>{ this.loading.set(false);this.error.set('Impossible de charger vos établissements.'); },
    });
  }
  download(attachments:boolean):void {
    if(this.busy() || !this.schoolId) return;
    this.busy.set(true);this.withFiles.set(attachments);this.error.set('');this.success.set('');
    const school=this.schools().find(s=>s.id===this.schoolId);
    this.http.get(`${this.endpoint}/schools/${this.schoolId}/${attachments?'archive':'excel'}`,{responseType:'blob',observe:'response'})
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next:response=>{
          this.busy.set(false);
          if(!response.body || response.body.size===0) { this.error.set('Le téléchargement est vide. Réessayez.');return; }
          const disposition=response.headers.get('Content-Disposition')??'';
          const encoded=/filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
          let filename:string|undefined;
          try { filename=encoded?decodeURIComponent(encoded):/filename="?([^";]+)"?/i.exec(disposition)?.[1]; }catch{ /* Use the fallback below. */ }
          filename=filename?.replace(/[\\/]/g,'_')??`donnees_etablissement_${new Date().toISOString().slice(0,10)}.${attachments?'zip':'xlsx'}`;
          const url=URL.createObjectURL(response.body),link=document.createElement('a');
          link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();
          setTimeout(()=>URL.revokeObjectURL(url),60_000);
          this.success.set(`Téléchargement lancé pour ${school?.name??'votre établissement'}. Conservez le fichier pour consulter vos données sans FasoEcole.`);
        },
        error:err=>{ this.busy.set(false);this.error.set(err.status===403?'Seul le propriétaire peut exporter toutes les données de cet établissement.':'L’export n’a pas pu être préparé. Réessayez ou contactez le support.'); },
      });
  }
}
