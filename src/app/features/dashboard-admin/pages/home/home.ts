import { ModuleHelpButton } from '../../../../shared/help/module-help-button';
import { Component, inject } from '@angular/core';
import { AuthService } from '../../../../core/auth';
import { AppointmentCounter } from '../../../../shared/appointments/appointment-counter';

@Component({
  selector: 'app-admin-home',
  standalone: true,
  imports: [ModuleHelpButton, AppointmentCounter],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class AdminHome {
  private readonly auth = inject(AuthService);
  readonly user = this.auth.user;
}
