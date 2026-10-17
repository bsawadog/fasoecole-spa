import { Component, inject } from '@angular/core';
import { AppearanceService } from './appearance.service';

@Component({
  selector: 'app-appearance-picker', standalone: true,
  template: `
    <section class="profile__card appearance" aria-labelledby="appearance-title">
      <h2 id="appearance-title">Apparence</h2>
      <p>Choisissez le thème de votre espace. Le changement s’applique immédiatement à tous vos profils.</p>
      <div class="appearance__choices" role="group" aria-label="Thème de l’application">
        @for (theme of appearance.themes; track theme.id) {
          <button type="button" class="appearance__choice" [attr.aria-pressed]="appearance.selected() === theme.id"
            [attr.aria-label]="theme.label" (click)="appearance.choose(theme.id)">
            <span class="appearance__preview" aria-hidden="true" [style.background]="theme.background">
              <span class="appearance__preview-nav" [style.background]="theme.accent"></span>
              <span class="appearance__preview-card" [style.background]="theme.surface"><span [style.background]="theme.accent"></span></span>
            </span>
            <span class="appearance__name">{{ theme.label }} <span aria-hidden="true">{{ appearance.selected() === theme.id ? '✓' : '' }}</span></span>
            <span class="appearance__description">{{ theme.description }}</span>
          </button>
        }
      </div>
      <p class="appearance__status" role="status">{{ appearance.saved() ? 'Votre choix est mémorisé pour votre compte sur ce navigateur.' : 'Thème appliqué pour cette session. Le navigateur ne permet pas de mémoriser votre choix.' }}</p>
    </section>
  `,
  styles: [`
    :host{display:block;min-width:0}
    .appearance__choices{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr));gap:1rem;margin-block:1rem}
    .appearance__choice{display:flex;flex-direction:column;gap:.65rem;padding:.8rem;border:2px solid var(--theme-border,#2d5a78);border-radius:.85rem;background:var(--theme-surface,#0d3154);color:var(--theme-ink,#f0f7ff);text-align:left;font:inherit;cursor:pointer;min-width:0;transition:border-color 160ms ease}
    .appearance__choice:hover{border-color:var(--theme-accent,#7dd3fc)}
    .appearance__choice[aria-pressed=true]{border-color:var(--theme-accent,#7dd3fc);box-shadow:0 0 0 2px var(--theme-soft,#153d60)}
    .appearance__choice:focus-visible{outline:3px solid var(--theme-focus,#a5f3fc);outline-offset:3px}
    .appearance__preview{display:flex;gap:.6rem;align-items:center;height:4.5rem;padding:.7rem;border-radius:.5rem;box-sizing:border-box}
    .appearance__preview-nav{width:.5rem;height:100%;border-radius:.2rem;opacity:.7}
    .appearance__preview-card{display:flex;align-items:center;flex:1;padding:.6rem;height:2.4rem;border-radius:.3rem;box-sizing:border-box}
    .appearance__preview-card>span{display:block;width:65%;height:.3rem;border-radius:1rem}
    .appearance__name{display:flex;align-items:center;justify-content:space-between;font-weight:700}
    .appearance__description,.appearance__status{color:var(--theme-muted,#c1d6e8);font-size:.85rem;line-height:1.5}
    @media(prefers-reduced-motion:reduce){.appearance__choice{transition:none}}
    @media print{:host{display:none}}
  `],
})
export class AppearancePicker {
  readonly appearance = inject(AppearanceService);
}
