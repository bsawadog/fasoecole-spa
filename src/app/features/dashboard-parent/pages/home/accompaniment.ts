import { ErrorAlert } from '../../../../shared/error-alert';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { ModuleHelpButton } from '../../../../shared/help/module-help-button';
import { SelectField, SelectOption } from '../../../../shared/ui/select-field';
import { FamilyLearning } from '../../../../shared/self-space/family-learning';
import { apiError, SelfSpaceService, StudentOverview } from '../../../../shared/self-space/self-space.service';
@Component({selector:'app-parent-accompaniment',standalone:true,imports:[ErrorAlert, FormsModule,ButtonModule,MessageModule,ModuleHelpButton,SelectField,SelectOption,FamilyLearning],styleUrl:'../../../../shared/self-space/self-space.scss',template:`
 <div class="ss"><header class="ss__header module-help-header"><app-module-help/><div><h1>Accompagnement de mon enfant</h1><p>Conseils, actions proposées à la famille et dates de bilan partagés par les professeurs.</p></div></header>
 @if(error()){<app-error-alert [message]="error()" (dismissed)="error.set(null)">{{error()}}</app-error-alert><button pButton type="button" (click)="load()">Réessayer</button>}
 @if(loading()){<p role="status">Chargement des enfants…</p>}
 @else if(children().length){<label class="ss__field">Enfant<app-select-field [ngModel]="studentId()" (ngModelChange)="choose(+$event)" ariaLabel="Enfant accompagné">@for(child of children();track child.studentId){<app-select-option [value]="child.studentId" [label]="child.fullName+' · '+child.schoolName"/>}</app-select-field></label>@if(studentId();as id){<app-family-learning [studentId]="id" section="support"/>}}
 @else if(!error()){<p>Aucun enfant accessible dans cet établissement.</p>}
 </div>`})
export class ParentAccompaniment implements OnInit {
 private readonly self=inject(SelfSpaceService);private readonly route=inject(ActivatedRoute);private readonly destroy=inject(DestroyRef);
 readonly children=signal<StudentOverview[]>([]);readonly studentId=signal<number|null>(null);readonly loading=signal(true);readonly error=signal<string|null>(null);
 ngOnInit():void{this.load();}
 load():void{this.loading.set(true);this.error.set(null);this.self.myStudents().pipe(takeUntilDestroyed(this.destroy)).subscribe({next:children=>{this.children.set(children);const id=Number(this.route.snapshot.queryParamMap.get('studentId'));this.studentId.set(children.find(c=>c.studentId===id)?.studentId??children[0]?.studentId??null);this.loading.set(false);},error:err=>{this.loading.set(false);this.error.set(apiError(err,'Impossible de charger les enfants.'));}});}
 choose(id:number):void{if(this.children().some(c=>c.studentId===id))this.studentId.set(id);}
}
