import { Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Subscription, timer } from 'rxjs';
import { AuthService } from '../../core/auth';
import { AppointmentOverviewService, AppointmentProfile } from './appointment-overview.service';
import { DatedAppointment, pendingAppointmentCount } from './appointment-state';

@Component({
  selector: 'app-appointment-counter', standalone: true, imports: [RouterLink],
  template: `<a [routerLink]="pageLink()"><span class="counter__icon" aria-hidden="true">◷</span><div><h2>Rendez-vous</h2><strong>{{ count() ?? '—' }}</strong><p>{{ error() ? 'Compteur indisponible' : 'Demandes non expirées en attente' }}</p><span class="counter__action">Consulter et gérer →</span></div></a>`,
  styles: [`:host{display:block}a{display:flex;gap:1rem;padding:1.5rem;border:1px solid #dce8e0;border-radius:1rem;background:#fff;color:#18342c;text-decoration:none;box-shadow:0 .2rem .7rem rgb(24 52 44 / 4%)}a:hover{border-color:#1f765e}a:focus-visible{outline:3px solid #83bdab;outline-offset:3px}h2{margin:0 0 .6rem;font-size:1.05rem}strong{font-size:1.8rem}p{margin:.35rem 0 .8rem;color:#718078;font-size:.85rem}.counter__icon{display:grid;place-items:center;width:2.5rem;height:2.5rem;border-radius:.7rem;background:#eaf6ee;color:#1f765e;font-size:1.5rem}.counter__action{font-size:.8rem;color:#1f765e;font-weight:650}`],
})
export class AppointmentCounter {
  readonly profile = input<AppointmentProfile>('personal');
  readonly pageLink = input.required<string>();
  private readonly api = inject(AppointmentOverviewService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private request?: Subscription;
  readonly data = signal<DatedAppointment[] | null>(null);
  readonly now = signal(Date.now());
  readonly error = signal(false);
  readonly count = computed(() => this.data() === null ? null : pendingAppointmentCount(this.data()!, this.now()));
  constructor() {
    effect(onCleanup => {
      const profile = this.profile();
      this.auth.schoolContextId();
      this.data.set(null); this.error.set(false);
      const subscription = timer(0, 30_000).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
        this.now.set(Date.now());
        this.request?.unsubscribe();
        this.request = this.api.load(profile).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
          next: rows => { this.data.set(rows); this.error.set(false); },
          error: () => { this.data.set(null); this.error.set(true); },
        });
      });
      onCleanup(() => { subscription.unsubscribe(); this.request?.unsubscribe(); });
    });
  }
}
