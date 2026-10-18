import { Component, DestroyRef, inject, input, OnChanges, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { apiError } from './self-space.service';
import { FamilyLearning as Data, TeacherDailyToolsService } from './teacher-daily-tools.service';
@Component({selector:'app-family-learning',standalone:true,imports:[DatePipe,ButtonModule,MessageModule],styleUrl:'./self-space.scss',template:`
 <section aria-label="Cahier de textes et accompagnement"><h2>Cahier de textes et accompagnement</h2>
 <button pButton type="button" severity="secondary" variant="outlined" (click)="load()" [disabled]="loading()">Actualiser les séances</button>
 @if(error()){<p-message severity="error" role="alert">{{error()}}</p-message>}
 @if(loading()){<p role="status">Chargement…</p>}
 @if(data();as value){
 @for(item of value.support;track $index){<article class="ss__card ss__body"><h3>Message d’accompagnement · {{item.teacherName}}</h3><p style="white-space:pre-wrap;overflow-wrap:anywhere">{{item.message}}</p>@if(item.reviewOn){<p>Prochain bilan : {{item.reviewOn|date:'dd/MM/yyyy'}}</p>}<p>{{item.resolved?'Accompagnement terminé':'Accompagnement en cours'}}</p></article>}
 @for(item of value.lessons;track item.id){<article class="ss__card ss__body"><h3>{{item.subjectName}} · {{item.title}}</h3><p>{{item.lessonOn|date:'dd/MM/yyyy'}}</p><p style="white-space:pre-wrap;overflow-wrap:anywhere">{{item.content}}</p>@if(item.objectives){<p style="white-space:pre-wrap;overflow-wrap:anywhere">Objectifs : {{item.objectives}}</p>}@if(item.nextWork){<p style="white-space:pre-wrap;overflow-wrap:anywhere">Prochaine séance : {{item.nextWork}}</p>}</article>}@empty{<p>Aucune séance partagée.</p>}
 }</section>`})
export class FamilyLearning {
 readonly studentId=input.required<number>();private readonly api=inject(TeacherDailyToolsService);private readonly destroy=inject(DestroyRef);
 readonly data=signal<Data|null>(null);readonly loading=signal(false);readonly error=signal<string|null>(null);private version=0;
 ngOnChanges():void{this.data.set(null);this.load();}
 load():void{const version=++this.version;this.loading.set(true);this.error.set(null);this.api.family(this.studentId()).pipe(takeUntilDestroyed(this.destroy)).subscribe({next:data=>{if(version===this.version){this.data.set(data);this.loading.set(false);}},error:err=>{if(version===this.version){this.loading.set(false);this.error.set(apiError(err,'Impossible de charger les séances partagées.'));}}});}
}
