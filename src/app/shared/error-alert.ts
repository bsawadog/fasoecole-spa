import { Component, effect, ElementRef, inject, input, output, viewChild } from '@angular/core';
import { Router } from '@angular/router';

let nextErrorId = 0;

/** Acknowledging an error also clears its source in the owning page. */
@Component({
  selector: 'app-error-alert', standalone: true,
  template: `
    <dialog #dialog class="error-alert" role="alertdialog" aria-modal="true"
            [attr.aria-labelledby]="id + '-title'" [attr.aria-describedby]="id + '-message'"
            (cancel)="cancel($event)" (close)="onClose()">
      <header><h2 [id]="id + '-title'">Action impossible</h2>
        <button type="button" class="error-alert__close" aria-label="Fermer l’erreur" (click)="dismiss()">×</button>
      </header>
      <div class="error-alert__message" [id]="id + '-message'"><ng-content /></div>
      <p class="error-alert__support">Si le problème persiste, vous pouvez contacter le support technique.</p>
      <footer><a [href]="supportUrl()" (click)="openSupport($event)">{{ incidentAvailable() ? 'Ouvrir un incident' : 'Contacter le support' }}</a>
        <button type="button" class="error-alert__ok" (click)="dismiss()" autofocus>Fermer</button>
      </footer>
    </dialog>
  `,
  styles: `
    :host { display: contents; }
    .error-alert { width: min(32rem, calc(100vw - 2rem)); max-height: calc(100dvh - 2rem); overflow: auto;
      padding: 1.25rem; border: 1px solid var(--theme-danger-border, #fecaca); border-radius: 1rem;
      background: var(--theme-surface, #fff); color: var(--theme-ink, #1e293b); box-shadow: 0 20px 60px rgb(15 23 42 / 30%); }
    .error-alert::backdrop { background: rgb(15 23 42 / 55%); }
    header, footer { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
    h2 { margin: 0; font-size: 1.2rem; color: var(--theme-danger, #b91c1c); }
    .error-alert__message { margin-block: 1rem; overflow-wrap: anywhere; white-space: pre-wrap; line-height: 1.6; }
    .error-alert__support { margin: 1rem 0; font-size: .9rem; color: var(--theme-muted, #475569); }
    footer { flex-wrap: wrap; }
    footer a { color: var(--theme-link, #2563eb); text-decoration: underline; }
    button { cursor: pointer; }
    .error-alert__close { border: 0; background: var(--theme-surface, #fff); color: var(--theme-muted, #475569); font-size: 1.6rem; padding: .25rem .6rem; }
    .error-alert__ok { padding: .6rem 1.1rem; border-radius: .5rem; border: 1px solid var(--theme-link, #2563eb); background: var(--theme-link, #2563eb); color: var(--theme-button-ink, #fff); }
    :is(button, a):focus-visible { outline: 2px solid var(--theme-link, #2563eb); outline-offset: 3px; }
    @media print { :host { display: none; } }
  `,
})
export class ErrorAlert {
  readonly message = input<string | boolean | null | undefined>();
  readonly dismissed = output<void>();
  readonly id = `error-alert-${++nextErrorId}`;
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly router = inject(Router, { optional: true });
  private acknowledged: string | boolean | null | undefined;
  incidentAvailable(): boolean { return /^\/(proprietaire|admin)(\/|$)/.test(this.router?.url ?? ''); }
  supportUrl(): string {
    const url = this.router?.url ?? '';
    if (!this.incidentAvailable()) return '/contact';
    return `${url.startsWith('/admin') ? '/admin' : '/proprietaire'}/incidents?nouveau=1&source=${encodeURIComponent(url.split('?')[0])}`;
  }

  constructor() {
    effect(() => {
      const message = this.message(), dialog = this.dialog().nativeElement;
      if (!message) {
        this.acknowledged = undefined;
        if (dialog.open) this.closeDialog();
      } else if (message !== this.acknowledged && !dialog.open) {
        // Native dialogs are supported by browsers; the fallback also supports DOM-only renderers.
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.setAttribute('open', '');
      }
    });
  }

  dismiss(): void {
    const message = this.message();
    if (!message || message === this.acknowledged) return;
    this.acknowledged = message;
    this.closeDialog();
    this.dismissed.emit();
  }
  cancel(event: Event): void { event.preventDefault(); this.dismiss(); }
  onClose(): void { if (!this.dialog().nativeElement.open) this.dismiss(); }
  private closeDialog(): void {
    const dialog = this.dialog().nativeElement;
    if (!dialog.open) return;
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }
  openSupport(event: MouseEvent): void {
    const target = this.supportUrl();
    this.dismiss();
    if (this.router && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.button === 0) {
      event.preventDefault();
      void this.router.navigateByUrl(target);
    }
  }
}
