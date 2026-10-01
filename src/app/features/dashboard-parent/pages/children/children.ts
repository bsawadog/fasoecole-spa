import { DecimalPipe } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MyStudentsState } from '../../../../shared/self-space/my-students.state';

@Component({
  selector: 'app-parent-children',
  standalone: true,
  imports: [DecimalPipe, RouterLink],
  providers: [MyStudentsState],
  template: `
    <div class="ss">
      <header class="ss__header">
        <div>
          <h1>Mes enfants</h1>
          <p>Suivez la scolarité, les notes, les absences et les frais de vos enfants.</p>
        </div>
      </header>
      @if (state.loading()) {
        <p class="ss__state">Chargement…</p>
      } @else if (state.error()) {
        <p class="ss__alert ss__alert--error" role="alert">{{ state.error() }}</p>
      } @else if (!state.students().length) {
        <p class="ss__state">
          Aucun enfant n’est encore associé à votre compte. Si votre enfant est inscrit, vérifiez votre adresse
          courriel depuis votre profil ou demandez à l’établissement de vous rattacher à son dossier.
        </p>
      } @else {
        <div class="ss__grid">
          @for (child of state.students(); track child.studentId) {
            <a class="ss__card ss__card--link" [routerLink]="['/parent/enfants', child.studentId]">
              <h2>{{ child.fullName }}</h2>
              <p>{{ child.schoolName }}</p>
              <p>{{ child.className ? child.className + ' · ' + child.academicYearLabel : 'Pas d’inscription en cours' }}</p>
              <p>Matricule {{ child.registrationNumber }}@if (child.relationship) { · {{ child.relationship }} }</p>
              <div class="ss__chips">
                <span class="ss__chip" [class.ss__chip--red]="child.attendance.unjustifiedAbsences > 0">
                  {{ child.attendance.absences }} absence(s)
                </span>
                @if (child.attendance.lates) { <span class="ss__chip ss__chip--amber">{{ child.attendance.lates }} retard(s)</span> }
                @if (child.fees.balance > 0) {
                  <span class="ss__chip" [class.ss__chip--red]="child.fees.overdueCount > 0" [class.ss__chip--amber]="!child.fees.overdueCount">
                    Reste à payer {{ child.fees.balance | number: '1.0-0' }} F
                  </span>
                } @else if (child.fees.totalDue > 0) {
                  <span class="ss__chip ss__chip--blue">Frais à jour</span>
                }
              </div>
            </a>
          }
        </div>
      }
    </div>
  `,
  styleUrl: '../../../../shared/self-space/self-space.scss',
})
export class ParentChildren implements OnInit {
  readonly state = inject(MyStudentsState);

  ngOnInit(): void {
    this.state.load();
  }
}
