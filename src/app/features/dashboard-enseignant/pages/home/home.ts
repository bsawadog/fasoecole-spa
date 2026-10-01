import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/auth';

@Component({
  selector: 'app-enseignant-home',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class EnseignantHome {
  private readonly auth = inject(AuthService);
  readonly user = this.auth.user;
}
