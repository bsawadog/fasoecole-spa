import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { catchError, of, Subscription, switchMap } from 'rxjs';
import { AuthService } from '../../../../core/auth';
import { ModuleHelpButton } from '../../../../shared/help/module-help-button';
import { AppointmentCounter } from '../../../../shared/appointments/appointment-counter';
import { SelectField, SelectOption } from '../../../../shared/ui/select-field';
import { LoadingState } from '../../../../shared/ui/loading-state';
import { MessageActivityService } from '../../../../shared/message-activity.service';
import { SchoolDataSyncService } from '../../../../shared/school-data-sync.service';
import { apiError, SelfSpaceService, StudentOverview } from '../../../../shared/self-space/self-space.service';
import { ParentAttendance, ParentDashboard, ParentDashboardService } from '../../../../shared/self-space/parent-dashboard.service';
import { LucideBookOpen, LucideCalendarDays, LucideMessageCircle, LucideNotebookPen, LucideUsers, LucideWallet, LucideShieldCheck } from '@lucide/angular';
interface Shortcut {route:string;title:string;description:string;icon:string;}
@Component({selector:'app-parent-home',standalone:true,
 imports:[NgTemplateOutlet,ModuleHelpButton,RouterLink,DatePipe,DecimalPipe,FormsModule,ButtonModule,MessageModule,AppointmentCounter,SelectField,SelectOption,LoadingState,LucideBookOpen,LucideCalendarDays,LucideMessageCircle,LucideNotebookPen,LucideUsers,LucideWallet,LucideShieldCheck],
 templateUrl:'./home.html',styleUrl:'./home.scss'})
export class ParentHome implements OnInit {
 private readonly auth=inject(AuthService);private readonly self=inject(SelfSpaceService);private readonly api=inject(ParentDashboardService);
 private readonly route=inject(ActivatedRoute);private readonly router=inject(Router);private readonly destroy=inject(DestroyRef);
 private readonly sync=inject(SchoolDataSyncService);private readonly messages=inject(MessageActivityService);private syncSubscription?:Subscription;
 readonly user=this.auth.user;
 readonly children=signal<StudentOverview[]>([]);readonly selectedId=signal<number|null>(null);
 readonly selected=computed(()=>this.children().find(c=>c.studentId===this.selectedId()));
 readonly data=signal<ParentDashboard|null>(null);readonly loadingChildren=signal(true);readonly loading=signal(false);
 readonly error=signal<string|null>(null);readonly childrenError=signal<string|null>(null);readonly unread=signal<number|null>(null);
 readonly params=computed(()=>this.selectedId()?{studentId:this.selectedId()}:{});
 readonly recorded=computed(()=>this.data()?this.total(this.data()!.attendance):0);
 readonly maxWeek=computed(()=>Math.max(1,...(this.data()?.weeks.map(w=>this.total(w.attendance))??[])));
 readonly homeworkTotal=computed(()=>{const h=this.data()?.homework;return h?h.todo+h.submitted+h.corrected:0;});
 readonly donut=computed(()=>{const h=this.data()?.homework;if(!h||!this.homeworkTotal())return 'var(--theme-inset)';const a=h.todo/this.homeworkTotal()*100,b=(h.todo+h.submitted)/this.homeworkTotal()*100;return `conic-gradient(var(--theme-warning) 0% ${a}%, var(--theme-accent) ${a}% ${b}%, var(--theme-success) ${b}% 100%)`;});
 readonly education:Shortcut[]=[
  {route:'enfants',title:'Mes enfants',description:'Fiche, responsables et contacts de l’école.',icon:'users'},
  {route:'notes',title:'Notes et bulletins',description:'Résultats détaillés et bulletins publiés.',icon:'notes'},
  {route:'absences',title:'Présences et retards',description:'Consulter et signaler une absence ou un retard.',icon:'users'},
  {route:'devoirs',title:'Devoirs de maison',description:'Consignes, échéances et corrections.',icon:'book'},
  {route:'documents',title:'Cours et cahier de textes',description:'Supports, PDF et séances partagées.',icon:'book'},
  {route:'accompagnement',title:'Accompagnement',description:'Conseils et bilans partagés par les professeurs.',icon:'shield'},
 ];
 readonly schoolLife:Shortcut[]=[
  {route:'emploi',title:'Emploi du temps',description:'Horaires et cours de la classe.',icon:'calendar'},
  {route:'calendrier',title:'Calendrier scolaire',description:'Événements et dates importantes.',icon:'calendar'},
  {route:'discipline',title:'Discipline et vie scolaire',description:'Observations partagées et mesures de suivi.',icon:'shield'},
  {route:'bibliotheque',title:'Bibliothèque',description:'Catalogue, emprunts et dates de retour.',icon:'book'},
  {route:'annonces',title:'Annonces',description:'Informations de la classe et de l’établissement.',icon:'notes'},
  {route:'demandes-administratives',title:'Demandes administratives',description:'Certificats, attestations et suivi des demandes.',icon:'notes'},
 ];
 private version=0;
 ngOnInit():void{
  this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroy)).subscribe(params=>{const id=Number(params.get('studentId'));if(this.children().length)this.select(this.children().find(c=>c.studentId===id)?.studentId??this.children()[0].studentId);});
  this.loadChildren();
  this.messages.refresh.pipe(switchMap(()=>this.self.unreadConversationCount().pipe(catchError(()=>of(null)))),takeUntilDestroyed(this.destroy)).subscribe(count=>this.unread.set(typeof count==='number'?count:null));
 }
 loadChildren():void{
  this.loadingChildren.set(true);this.childrenError.set(null);
  this.self.myStudents().pipe(takeUntilDestroyed(this.destroy)).subscribe({next:children=>{this.children.set(children);this.loadingChildren.set(false);const id=Number(this.route.snapshot.queryParamMap.get('studentId'));this.select(children.find(c=>c.studentId===id)?.studentId??children[0]?.studentId??null);},error:err=>{this.loadingChildren.set(false);this.childrenError.set(apiError(err,'Impossible de charger vos enfants.'));}});
 }
 choose(id:number):void{if(this.children().some(c=>c.studentId===id))this.router.navigate([],{relativeTo:this.route,queryParams:{studentId:id},queryParamsHandling:'merge'});}
 private select(id:number|null):void{
  this.syncSubscription?.unsubscribe();this.selectedId.set(id);this.data.set(null);this.reload();
  const school=this.selected()?.schoolId;if(school)this.syncSubscription=this.sync.watch(school).pipe(takeUntilDestroyed(this.destroy)).subscribe(()=>{if(!this.loading())this.reload(true);});
 }
 reload(background=false):void{
  const id=this.selectedId(),version=++this.version;this.error.set(null);
  if(id===null){this.loading.set(false);this.data.set(null);return;}
  if(!background)this.loading.set(true);
  this.api.load(id).pipe(takeUntilDestroyed(this.destroy)).subscribe({next:data=>{if(version===this.version){this.data.set(data);this.loading.set(false);}},error:err=>{if(version===this.version){this.loading.set(false);if(err instanceof HttpErrorResponse&&[401,403,404].includes(err.status))this.data.set(null);this.error.set(apiError(err,'Impossible de charger le suivi. Réessayez.'));}}});
 }
 link(item:Shortcut):string[]{return item.route==='enfants'&&this.selectedId()?['/parent/enfants',String(this.selectedId())]:['/parent/'+item.route];}
 total(a:ParentAttendance):number{return a.present+a.absent+a.late+a.excused;}
 percent(value:number,total=20):number{return total>0?Math.min(100,Math.max(0,value/total*100)):0;}
}
