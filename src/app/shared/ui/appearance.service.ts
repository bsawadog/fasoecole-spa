import { DOCUMENT } from '@angular/common';
import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { AuthService } from '../../core/auth';

export const APPEARANCE_THEMES = [
  { id: 'night-violet', label: 'Violet nuit', description: 'Violet profond et accents lavande', background: '#17112e', surface: '#30234d', accent: '#c4b5fd' },
  { id: 'night-green', label: 'Vert nuit', description: 'Vert profond et accents menthe', background: '#071f1c', surface: '#123d35', accent: '#6ee7b7' },
  { id: 'blue-black', label: 'Noir bleuté', description: 'Le bleu nuit actuel de Faso École', background: '#061638', surface: '#0d3154', accent: '#7dd3fc' },
  { id: 'classic-blue', label: 'Bleu classique', description: 'Menu noir bleuté, bandeaux bleus et cartes blanches', background: '#09243b', surface: '#ffffff', accent: '#2563eb' },
  { id: 'light-gray', label: 'Gris clair', description: 'Surfaces grises douces et textes foncés', background: '#e8edf2', surface: '#f8fafc', accent: '#036981' },
  { id: 'glossy-black', label: 'Noir brillant', description: 'Noir profond et reflets discrets', background: '#050608', surface: '#191d24', accent: '#b6d6f5' },
  { id: 'white', label: 'Blanc', description: 'Fond lumineux et cartes blanches', background: '#f5f8fc', surface: '#ffffff', accent: '#075c78' },
] as const;
export type AppearanceTheme = typeof APPEARANCE_THEMES[number]['id'];
export const DEFAULT_APPEARANCE: AppearanceTheme = 'blue-black';
export function isAppearanceTheme(value: unknown): value is AppearanceTheme {
  return APPEARANCE_THEMES.some(theme => theme.id === value);
}

@Injectable({ providedIn: 'root' })
export class AppearanceService {
  private readonly auth = inject(AuthService);
  private readonly document = inject(DOCUMENT);
  private readonly userId = computed(() => this.auth.user()?.id ?? null);
  private readonly current = signal<AppearanceTheme>(DEFAULT_APPEARANCE);
  readonly selected = this.current.asReadonly();
  readonly saved = signal(true);
  readonly themes = APPEARANCE_THEMES;

  constructor() {
    effect(() => {
      const id = this.userId();
      let stored: string | null = null;
      try { if (id != null) stored = this.document.defaultView?.localStorage.getItem(`fasoecole_theme_${id}`) ?? null; }
      catch { /* The default also works when browser storage is unavailable. */ }
      this.current.set(isAppearanceTheme(stored) ? stored : DEFAULT_APPEARANCE);
      this.saved.set(true);
    });
    effect(() => { this.document.body.setAttribute('data-app-theme', this.current()); });
  }

  choose(theme: AppearanceTheme): void {
    if (!isAppearanceTheme(theme)) return;
    this.current.set(theme);
    const id = this.userId();
    let saved = false;
    try {
      if (id != null && this.document.defaultView) {
        this.document.defaultView.localStorage.setItem(`fasoecole_theme_${id}`, theme);
        saved = true;
      }
    } catch { /* Keep the chosen appearance for this session. */ }
    this.saved.set(saved);
  }
}
