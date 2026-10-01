import { Injectable, signal } from '@angular/core';

export interface ConfirmationRequest {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ConfirmationService {
  readonly request = signal<ConfirmationRequest | null>(null);
  private resolvePending: ((confirmed: boolean) => void) | null = null;

  confirm(request: ConfirmationRequest): Promise<boolean> {
    if (this.resolvePending) {
      throw new Error('Une confirmation est déjà ouverte.');
    }
    return new Promise<boolean>((resolve) => {
      this.resolvePending = resolve;
      this.request.set(request);
    });
  }

  respond(confirmed: boolean): void {
    const resolve = this.resolvePending;
    if (!resolve) return;
    this.resolvePending = null;
    this.request.set(null);
    resolve(confirmed);
  }
}
