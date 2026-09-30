import { Component, inject } from '@angular/core';
import { AuthService } from '../../../../core/auth';

@Component({
  selector: 'app-admin-home',
  standalone: true,
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class AdminHome {
  private readonly auth = inject(AuthService);
  readonly user = this.auth.user;
}
