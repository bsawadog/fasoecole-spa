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
import { apiError, SelfSpaceService } from '../../../../shared/self-space/self-space.service';
import { ParentAttendance } from '../../../../shared/self-space/parent-dashboard.service';
import { StudentDashboard, StudentDashboardService, StudyProfile } from '../../../../shared/self-space/student-dashboard.service';
import { LucideBookOpen, LucideCalendarDays, LucideMessageCircle, LucideNotebookPen, LucideUsers, LucideShieldCheck } from '@lucide/angular';
interface Shortcut {route:string;title:string;description:string;icon:string;}
@Component({selector:'app-etudiant-home',standalone:true,
 imports:[NgTemplateOutlet,ModuleHelpButton,RouterLink,DatePipe,DecimalPipe,FormsModule,ButtonModule,MessageModule,AppointmentCounter,SelectField,SelectOption,LoadingState,LucideBookOpen,LucideCalendarDays,LucideMessageCircle,LucideNotebookPen,LucideUsers,LucideShieldCheck],
 templateUrl:'./home.html',styleUrl:'./home.scss'})
export class EtudiantHome implements OnInit {
 private readonly auth=inject(AuthService);private readonly self=inject(SelfSpaceService);private readonly api=inject(StudentDashboardService);
 private readonly route=inject(ActivatedRoute);private readonly router=inject(Router);private readonly destroy=inject(DestroyRef);
 private readonly sync=inject(SchoolDataSyncService);private readonly messages=inject(MessageActivityService);private syncSubscription?:Subscription;
 readonly user=this.auth.user;
 readonly profiles=signal<StudyProfile[]>([]);readonly selectedId=signal<number|null>(null);
 readonly selected=computed(()=>this.profiles().find(c=>c.studentId===this.selectedId()));
 readonly data=signal<StudentDashboard|null>(null);readonly loadingProfiles=signal(true);readonly loading=signal(false);
 readonly error=signal<string|null>(null);readonly profilesError=signal<string|null>(null);readonly unread=signal<number|null>(null);
 readonly params=computed(()=>this.selectedId()?{studentId:this.selectedId()}:{});
 readonly recorded=computed(()=>this.data()?this.total(this.data()!.attendance):0);
 readonly maxWeek=computed(()=>Math.max(1,...(this.data()?.weeks.map(w=>this.total(w.attendance))??[])));
 readonly homeworkTotal=computed(()=>{const h=this.data()?.homework;return h?h.todo+h.submitted+h.corrected:0;});
 readonly donut=computed(()=>{const h=this.data()?.homework;if(!h||!this.homeworkTotal())return 'var(--theme-inset)';const a=h.todo/this.homeworkTotal()*100,b=(h.todo+h.submitted)/this.homeworkTotal()*100;return `conic-gradient(var(--theme-warning) 0% ${a}%, var(--theme-accent) ${a}% ${b}%, var(--theme-success) ${b}% 100%)`;});
 readonly education:Shortcut[]=[
  {route:'emploi-du-temps',title:'Mon emploi du temps',description:'Les horaires et cours de ma classe.',icon:'calendar'},
  {route:'devoirs',title:'Mes devoirs de maison',description:'Consignes, échéances et corrections.',icon:'book'},
  {route:'documents',title:'Cours et cahier de textes',description:'Supports, PDF, exercices et séances.',icon:'book'},
  {route:'notes',title:'Mes notes et bulletins',description:'Mes résultats et bulletins publiés.',icon:'notes'},
  {route:'organisation',title:'Mon organisation',description:'Mes révisions, tâches et rappels privés.',icon:'notes'},
  {route:'accompagnement',title:'Mon accompagnement',description:'Conseils et bilans partagés par les professeurs.',icon:'shield'},
 ];
 readonly schoolLife:Shortcut[]=[
  {route:'presences',title:'Mes présences et retards',description:'Consulter les absences et retards enregistrés.',icon:'users'},
  {route:'annonces',title:'Annonces',description:'Informations de la classe et de l’établissement.',icon:'notes'},
  {route:'calendrier',title:'Calendrier scolaire',description:'Dates importantes et événements.',icon:'calendar'},
  {route:'bibliotheque',title:'Bibliothèque',description:'Livres, emprunts et dates de retour.',icon:'book'},
  {route:'discipline',title:'Vie scolaire',description:'Observations partagées et accompagnement.',icon:'shield'},
  {route:'demandes-administratives',title:'Demandes administratives',description:'Demander un certificat ou une attestation.',icon:'notes'},
  {route:'dossier',title:'Mon dossier élève',description:'Ma fiche, mes responsables et mes enseignants.',icon:'users'},
 ];
 private version=0;
 ngOnInit():void{
  this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroy)).subscribe(params=>{const id=Number(params.get('studentId'));if(this.profiles().length)this.select(this.profiles().find(c=>c.studentId===id)?.studentId??this.profiles()[0].studentId);});
  this.loadProfiles();
  this.messages.refresh.pipe(switchMap(()=>this.self.unreadConversationCount().pipe(catchError(()=>of(null)))),takeUntilDestroyed(this.destroy)).subscribe(count=>this.unread.set(typeof count==='number'?count:null));
 }
 loadProfiles():void{
  this.loadingProfiles.set(true);this.profilesError.set(null);
  this.api.profiles().pipe(takeUntilDestroyed(this.destroy)).subscribe({next:profiles=>{this.profiles.set(profiles);this.loadingProfiles.set(false);const id=Number(this.route.snapshot.queryParamMap.get('studentId'));this.select(profiles.find(c=>c.studentId===id)?.studentId??profiles[0]?.studentId??null);},error:err=>{this.loadingProfiles.set(false);this.profilesError.set(apiError(err,'Impossible de charger vos dossiers élèves.'));}});
 }
 choose(id:number):void{if(this.profiles().some(c=>c.studentId===id))this.router.navigate([],{relativeTo:this.route,queryParams:{studentId:id},queryParamsHandling:'merge'});}
 private select(id:number|null):void{
  this.syncSubscription?.unsubscribe();this.selectedId.set(id);this.data.set(null);this.reload();
  const school=this.selected()?.schoolId;if(school)this.syncSubscription=this.sync.watch(school).pipe(takeUntilDestroyed(this.destroy)).subscribe(()=>{if(!this.loading())this.reload(true);});
 }
 reload(background=false):void{
  const id=this.selectedId(),version=++this.version;this.error.set(null);
  if(id===null){this.loading.set(false);this.data.set(null);return;}
  if(!background)this.loading.set(true);
  this.api.load(id).pipe(takeUntilDestroyed(this.destroy)).subscribe({next:data=>{if(version===this.version){this.data.set(data);this.loading.set(false);}},error:err=>{if(version===this.version){this.loading.set(false);if(err instanceof HttpErrorResponse&&[401,403,404].includes(err.status))this.data.set(null);this.error.set(apiError(err,'Impossible de charger votre suivi. Réessayez.'));}}});
 }
 link(item:Shortcut):string[]{return ['/etudiant/'+item.route];}
 total(a:ParentAttendance):number{return a.present+a.absent+a.late+a.excused;}
 percent(value:number,total=20):number{return total>0?Math.min(100,Math.max(0,value/total*100)):0;}
}
