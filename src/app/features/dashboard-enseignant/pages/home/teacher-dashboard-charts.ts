import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription, timer } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { environment } from '../../../../../environments/environment';
import { apiError, TeacherClass } from '../../../../shared/self-space/self-space.service';
interface Week {start:string;end:string;present:number;absent:number;late:number;excused:number;}
interface Dashboard {classes:TeacherClass[];classId:number|null;yearLabel:string|null;asOf:string;weeks:Week[];marks:{evaluationId:number|null;evaluations:{id:number;title:string;subject:string;date:string}[];buckets:{label:string;count:number}[];count:number;average:number|null};homework:{todo:number;submitted:number;corrected:number;overdue:number};}
@Component({selector:'app-teacher-dashboard-charts',standalone:true,imports:[DatePipe,FormsModule],templateUrl:'./teacher-dashboard-charts.html',styleUrl:'./teacher-dashboard-charts.scss'})
export class TeacherDashboardCharts implements OnInit {
 private readonly http=inject(HttpClient);private readonly destroy=inject(DestroyRef);private request?:Subscription;
 readonly data=signal<Dashboard|null>(null);readonly classes=signal<TeacherClass[]>([]);readonly loading=signal(false);readonly error=signal('');classId:number|null=null;evaluationId:number|null=null;
 readonly attendanceMax=computed(()=>Math.max(1,...this.data()?.weeks.map(w=>this.total(w))??[]));
 readonly marksMax=computed(()=>Math.max(1,...this.data()?.marks.buckets.map(b=>b.count)??[]));
 readonly homeworkTotal=computed(()=>{const h=this.data()?.homework;return h?h.todo+h.submitted+h.corrected:0;});
 readonly donut=computed(()=>{const h=this.data()?.homework;const total=this.homeworkTotal();if(!h||!total)return 'conic-gradient(var(--theme-border,#2d5a78) 0 100%)';const todo=h.todo/total*100,submitted=(h.todo+h.submitted)/total*100;return 'conic-gradient(#fb923c 0 '+todo+'%,#60a5fa '+todo+'% '+submitted+'%,#34d399 '+submitted+'% 100%)';});
 ngOnInit():void{this.destroy.onDestroy(()=>this.request?.unsubscribe());this.load();timer(30_000,30_000).pipe(takeUntilDestroyed(this.destroy)).subscribe(()=>{if(!this.loading())this.load(true);});}
 formatAverage(value:number|null):string{return value===null?'—':new Intl.NumberFormat('fr-FR',{maximumFractionDigits:2}).format(value);}
 total(w:Week):number{return w.present+w.absent+w.late+w.excused;}
 percent(value:number,total:number):number{return total?value/total*100:0;}
 chooseClass():void{this.evaluationId=null;this.load();}
 load(background=false):void{
  this.request?.unsubscribe();this.loading.set(true);this.error.set('');if(!background)this.data.set(null);
  const params:Record<string,string>={};if(this.classId!==null)params['classId']=String(this.classId);if(this.evaluationId!==null)params['evaluationId']=String(this.evaluationId);
  this.request=this.http.get<Dashboard>(environment.apiUrl+'/me/teacher/dashboard',{params}).subscribe({next:data=>{this.data.set(data);this.classes.set(data.classes);this.classId=data.classId;this.evaluationId=data.marks.evaluationId;this.loading.set(false);},error:err=>{this.error.set(apiError(err,'Impossible de charger les graphiques.'));this.loading.set(false);}});
 }
}
