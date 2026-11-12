import { Component, inject } from '@angular/core';
import { AppearanceService } from './shared/ui/appearance.service';
import { RouterOutlet } from '@angular/router';
import { ConfirmationDialog } from './shared/confirmation/confirmation-dialog';
import { OfflineAppService } from './shared/offline/offline-app.service';

@Component({
  imports: [RouterOutlet, ConfirmationDialog],
  selector: 'app-root',
  templateUrl: './app.html',
  host: { '[attr.data-offline-ready]': 'offlineApp.ready()' },
  styles: [`.offline-preparation{position:sticky;top:0;z-index:1100;margin:0;padding:.65rem 1rem;text-align:center;background:var(--theme-surface,#fff);color:var(--theme-text,#16332c);font-size:.875rem;box-shadow:0 1px 3px #0002}.offline-preparation button{margin-left:.75rem;padding:.3rem .6rem}`],
})
export class App {
  readonly offlineApp = inject(OfflineAppService);
  private readonly appearance = inject(AppearanceService);
}
