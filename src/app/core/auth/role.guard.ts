import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { Role } from '../models';

/**
 * Guard factory : restreint l'accès à une route selon le(s) rôle(s) autorisé(s).
 * Usage : canActivate: [authGuard, roleGuard(['admin', 'proprietaire'])]
 */
export function roleGuard(allowedRoles: Role[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const role = auth.role();

    if (role && allowedRoles.includes(role)) {
      return true;
    }

    return router.parseUrl('/unauthorized');
  };
}
