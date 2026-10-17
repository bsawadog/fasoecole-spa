import { Component, input } from '@angular/core';
import { SkeletonModule } from 'primeng/skeleton';

@Component({
  selector: 'app-loading-state',
  standalone: true,
  imports: [SkeletonModule],
  template: `
    <div class="loading-state" role="status" aria-live="polite" aria-busy="true">
      <span>{{ message() }}</span>
      <div class="loading-state__lines" aria-hidden="true">
        <p-skeleton width="48%" height="0.85rem" />
        <p-skeleton width="100%" height="0.85rem" />
        <p-skeleton width="75%" height="0.85rem" />
      </div>
    </div>
  `,
  styles: `
    :host { display: block; }
    .loading-state { min-height: 18rem; padding: 1.4rem; border: 1px solid var(--ui-border, #e0e8e4); border-radius: 1rem; background: var(--theme-surface, #fff); animation: loading-reveal 160ms 120ms both; }
    .loading-state > span { display: block; margin-bottom: 1.2rem; color: var(--ui-muted, #62776d); font-size: .9rem; }
    .loading-state__lines { display: grid; gap: .8rem; }
    @keyframes loading-reveal { from { opacity: 0; } to { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) {
      :host { --p-skeleton-animation-background: transparent; }
      .loading-state { animation: none; }
    }
  `,
})
export class LoadingState {
  readonly message = input('Chargement en cours…');
}
