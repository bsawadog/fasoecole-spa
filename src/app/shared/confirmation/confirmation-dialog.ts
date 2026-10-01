import { Component, ElementRef, effect, inject, viewChild } from '@angular/core';
import { ConfirmationService } from './confirmation.service';

@Component({
  selector: 'app-confirmation-dialog',
  templateUrl: './confirmation-dialog.html',
  styleUrl: './confirmation-dialog.scss',
})
export class ConfirmationDialog {
  readonly confirmation = inject(ConfirmationService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const request = this.confirmation.request();
      const dialog = this.dialog().nativeElement;
      if (request && !dialog.open) dialog.showModal();
      if (!request && dialog.open) dialog.close();
    });
  }

  onCancel(event: Event): void {
    event.preventDefault();
    this.confirmation.respond(false);
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.confirmation.respond(false);
  }
}
