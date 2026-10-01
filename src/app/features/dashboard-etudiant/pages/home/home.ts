import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/auth';

@Component({
  selector: 'app-etudiant-home',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class EtudiantHome {
  private readonly auth = inject(AuthService);
  readonly user = this.auth.user;
}
