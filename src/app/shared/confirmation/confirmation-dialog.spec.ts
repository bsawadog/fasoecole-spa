import { TestBed } from '@angular/core/testing';
import { ConfirmationDialog } from './confirmation-dialog';
import { ConfirmationService } from './confirmation.service';

describe('ConfirmationDialog', () => {
  async function setup() {
    const fixture = TestBed.createComponent(ConfirmationDialog);
    const confirmation = TestBed.inject(ConfirmationService);
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    dialog.showModal = () => dialog.setAttribute('open', '');
    dialog.close = () => {
      dialog.removeAttribute('open');
      dialog.dispatchEvent(new Event('close'));
    };
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, confirmation, dialog };
  }

  it('confirms only when the confirm button is clicked', async () => {
    const { fixture, confirmation, dialog } = await setup();
    const result = confirmation.confirm({
      title: 'Supprimer ?', message: 'Cette action est définitive.', confirmLabel: 'Supprimer', destructive: true,
    });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain('Cette action est définitive.');
    (dialog.querySelector('.confirmation__confirm') as HTMLButtonElement).click();
    expect(await result).toBe(true);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(dialog.open).toBe(false);
  });

  it('rejects cancellation with Escape and does not keep a pending request', async () => {
    const { fixture, confirmation, dialog } = await setup();
    const result = confirmation.confirm({
      title: 'Annuler ?', message: 'Le frais restera visible.', confirmLabel: 'Annuler le frais',
    });
    fixture.detectChanges();
    await fixture.whenStable();
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));

    expect(await result).toBe(false);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(dialog.open).toBe(false);
    expect(confirmation.request()).toBeNull();
  });
});
