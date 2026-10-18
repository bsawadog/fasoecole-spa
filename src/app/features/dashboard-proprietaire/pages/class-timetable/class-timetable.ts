import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../../core/auth';
import { environment } from '../../../../../environments/environment';
import { apiError } from '../../../../shared/self-space/self-space.service';
interface Lesson { id:number; dayOfWeek:number; date:string; startTime:string; endTime:string; teacherName:string; subjects:string|null; }
interface Overview { schoolName:string; yearLabel:string; yearStart:string; yearEnd:string; classId:number|null; className:string|null; weekStart:string; classes:{id:number;name:string}[]; lessons:Lesson[]; }
@Component({selector:'app-class-timetable',standalone:true,imports:[DatePipe,FormsModule,ButtonModule,MessageModule],templateUrl:'./class-timetable.html',styleUrl:'./class-timetable.scss'})
export class ClassTimetablePage implements OnInit {
  private readonly http=inject(HttpClient); private readonly auth=inject(AuthService); private readonly destroy=inject(DestroyRef);
  private request?:Subscription;
  readonly schools=signal<{id:number;name:string}[]>([]); readonly data=signal<Overview|null>(null); readonly loading=signal(true); readonly error=signal('');
  schoolId:number|null=null; classId:number|null=null; date='';
  readonly days=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
  readonly conflicts=computed(()=>{const lessons=this.data()?.lessons??[];return new Set(lessons.filter(a=>lessons.some(b=>a.id!==b.id&&a.dayOfWeek===b.dayOfWeek&&a.startTime<b.endTime&&b.startTime<a.endTime)).map(a=>a.id));});
  readonly columns=computed(()=>this.days.map((name,i)=>({name,date:this.dayDate(i),lessons:this.data()?.lessons.filter(l=>l.dayOfWeek===i+1)??[]})));
  ngOnInit():void {
    this.destroy.onDestroy(()=>this.request?.unsubscribe());
    const user=this.auth.user();if(!user){this.loading.set(false);this.error.set('Compte indisponible.');return;}
    this.auth.getOwnedSchools(user.id,'CALENDAR').pipe(takeUntilDestroyed(this.destroy)).subscribe({next:schools=>{
      this.schools.set(schools);const stored=Number(localStorage.getItem('fasoecole_owner_school'));
      this.schoolId=(schools.find(s=>s.id===stored)??schools[0])?.id??null;
      if(this.schoolId)this.load();else this.loading.set(false);
    },error:err=>{this.error.set(apiError(err,'Impossible de charger les établissements.'));this.loading.set(false);}});
  }
  changeSchool():void {this.classId=null;this.date='';this.load();}
  load():void {
    this.request?.unsubscribe();this.error.set('');this.data.set(null);if(!this.schoolId){this.loading.set(false);return;}this.loading.set(true);
    const params:Record<string,string>={};if(this.classId)params['classId']=String(this.classId);if(this.date)params['date']=this.date;
    this.request=this.http.get<Overview>(environment.apiUrl+'/owner/class-timetables/schools/'+this.schoolId,{params}).subscribe({next:data=>{this.data.set(data);this.classId=data.classId;if(!this.date)this.date=data.weekStart<data.yearStart?data.yearStart:data.weekStart;this.loading.set(false);},error:err=>{this.loading.set(false);this.error.set(apiError(err,'Impossible de charger l’emploi du temps.'));}});
  }
  private dayDate(offset:number):string {const week=this.data()?.weekStart;if(!week)return '';const date=new Date(week+'T12:00:00');date.setDate(date.getDate()+offset);return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');}
  print():void {if(this.data()?.lessons.length&&!this.loading()&&!this.error())window.print();}
}
