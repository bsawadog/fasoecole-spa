import { Component, inject } from '@angular/core';
import { AuthService } from '../../../../core/auth';

@Component({
  selector: 'app-etudiant-home',
  standalone: true,
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class EtudiantHome {
  private readonly auth = inject(AuthService);
  readonly user = this.auth.user;
}
