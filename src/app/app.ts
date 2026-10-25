import { Component, inject } from '@angular/core';
import { AppearanceService } from './shared/ui/appearance.service';
import { RouterOutlet } from '@angular/router';
import { ConfirmationDialog } from './shared/confirmation/confirmation-dialog';

@Component({
  imports: [RouterOutlet, ConfirmationDialog],
  selector: 'app-root',
  templateUrl: './app.html',
})
export class App {
  private readonly appearance = inject(AppearanceService);
}
