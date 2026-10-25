import { ModuleHelpButton } from '../help/module-help-button';
import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Appointments } from './appointments';

@Component({
  selector: 'app-personal-appointments-page', standalone: true, imports: [ModuleHelpButton, RouterLink, Appointments],
  template: `<main class="personal-appointments"><header class="module-help-header">
    <app-module-help /><a [routerLink]="home">Retour au tableau de bord</a><h1>Rendez-vous</h1><p>Consultez les rencontres qui vous sont proposées et leur statut.</p></header><app-appointments [showHeading]="false" /></main>`,
  styles: [`@layer legacy { .personal-appointments{max-width:82rem;margin:auto;color:var(--theme-ink, #18342c)}header{margin-bottom:1.5rem}h1{margin:.7rem 0 .4rem}header p{color:var(--theme-muted, #718078)}header a{color:var(--theme-success, #1f765e)} }`],
})
export class PersonalAppointmentsPage {
  readonly home = '/' + inject(Router).url.split('/')[1];
}
