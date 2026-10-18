import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TeacherDailyTools } from './teacher-daily-tools';
import { ModuleHelpButton } from '../help/module-help-button';
@Component({selector:'app-teacher-notebook-page',standalone:true,imports:[TeacherDailyTools,RouterLink,ModuleHelpButton],styleUrl:'./self-space.scss',template:`<div class="ss"><header class="ss__header module-help-header"><app-module-help/><div><h1>Mon carnet personnel</h1><p>Préparations et rappels privés.</p></div><a routerLink="/enseignant">Retour à l’accueil</a></header><app-teacher-daily-tools mode="notes"/></div>`})
export class TeacherNotebookPage {}
