import { Component, inject } from '@angular/core';
import { AuthService } from '../../../../core/auth';

@Component({
  selector: 'app-parent-home',
  standalone: true,
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class ParentHome {
  private readonly auth = inject(AuthService);
  readonly user = this.auth.user;
}
