import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MyStudentsState } from '../../../../shared/self-space/my-students.state';
import { StudentGradesView } from '../../../../shared/self-space/student-grades-view';

@Component({
  selector: 'app-etudiant-notes',
  standalone: true,
  imports: [FormsModule, StudentGradesView],
  providers: [MyStudentsState],
  template: `
    <div class="ss">
      <header class="ss__header">
        <div>
          <h1>Mes notes</h1>
          <p>Vos notes par période et vos bulletins publiés.</p>
        </div>
        @if (state.students().length > 1) {
          <label class="ss__picker">Établissement
            <select [ngModel]="state.selectedId()" (ngModelChange)="state.selectedId.set(+$event)">
              @for (s of state.students(); track s.studentId) {
                <option [ngValue]="s.studentId">{{ s.schoolName }}</option>
              }
            </select>
          </label>
        }
      </header>
      @if (state.loading()) {
        <p class="ss__state">Chargement…</p>
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
