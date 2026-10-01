import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConfirmationDialog } from './shared/confirmation/confirmation-dialog';

@Component({
  imports: [RouterOutlet, ConfirmationDialog],
  selector: 'app-root',
  templateUrl: './app.html',
})
export class App {}
