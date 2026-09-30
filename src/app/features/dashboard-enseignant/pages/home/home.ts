import { Component, inject } from '@angular/core';
import { AuthService } from '../../../../core/auth';

@Component({
  selector: 'app-enseignant-home',
  standalone: true,
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class EnseignantHome {
  private readonly auth = inject(AuthService);
  readonly user = this.auth.user;
}
