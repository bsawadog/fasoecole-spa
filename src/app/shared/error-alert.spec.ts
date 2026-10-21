import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ErrorAlert } from './error-alert';

@Component({
  standalone: true, imports: [ErrorAlert],
  template: `@if (error()) {
    <app-error-alert [message]="error()" (dismissed)="error.set(null)">{{ error() }}</app-error-alert>
  }<button id="next-action" (click)="save()">Enregistrer</button>`,
})
class Host {
  error = signal<string | null>(null);
  saved = false;
  save(): void { if (!this.error()) this.saved = true; }
}

describe('ErrorAlert lifecycle', () => {
  function setup(url = '/proprietaire/eleves') {
    const router = { url, navigateByUrl: vi.fn(() => Promise.resolve(true)) };
    TestBed.configureTestingModule({ providers: [{ provide: Router, useValue: router }] });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    fixture.componentInstance.error.set('Ce courriel est déjà utilisé.');
    fixture.detectChanges();
    return { fixture, router, dialog: fixture.nativeElement.querySelector('dialog') as HTMLDialogElement };
  }

  it.each(['.error-alert__close', '.error-alert__ok'])('clears the source on %s and allows a successful next action', selector => {
    const { fixture, dialog } = setup();
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain('Ce courriel est déjà utilisé.');
    (dialog.querySelector(selector) as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.error()).toBeNull();
    expect(fixture.nativeElement.querySelector('dialog')).toBeNull();
    (fixture.nativeElement.querySelector('#next-action') as HTMLButtonElement).click();
    expect(fixture.componentInstance.saved).toBe(true);
  });

  it('clears on Escape and can display the same error on a later failed action', () => {
    const { fixture, dialog } = setup();
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.error()).toBeNull();
    fixture.componentInstance.error.set('Ce courriel est déjà utilisé.');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('dialog').open).toBe(true);
  });

  it('clears on native close, not only on the close button', () => {
    const { fixture, dialog } = setup();
    dialog.removeAttribute('open');
    dialog.dispatchEvent(new Event('close'));
    fixture.detectChanges();
    expect(fixture.componentInstance.error()).toBeNull();
  });

  it('opens the incident form with page context and clears the error, without submitting an incident', () => {
    const { fixture, router, dialog } = setup();
    const link = dialog.querySelector('a') as HTMLAnchorElement;
    expect(link.textContent).toBe('Ouvrir un incident');
    link.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.error()).toBeNull();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/proprietaire/incidents?nouveau=1&source=%2Fproprietaire%2Feleves');
  });

  it('keeps the administrator in the administrator support space', () => {
    const { dialog } = setup('/admin/enseignants');
    expect(dialog.querySelector('a')?.getAttribute('href')).toContain('/admin/incidents?nouveau=1');
  });

  it('offers public support instead of an unauthorized owner route in a family space', () => {
    const { dialog } = setup('/parent');
    expect(dialog.querySelector('a')?.getAttribute('href')).toBe('/contact');
  });
});
