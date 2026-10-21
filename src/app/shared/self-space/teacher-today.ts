import { ErrorAlert } from '../error-alert';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { apiError } from './self-space.service';
import { TeacherDailyToolsService, TeacherToday as TodayData } from './teacher-daily-tools.service';
@Component({selector:'app-teacher-today',standalone:true,imports:[ErrorAlert, RouterLink,DatePipe,ButtonModule,MessageModule],styleUrl:'./self-space.scss',template:`
 <section class="ss ss__card ss__body" aria-label="Aujourd’hui">
  <div class="ss__actions"><h2>Aujourd’hui</h2><a routerLink="/enseignant/carnet">Mon carnet personnel</a><button pButton type="button" severity="secondary" variant="outlined" (click)="load()" [disabled]="loading()">Actualiser ma journée</button></div>
  @if(error()){<app-error-alert [message]="error()" (dismissed)="error.set(null)">{{error()}}</app-error-alert>}
  @if(loading()){<p role="status">Chargement de votre journée…</p>}
  @if(data();as day){<p>{{day.date|date:'dd/MM/yyyy'}}</p>
   @for(lesson of day.lessons;track lesson.id){<p><strong>{{lesson.startTime.slice(0,5)}}–{{lesson.endTime.slice(0,5)}}</strong> · {{lesson.className}} · {{lesson.subjects}} · {{lesson.schoolName}}</p>}@empty{<p>Aucun cours prévu aujourd’hui dans le planning sélectionné.</p>}
   <div class="ss__actions">@for(task of day.tasks;track task.route){<a [routerLink]="'/enseignant/'+task.route">{{task.count}} · {{task.title}}</a>}</div>
   @for(note of day.reminders;track note.id){<p><a routerLink="/enseignant/carnet">Rappel : {{note.title}}</a> · {{note.remindOn|date:'dd/MM/yyyy'}}</p>}
  }
 </section>`})
export class TeacherToday implements OnInit {
 private readonly api=inject(TeacherDailyToolsService);private readonly destroy=inject(DestroyRef);
 readonly data=signal<TodayData|null>(null);readonly loading=signal(false);readonly error=signal<string|null>(null);
 ngOnInit():void{this.load();}
 load():void{this.loading.set(true);this.error.set(null);this.api.today().pipe(takeUntilDestroyed(this.destroy)).subscribe({next:day=>{this.data.set(day);this.loading.set(false);},error:err=>{this.loading.set(false);this.error.set(apiError(err,'Impossible de charger votre journée.'));}});}
}
