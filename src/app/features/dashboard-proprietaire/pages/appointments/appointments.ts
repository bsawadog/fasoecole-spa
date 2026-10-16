import { LoadingState } from '../../../../shared/ui/loading-state';
import { MessageModule } from 'primeng/message';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService, RegistrationSchool } from '../../../../core/auth';
import { Appointments } from '../../../../shared/appointments/appointments';

@Component({
  selector: 'app-owner-appointments-page', standalone: true,
  imports: [LoadingState, MessageModule, Appointments, FormsModule, RouterLink],
  styleUrl: '../../../../shared/self-space/self-space.scss',
  template: `
    <main class="ss">
      <header class="ss__header"><div><a [routerLink]="home">Retour à l’accueil</a><h1>Rendez-vous</h1><p>Consultez les demandes reçues et les rendez-vous que vous avez pris.</p></div>

      </header>
      @if (error()) { <p-message severity="error" class="ss__alert ss__alert--error" role="alert">{{ error() }}</p-message> }
      @if (loading()) { <app-loading-state message="Chargement…" /> }
      @else if (schoolId()) { <app-appointments [owner]="true" [schoolId]="schoolId()" [showHeading]="false" /> }
      @else if (!error()) { <p class="ss__state">Aucun établissement accessible.</p> }
    </main>`,
})
export class OwnerAppointmentsPage implements OnInit {
  readonly home = '/' + inject(Router).url.split('/')[1];
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  readonly schools = signal<RegistrationSchool[]>([]);
  readonly schoolId = signal<number | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  ngOnInit(): void {
    const userId = this.auth.user()?.id;
    if (!userId) { this.loading.set(false); this.error.set('Compte introuvable.'); return; }
    this.auth.getOwnedSchools(userId, 'PARENT_PORTAL').pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: schools => {
        this.schools.set(schools);
        const school = schools.find(s => s.id === Number(localStorage.getItem('fasoecole_owner_school'))) ?? schools[0];
        if (school) this.selectSchool(school.id);
        this.loading.set(false);
      }, error: () => { this.loading.set(false); this.error.set('Impossible de charger les établissements.'); },
    });
  }
  selectSchool(id: number): void {
    if (!this.schools().some(s => s.id === id)) return;
    this.schoolId.set(id);

  }
}
