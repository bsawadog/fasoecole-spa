import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/auth';
import { AppointmentCounter } from '../../../../shared/appointments/appointment-counter';

@Component({
  selector: 'app-parent-home',
  standalone: true,
  imports: [RouterLink, AppointmentCounter],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class ParentHome {
  private readonly auth = inject(AuthService);
  readonly user = this.auth.user;
}
