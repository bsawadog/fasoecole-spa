import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Appointments } from './appointments';

@Component({
  selector: 'app-personal-appointments-page', standalone: true, imports: [RouterLink, Appointments],
  template: `<main class="personal-appointments"><header><a [routerLink]="home">Retour à l’accueil</a><h1>Rendez-vous</h1><p>Consultez les rencontres qui vous sont proposées et leur statut.</p></header><app-appointments [showHeading]="false" /></main>`,
  styles: [`.personal-appointments{max-width:82rem;margin:auto;color:#18342c}header{margin-bottom:1.5rem}h1{margin:.7rem 0 .4rem}header p{color:#718078}header a{color:#1f765e}`],
})
export class PersonalAppointmentsPage {
  readonly home = '/' + inject(Router).url.split('/')[1];
}
