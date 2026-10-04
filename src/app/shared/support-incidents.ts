import { Component, DestroyRef, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { timer, exhaustMap, catchError, EMPTY, map } from 'rxjs';
import { AuthService, RegistrationSchool } from '../core/auth/auth.service';
import { environment } from '../../environments/environment';
interface IncidentEvent { action:string; note:string; created_at:string; first_name:string; last_name:string; }
interface Incident { id:number; school_id:number; school_name:string; title:string; page_title:string; description:string; status:string; has_image:boolean; updated_at:string; events?:IncidentEvent[]; }
@Component({
 selector:'app-support-incidents', standalone:true, imports:[FormsModule,DatePipe],
 styles:[` :host{display:block} section{background:white;padding:24px;border-radius:16px;margin-bottom:20px} h1,h2{margin-top:0} label{display:block;margin:12px 0} input,select,textarea{display:block;padding:10px;border:1px solid #ccd8d1;border-radius:8px;width:100%;box-sizing:border-box} textarea{min-height:100px} button{padding:9px 14px;margin:5px;border:1px solid #cbd5d1;border-radius:8px;background:#eff7f2;cursor:pointer} button:disabled{opacity:.5;cursor:default} .layout{display:grid;grid-template-columns:minmax(260px,1fr) minmax(300px,1.5fr);gap:20px}.incident{display:block;width:100%;text-align:left}.selected{border-color:#13834b}small{display:block;color:#58685f}img{max-width:100%;max-height:450px} .error{color:#b42318}.event{border-left:3px solid #c5e4d1;padding:10px;margin:12px 0;white-space:pre-wrap}.description{white-space:pre-wrap}@media(max-width:800px){.layout{display:block}}`],
 template:`
 <h1>Incidents et assistance</h1><p>Déclarez un problème, suivez sa prise en charge et confirmez le résultat du nouveau test. Mise à jour toutes les 10 secondes.</p>
 @if(error()){<p class="error" role="alert">{{error()}}</p>} @if(notice()){<p role="status">{{notice()}}</p>}
 @if(!admin){<section><button (click)="creating=!creating">{{creating?'Annuler':'Ouvrir un incident'}}</button>
 @if(creating){<form (ngSubmit)="create()" #form="ngForm">
 <label>Établissement<select name="school" [(ngModel)]="schoolId" required><option [ngValue]="null">Choisir</option>@for(s of schools();track s.id){<option [ngValue]="s.id">{{s.name}}</option>}</select></label>
 <label>Titre de l’incident<input name="title" [(ngModel)]="title" required maxlength="160"></label>
 <label>Page concernée<input name="page" [(ngModel)]="pageTitle" required maxlength="200" placeholder="Ex. Élèves par classe"></label>
 <label>Description et étapes pour reproduire<textarea name="description" [(ngModel)]="description" required maxlength="8000"></textarea></label>
 <label>Image facultative — PNG/JPEG, 2 Mo maximum<input type="file" accept="image/png,image/jpeg" (change)="fileChanged($event)"></label>
 <p>Ne joignez pas de mot de passe ou de document contenant des données inutiles au diagnostic.</p>
 <button type="submit" [disabled]="busy() || form.invalid || !title.trim() || !pageTitle.trim() || !description.trim()">Envoyer l’incident</button></form>}
 </section>}
 <div class="layout"><section><label>Rechercher<input type="search" [(ngModel)]="search" maxlength="160" (ngModelChange)="page=0;refresh()" placeholder="Titre ou établissement"></label>
 @for(i of rows();track i.id){<button class="incident" [disabled]="busy()" [class.selected]="selected()?.id===i.id" (click)="select(i.id)"><strong>#{{i.id}} · {{i.title}}</strong><small>{{i.school_name}} · {{label(i.status)}} · {{i.updated_at|date:'dd/MM/yyyy HH:mm'}}</small></button>} @empty{<p>Aucun incident.</p>}
 <button [disabled]="page===0" (click)="page=page-1;refresh()">Précédent</button><span>Page {{page+1}}</span><button [disabled]="rows().length<30" (click)="page=page+1;refresh()">Suivant</button></section>
 @if(selected();as i){<section><h2>{{i.title}}</h2><p>{{i.school_name}} · {{i.page_title}} · <strong>{{label(i.status)}}</strong></p><p class="description">{{i.description}}</p>
 @if(admin){<button (click)="openSchool(i.school_id)" [disabled]="busy()">Ouvrir l’espace propriétaire</button>}
 @if(i.has_image){<button (click)="showImage(i.id)">Voir l’image jointe</button>} @if(imageUrl()){<img [src]="imageUrl()" alt="Capture jointe à l’incident">}
 <h3>Historique</h3>@for(e of i.events;track $index){<div class="event"><strong>{{e.first_name}} {{e.last_name}} · {{actionLabel(e.action)}}</strong><small>{{e.created_at|date:'dd/MM/yyyy HH:mm'}}</small>{{e.note}}</div>}
 <label>Commentaire<textarea [(ngModel)]="note" maxlength="8000" placeholder="Correction apportée, résultat du test ou précision"></textarea></label>
 @if(admin&&i.status==='OPEN'){<button [disabled]="busy()" (click)="act('CLAIM')">Prendre en charge</button>}
 @if(admin&&i.status==='IN_PROGRESS'){<button [disabled]="busy()||!note.trim()" (click)="act('RETEST')">Demander de retester</button>}
 @if(i.status==='RETEST_REQUESTED'||i.status==='CLOSED'){<button [disabled]="busy()||!note.trim()" (click)="act('REOPEN')">{{i.status==='CLOSED'?'Rouvrir':'Le problème persiste'}}</button>}
 @if(i.status!=='CLOSED'){<button [disabled]="busy()||!note.trim()" (click)="act('COMMENT')">Ajouter un commentaire</button><button [disabled]="busy()" (click)="closing=true">Fermer l’incident</button>}
 @if(closing){<div role="dialog" aria-modal="true" aria-label="Confirmer la clôture"><p>Confirmez-vous la fermeture de cet incident ?</p><button [disabled]="busy()" (click)="act('CLOSE')">Confirmer</button><button (click)="closing=false">Annuler</button></div>}
 </section>}</div>`
})
export class SupportIncidents {
 private http=inject(HttpClient); private auth=inject(AuthService); private router=inject(Router); private destroy=inject(DestroyRef);
 private endpoint=`${environment.apiUrl}/support`;
 readonly admin=this.auth.user()?.rawRoles.includes('SUPER_ADMIN')===true;
 rows=signal<Incident[]>([]);selected=signal<Incident|null>(null);schools=signal<RegistrationSchool[]>([]);error=signal('');notice=signal('');busy=signal(false);imageUrl=signal('');
 search='';page=0;creating=false;closing=false;schoolId:number|null=this.auth.schoolContextId();title='';pageTitle='';description='';note='';image:File|null=null;private generation=0;private detailGeneration=0;
 constructor(){
  if(!this.admin&&this.auth.user())this.auth.getOwnedSchools(this.auth.user()!.id).pipe(takeUntilDestroyed(this.destroy)).subscribe({next:s=>this.schools.set(s),error:()=>this.error.set('Établissements indisponibles.')});
  timer(0,10000).pipe(exhaustMap(()=>{const generation=this.generation;return this.http.get<Incident[]>(`${this.endpoint}/incidents`,{params:{page:this.page,search:this.search}}).pipe(catchError(()=>{this.error.set('Impossible de synchroniser les incidents.');return EMPTY;}),map(rows=>({rows,generation})));}),takeUntilDestroyed(this.destroy)).subscribe(({rows,generation})=>{if(generation!==this.generation)return;this.rows.set(rows);if(this.selected()&&!this.busy())this.refreshDetail(this.selected()!.id);});
  this.destroy.onDestroy(()=>this.clearImage());
 }
 label(s:string){return ({OPEN:'Ouvert',IN_PROGRESS:'Pris en charge',RETEST_REQUESTED:'À retester',CLOSED:'Fermé'} as Record<string,string>)[s]??s;}
 actionLabel(s:string){return ({OPEN:'Déclaration',CLAIM:'Prise en charge',RETEST:'Nouveau test demandé',CLOSE:'Clôture',REOPEN:'Réouverture',COMMENT:'Commentaire'} as Record<string,string>)[s]??s;}
 refresh(){const g=++this.generation;this.http.get<Incident[]>(`${this.endpoint}/incidents`,{params:{page:this.page,search:this.search}}).pipe(takeUntilDestroyed(this.destroy)).subscribe({next:r=>{if(g===this.generation)this.rows.set(r);},error:e=>this.fail(e)});}
 select(id:number){this.note='';this.closing=false;this.clearImage();this.selected.set(null);this.refreshDetail(id);}
 private refreshDetail(id:number){const g=++this.detailGeneration;this.http.get<Incident>(`${this.endpoint}/incidents/${id}`).pipe(takeUntilDestroyed(this.destroy)).subscribe({next:r=>{if(g===this.detailGeneration)this.selected.set(r);},error:e=>this.fail(e)});}
 fileChanged(e:globalThis.Event){const file=(e.target as HTMLInputElement).files?.[0]??null;if(file&&(file.size>2097152||!['image/png','image/jpeg'].includes(file.type))){this.image=null;(e.target as HTMLInputElement).value='';this.error.set('Choisissez une image PNG/JPEG de 2 Mo maximum.');return;}this.image=file;this.error.set('');}
 create(){if(this.busy()||!this.schoolId||!this.title.trim()||!this.pageTitle.trim()||!this.description.trim())return;const form=new FormData();form.append('request',new Blob([JSON.stringify({schoolId:this.schoolId,title:this.title,pageTitle:this.pageTitle,description:this.description})],{type:'application/json'}));if(this.image)form.append('image',this.image);this.busy.set(true);this.http.post<Incident>(`${this.endpoint}/incidents`,form).pipe(takeUntilDestroyed(this.destroy)).subscribe({next:i=>{this.busy.set(false);this.creating=false;this.title='';this.pageTitle='';this.description='';this.image=null;this.selected.set(i);this.notice.set('Incident envoyé au SUPER_ADMIN.');this.refresh();},error:e=>this.fail(e)});}
 act(action:string){const i=this.selected();if(!i||this.busy())return;this.busy.set(true);++this.detailGeneration;this.http.post<Incident>(`${this.endpoint}/incidents/${i.id}/actions`,{action,note:this.note}).pipe(takeUntilDestroyed(this.destroy)).subscribe({next:r=>{this.busy.set(false);this.selected.set(r);this.note='';this.closing=false;this.notice.set('Mise à jour enregistrée et notification envoyée.');this.refresh();},error:e=>this.fail(e)});}
 showImage(id:number){this.http.get(`${this.endpoint}/incidents/${id}/image`,{responseType:'blob'}).pipe(takeUntilDestroyed(this.destroy)).subscribe({next:b=>{if(this.selected()?.id===id){this.clearImage();this.imageUrl.set(URL.createObjectURL(b));}},error:e=>this.fail(e)});}
 private clearImage(){if(this.imageUrl())URL.revokeObjectURL(this.imageUrl());this.imageUrl.set('');}
 openSchool(id:number){this.busy.set(true);this.http.post(`${this.endpoint}/school-access/${id}`,{}).pipe(takeUntilDestroyed(this.destroy)).subscribe({next:()=>{this.auth.selectSchoolContext(id);this.router.navigateByUrl('/proprietaire');this.busy.set(false);},error:e=>this.fail(e)});}
 private fail(e:any){this.busy.set(false);this.error.set(e.error?.message??'Action impossible. Veuillez réessayer.');}
}
