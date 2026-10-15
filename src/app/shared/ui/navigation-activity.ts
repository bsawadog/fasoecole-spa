import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationCancel, NavigationEnd, NavigationError, NavigationSkipped, NavigationStart, Router } from '@angular/router';
import { filter, map, of, switchMap, timer } from 'rxjs';

@Component({
  selector: 'app-navigation-activity',
  standalone: true,
  template: `
    @if (visible()) {
      <div class="navigation-activity" role="progressbar" aria-label="Ouverture du module" aria-busy="true"></div>
    }
  `,
  styles: `
    .navigation-activity { position: fixed; inset: 0 0 auto; height: 3px; z-index: 1000; pointer-events: none; background: #dbeafe; overflow: hidden; }
    .navigation-activity::after { content: ''; display: block; width: 35%; height: 100%; background: #2563eb; animation: module-progress 1.2s ease-in-out infinite; }
    @keyframes module-progress { from { transform: translateX(-100%); } to { transform: translateX(390%); } }
    @media (prefers-reduced-motion: reduce) { .navigation-activity::after { animation: none; width: 100%; } }
    @media print { .navigation-activity { display: none; } }
  `,
})
export class NavigationActivity {
  readonly visible = toSignal(inject(Router).events.pipe(
    filter(event => event instanceof NavigationStart || event instanceof NavigationEnd
      || event instanceof NavigationCancel || event instanceof NavigationError || event instanceof NavigationSkipped),
    switchMap(event => event instanceof NavigationStart ? timer(150).pipe(map(() => true)) : of(false)),
  ), { initialValue: false });
}
