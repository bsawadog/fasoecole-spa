import { ModuleHelpButton } from '../../../../shared/help/module-help-button';
import { SelectField } from '../../../../shared/ui/select-field';
import { SelectOption } from '../../../../shared/ui/select-field';
import { LoadingState } from '../../../../shared/ui/loading-state';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MyStudentsState } from '../../../../shared/self-space/my-students.state';
import { StudentGradesView } from '../../../../shared/self-space/student-grades-view';

@Component({
  selector: 'app-etudiant-notes',
  standalone: true,
  imports: [ModuleHelpButton, SelectField, SelectOption, LoadingState, FormsModule, StudentGradesView],
  providers: [MyStudentsState],
  template: `
    <div class="ss ui-academic-blue">
      <header class="module-help-header ss__header">
    <app-module-help />
        <div>
          <h1>Mes notes</h1>
          <p>Vos notes par période et vos bulletins publiés.</p>
        </div>
        @if (state.students().length > 1) {
          <label class="ss__picker">Établissement
            <app-select-field [ngModel]="state.selectedId()" (ngModelChange)="state.selectedId.set(+$event)" [ariaLabel]="(&quot;Établissement &quot;).trim()">
              @for (s of state.students(); track s.studentId) {
                <app-select-option [value]="s.studentId" [label]="((&quot;&quot; + ((s.schoolName)) + &quot;&quot;)).trim()" />
              }
            </app-select-field>
          </label>
        }
      </header>
      @if (state.loading()) {
        <app-loading-state message="Chargement…" />
      } @else if (state.error()) {
        <p class="ss__alert ss__alert--error" role="alert">{{ state.error() }}</p>
      } @else if (state.selectedId(); as id) {
        <app-student-grades-view [studentId]="id" />
      } @else {
        <p class="ss__state">Aucun dossier élève n’est associé à votre compte.</p>
      }
    </div>
  `,
  styleUrl: '../../../../shared/self-space/self-space.scss',
})
export class EtudiantNotes implements OnInit {
  readonly state = inject(MyStudentsState);

  ngOnInit(): void {
    this.state.load();
  }
}
