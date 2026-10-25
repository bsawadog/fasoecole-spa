import { ErrorAlert } from '../error-alert';
import { Component, DestroyRef, inject, input, OnChanges, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { forkJoin, Observable, of } from 'rxjs';
import { DateField } from '../ui/date-field';
import { SelectField, SelectOption } from '../ui/select-field';
import { FormValidationDirective } from '../form-validation.directive';
import { ConfirmationService } from '../confirmation/confirmation.service';
import { apiError, RosterStudent, SelfSpaceService, TeacherClass } from './self-space.service';
import { environment } from '../../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { Availability, Lesson, PersonalNote, Support, TeacherDailyToolsService } from './teacher-daily-tools.service';

@Component({selector:'app-teacher-daily-tools',standalone:true,
 imports:[ErrorAlert, DatePipe,DecimalPipe,FormsModule,RouterLink,ButtonModule,MessageModule,InputTextModule,TextareaModule,DateField,SelectField,SelectOption,FormValidationDirective],
 templateUrl:'./teacher-daily-tools.html',styleUrl:'./self-space.scss',
 styles:[`:host{display:block;margin-block:1rem}.daily-list{display:grid;gap:1rem}.daily-text{white-space:pre-wrap;overflow-wrap:anywhere}summary{cursor:pointer;font-weight:700;padding:.75rem}label:has(input[type=checkbox]){display:flex;gap:.6rem;align-items:center}`]})
export class TeacherDailyTools implements OnChanges {
 private readonly api=inject(TeacherDailyToolsService);private readonly self=inject(SelfSpaceService);
 private readonly http=inject(HttpClient);private readonly destroy=inject(DestroyRef);private readonly confirm=inject(ConfirmationService);
 readonly mode=input.required<'lessons'|'support'|'notes'|'availability'>();
 readonly classId=input<number|null>(null);readonly subjects=input<TeacherClass['subjects']>([]);
 readonly loading=signal(false);readonly saving=signal(false);readonly error=signal<string|null>(null);readonly success=signal<string|null>(null);
 readonly lessons=signal<Lesson[]>([]);readonly support=signal<Support[]>([]);readonly notes=signal<PersonalNote[]>([]);readonly requests=signal<Availability[]>([]);
 readonly roster=signal<RosterStudent[]>([]);readonly profiles=signal<{teacherId:number;schoolName:string}[]>([]);
 readonly today=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
 editing:number|null=null;studentId:number|null=null;
 lesson={subjectId:null as number|null,lessonOn:this.today,title:'',content:'',objectives:'',nextWork:'',shared:false};
 note={title:'',content:'',remindOn:null as string|null,done:false};
 plan={action:'',reviewOn:null as string|null,resolved:false,familyMessage:'',shared:false};
 request={teacherId:null as number|null,startsAt:'',endsAt:'',reason:'',replacementRequested:false};
 private version=0;
 ngOnChanges():void{this.editing=null;this.studentId=null;this.success.set(null);this.reset();this.load();}
 reset():void{this.editing=null;this.lesson={subjectId:this.subjects()[0]?.subjectId??null,lessonOn:this.today,title:'',content:'',objectives:'',nextWork:'',shared:false};this.note={title:'',content:'',remindOn:null,done:false};this.studentId=null;this.plan={action:'',reviewOn:null,resolved:false,familyMessage:'',shared:false};}
 load():void{
  const version=++this.version,id=this.classId(),mode=this.mode();this.loading.set(true);this.error.set(null);
  const action=mode==='lessons'&&id?this.api.lessons(id):mode==='support'&&id?this.api.support(id):mode==='notes'?this.api.notes():mode==='availability'?this.api.availability():of([]);
  forkJoin({rows:action,roster:mode==='support'&&id?this.self.classStudents(id):of([] as RosterStudent[]),profiles:mode==='availability'?this.http.get<{teacherId:number;schoolName:string}[]>(environment.apiUrl+'/me/teacher/employee-files'):of([])}).pipe(takeUntilDestroyed(this.destroy)).subscribe({
   next:data=>{if(version!==this.version)return;this.loading.set(false);this.roster.set(data.roster);this.profiles.set(data.profiles);
    if(mode==='lessons')this.lessons.set(data.rows as Lesson[]);if(mode==='support')this.support.set(data.rows as Support[]);if(mode==='notes')this.notes.set(data.rows as PersonalNote[]);if(mode==='availability'){this.requests.set(data.rows as Availability[]);this.request.teacherId??=data.profiles[0]?.teacherId??null;}},
   error:err=>{if(version===this.version){this.loading.set(false);this.error.set(apiError(err,'Chargement impossible. Réessayez.'));}},
  });
 }
 private save(action:Observable<void>,form?:NgForm):void{
  if(this.saving())return;const version=this.version;this.saving.set(true);this.error.set(null);this.success.set(null);
  action.pipe(takeUntilDestroyed(this.destroy)).subscribe({next:()=>{this.saving.set(false);if(version!==this.version)return;this.reset();if(this.mode()==='availability')this.request={...this.request,startsAt:'',endsAt:'',reason:'',replacementRequested:false};form?.resetForm(this.mode()==='lessons'?this.lesson:this.mode()==='notes'?this.note:this.mode()==='support'?{...this.plan,studentId:null}:this.request);this.success.set(this.mode()==='availability'?'Demande transmise. Consultez la réponse dans Messages.':'Enregistrement effectué.');this.load();},error:err=>{this.saving.set(false);if(version===this.version)this.error.set(apiError(err,'Enregistrement impossible. Votre saisie est conservée.'));}});
 }
 saveLesson(form:NgForm):void{if(!form.valid||!this.classId())return;this.save(this.api.save('classes/'+this.classId()+'/lessons',this.lesson,this.editing),form);}
 editLesson(row:Lesson):void{this.editing=row.id;this.lesson={subjectId:row.subjectId,lessonOn:row.lessonOn,title:row.title,content:row.content,objectives:row.objectives,nextWork:row.nextWork,shared:row.shared};}
 saveNote(form:NgForm):void{if(!form.valid)return;this.save(this.api.save('daily/notes',this.note,this.editing),form);}
 editNote(row:PersonalNote):void{this.editing=row.id;this.note={title:row.title,content:row.content,remindOn:row.remindOn,done:row.done};}
 toggleNote(row:PersonalNote):void{this.save(this.api.save('daily/notes',{...row,done:!row.done},row.id));}
 chooseStudent(id:number):void{this.studentId=id;const row=this.support().find(s=>s.studentId===id);this.plan={action:row?.action??'',reviewOn:row?.reviewOn??null,resolved:row?.resolved??false,familyMessage:row?.familyMessage??'',shared:row?.shared??false};}
 savePlan(form:NgForm):void{if(!form.valid||!this.classId()||!this.studentId)return;this.save(this.api.saveSupport(this.classId()!,this.studentId,this.plan),form);}
 sendRequest(form:NgForm):void{if(!form.valid)return;if(this.request.endsAt<=this.request.startsAt){this.error.set('La fin doit suivre le début.');return;}this.save(this.api.save('daily/availability',this.request),form);}
 async remove(id:number):Promise<void>{if(this.saving())return;const version=this.version;if(!await this.confirm.confirm({title:'Supprimer cet élément ?',message:'Cette suppression est définitive.',confirmLabel:'Supprimer',destructive:true}))return;if(version!==this.version)return;this.save(this.api.remove(this.mode()==='lessons'?'classes/'+this.classId()+'/lessons':'daily/notes',id));}
}
