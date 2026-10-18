import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { forkJoin, of, Observable } from 'rxjs';
import { ModuleHelpButton } from '../../../../shared/help/module-help-button';
import { SelectField, SelectOption } from '../../../../shared/ui/select-field';
import { DateField } from '../../../../shared/ui/date-field';
import { LoadingState } from '../../../../shared/ui/loading-state';
import { FormValidationDirective } from '../../../../shared/form-validation.directive';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';
import { apiError, AttendanceItem, SelfSpaceService, StudentProfile } from '../../../../shared/self-space/self-space.service';
import { StudentDashboardService, StudyProfile, StudyTask } from '../../../../shared/self-space/student-dashboard.service';
import { ParentPortalService, PortalPost } from '../../../../shared/self-space/parent-portal.service';
import { PortalPosts } from '../../../../shared/self-space/portal-posts';
import { FamilyLearning } from '../../../../shared/self-space/family-learning';
type Mode='presences'|'annonces'|'accompagnement'|'dossier'|'organisation';
const titles:Record<Mode,string>={presences:'Mes présences et retards',annonces:'Les annonces de mon établissement',accompagnement:'Mon accompagnement',dossier:'Mon dossier élève',organisation:'Mon organisation'};
@Component({selector:'app-student-study-module',standalone:true,
 imports:[DatePipe,FormsModule,RouterLink,ButtonModule,MessageModule,InputTextModule,TextareaModule,ModuleHelpButton,SelectField,SelectOption,DateField,LoadingState,FormValidationDirective,PortalPosts,FamilyLearning],
 templateUrl:'./study-module.html',styleUrl:'../../../../shared/self-space/self-space.scss',styles:[`.study-list{display:grid;gap:1rem}.study-text{white-space:pre-wrap;overflow-wrap:anywhere}.study-details{display:grid;grid-template-columns:minmax(8rem,1fr) minmax(0,2fr);gap:.65rem}dd{margin:0;overflow-wrap:anywhere}`]})
export class StudentStudyModule implements OnInit {
 private readonly self=inject(SelfSpaceService);private readonly api=inject(StudentDashboardService);private readonly portal=inject(ParentPortalService);
 private readonly route=inject(ActivatedRoute);private readonly router=inject(Router);private readonly destroy=inject(DestroyRef);private readonly confirmation=inject(ConfirmationService);
 readonly mode=signal<Mode>('organisation');readonly title=computed(()=>titles[this.mode()]);readonly profiles=signal<StudyProfile[]>([]);readonly studentId=signal<number|null>(null);
 readonly loadingProfiles=signal(true);readonly loading=signal(false);readonly saving=signal(false);readonly error=signal<string|null>(null);readonly success=signal<string|null>(null);
 readonly attendance=signal<AttendanceItem[]>([]);readonly posts=signal<PortalPost[]>([]);readonly profile=signal<StudentProfile|null>(null);readonly tasks=signal<StudyTask[]>([]);
 readonly today=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
 readonly attendanceLabels:Record<string,string>={PRESENT:'Présent',ABSENT:'Absent',LATE:'En retard',EXCUSED:'Absence excusée'};
 editing:number|null=null;draft={title:'',details:'',dueOn:null as string|null,done:false};private version=0;
 ngOnInit():void{
  this.route.data.pipe(takeUntilDestroyed(this.destroy)).subscribe(data=>{this.mode.set(data['studentModule'] as Mode);this.reset();this.load();});
  this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroy)).subscribe(params=>{if(this.profiles().length){const id=Number(params.get('studentId'));this.studentId.set(this.profiles().find(p=>p.studentId===id)?.studentId??this.profiles()[0].studentId);this.reset();this.load();}});
  this.loadProfiles();
 }
 loadProfiles():void{this.loadingProfiles.set(true);this.error.set(null);this.api.profiles().pipe(takeUntilDestroyed(this.destroy)).subscribe({next:profiles=>{this.profiles.set(profiles);const id=Number(this.route.snapshot.queryParamMap.get('studentId'));this.studentId.set(profiles.find(p=>p.studentId===id)?.studentId??profiles[0]?.studentId??null);this.loadingProfiles.set(false);this.load();},error:err=>{this.loadingProfiles.set(false);this.error.set(apiError(err,'Impossible de charger votre dossier.'));}});}
 choose(id:number):void{if(!this.saving()&&this.profiles().some(p=>p.studentId===id))this.router.navigate([],{relativeTo:this.route,queryParams:{studentId:id},queryParamsHandling:'merge'});}
 load():void{
  const id=this.studentId(),mode=this.mode();if(id===null||this.saving())return;const version=++this.version;this.loading.set(true);this.error.set(null);this.attendance.set([]);this.posts.set([]);this.profile.set(null);this.tasks.set([]);
  forkJoin({attendance:mode==='presences'?this.self.studentAttendance(id):of([] as AttendanceItem[]),posts:mode==='annonces'?this.portal.posts(id,'ANNOUNCEMENT'):of([] as PortalPost[]),profile:mode==='dossier'?this.self.studentProfile(id):of(null),tasks:mode==='organisation'?this.api.tasks(id):of([] as StudyTask[])}).pipe(takeUntilDestroyed(this.destroy)).subscribe({next:data=>{if(version!==this.version)return;this.attendance.set(data.attendance);this.posts.set(data.posts);this.profile.set(data.profile);this.tasks.set(data.tasks);this.loading.set(false);},error:err=>{if(version===this.version){this.loading.set(false);this.error.set(apiError(err,'Chargement impossible. Réessayez.'));}}});
 }
 reset():void{this.editing=null;this.draft={title:'',details:'',dueOn:null,done:false};}
 edit(task:StudyTask):void{this.editing=task.id;this.draft={title:task.title,details:task.details,dueOn:task.dueOn,done:task.done};}
 private save(action:Observable<void>,reset:()=>void=()=>{}):void{if(this.saving())return;const version=this.version;this.saving.set(true);this.error.set(null);this.success.set(null);action.pipe(takeUntilDestroyed(this.destroy)).subscribe({next:()=>{this.saving.set(false);if(version!==this.version)return;reset();this.success.set('Mon organisation a été mise à jour.');this.load();},error:err=>{this.saving.set(false);if(version===this.version)this.error.set(apiError(err,'Enregistrement impossible. Votre saisie est conservée.'));}});}
 saveTask(form:NgForm):void{const id=this.studentId();if(!form.valid||id===null)return;this.save(this.api.saveTask(id,{...this.draft},this.editing),()=>{this.reset();form.resetForm(this.draft);});}
 toggle(task:StudyTask):void{const id=this.studentId();if(id!==null)this.save(this.api.saveTask(id,{title:task.title,details:task.details,dueOn:task.dueOn,done:!task.done},task.id));}
 async remove(task:StudyTask):Promise<void>{const id=this.studentId(),version=this.version;if(id===null||this.saving())return;if(!await this.confirmation.confirm({title:'Supprimer ce rappel ?',message:task.title,confirmLabel:'Supprimer',destructive:true}))return;if(version!==this.version||this.saving())return;this.save(this.api.deleteTask(id,task.id));}
 overdue(task:StudyTask):boolean{return !task.done&&!!task.dueOn&&task.dueOn<this.today;}
}
