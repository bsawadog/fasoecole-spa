import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-unauthorized',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="unauthorized">
      <h1>403</h1>
      <p>Vous n'avez pas accès à cette page.</p>
      <a class="unauthorized__link" routerLink="/">Retour à l'accueil</a>
    </div>
  `,
  styles: [
    `
      .unauthorized {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1rem;
      }

      .unauthorized__link {
        padding: 0.7rem 1rem;
        border-radius: 0.6rem;
        color: #fff;
        background: #1f765e;
        font-weight: 600;
        text-decoration: none;
      }
    `,
  ],
})
export class Unauthorized {}
