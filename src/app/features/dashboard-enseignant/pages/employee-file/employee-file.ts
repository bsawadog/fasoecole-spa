import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../../core/auth';
import { ModuleHelpButton } from '../../../../shared/help/module-help-button';
import { MessageActivityService } from '../../../../shared/message-activity.service';
import { apiError } from '../../../../shared/self-space/self-space.service';
import type { TeacherDetail } from '../../../dashboard-proprietaire/teacher-work.service';
import { environment } from '../../../../../environments/environment';
interface Choice {teacherId:number;schoolId:number;schoolName:string;employeeNumber:string|null;}
interface EmployeeFile {teacherId:number;schoolId:number;schoolName:string;hireDate:string|null;month:string;detail:TeacherDetail;canRequest:boolean;administrationName:string;}
@Component({selector:'app-teacher-employee-file',standalone:true,imports:[DatePipe,FormsModule,RouterLink,ModuleHelpButton],templateUrl:'./employee-file.html',styleUrl:'./employee-file.scss'})
export class TeacherEmployeeFilePage implements OnInit {
 private readonly http=inject(HttpClient);private readonly auth=inject(AuthService);private readonly destroy=inject(DestroyRef);private readonly activity=inject(MessageActivityService);
 private readonly url=environment.apiUrl+'/me/teacher/employee-files';private readRequest?:Subscription;
 readonly choices=signal<Choice[]>([]);readonly file=signal<EmployeeFile|null>(null);readonly loading=signal(true);readonly sending=signal(false);readonly error=signal('');readonly requestError=signal('');readonly sent=signal(false);
 teacherId:number|null=null;month=new Date().getFullYear()+'-'+String(new Date().getMonth()+1).padStart(2,'0');subject='';content='';
 readonly days=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
 ngOnInit():void {
  this.destroy.onDestroy(()=>this.readRequest?.unsubscribe());
  this.loadChoices();
 }
 loadChoices():void {
  this.loading.set(true);this.error.set('');
  this.http.get<Choice[]>(this.url).pipe(takeUntilDestroyed(this.destroy)).subscribe({next:choices=>{this.choices.set(choices);this.teacherId=(choices.find(c=>c.schoolId===this.auth.schoolContextId())??choices[0])?.teacherId??null;if(this.teacherId)this.load();else this.loading.set(false);},error:err=>{this.loading.set(false);this.error.set(apiError(err,'Impossible de charger votre fiche employé.'));}});
 }
 choose():void{this.subject='';this.content='';this.sent.set(false);this.requestError.set('');this.load();}
 load():void {
  if(!this.teacherId||this.sending())return;this.readRequest?.unsubscribe();this.loading.set(true);this.error.set('');this.file.set(null);
  this.readRequest=this.http.get<EmployeeFile>(this.url+'/'+this.teacherId,{params:{month:this.month}}).subscribe({next:file=>{this.file.set(file);this.loading.set(false);},error:err=>{this.loading.set(false);this.error.set(apiError(err,'Impossible de charger votre fiche pour ce mois.'));}});
 }
 amount(value:number):string{return new Intl.NumberFormat('fr-FR',{maximumFractionDigits:2}).format(value)+' FCFA';}
 hours(value:number):string{return new Intl.NumberFormat('fr-FR',{maximumFractionDigits:2}).format(value)+' h';}
 send():void {
  const file=this.file();if(!file?.canRequest||this.sending()||!this.subject.trim()||!this.content.trim())return;
  this.sending.set(true);this.requestError.set('');this.sent.set(false);
  this.http.post(this.url+'/'+file.teacherId+'/requests',{subject:this.subject.trim(),content:this.content.trim()}).pipe(takeUntilDestroyed(this.destroy)).subscribe({next:()=>{this.sending.set(false);this.sent.set(true);this.subject='';this.content='';this.activity.changed();},error:err=>{this.sending.set(false);this.requestError.set(apiError(err,'La demande n’a pas pu être envoyée. Votre texte est conservé.'));}});
 }
}
