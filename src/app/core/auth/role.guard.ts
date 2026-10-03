import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { ROLE_HOME_ROUTE, Role } from '../models';

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
      const user = auth.user();
      if (!user?.approved || user.emailVerified !== true) return router.parseUrl('/profil');
      return true;
    }

    return router.parseUrl('/unauthorized');
  };
}

/**
 * Adresse inconnue : un utilisateur connecté reste dans son espace (accueil de son rôle) au lieu d'être renvoyé
 * vers la page de connexion.
 */
export const roleHomeRedirectGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const role = auth.isAuthenticated() ? auth.role() : null;
  if (role && (!auth.user()?.approved || auth.user()?.emailVerified !== true)) return router.parseUrl('/profil');
  return router.parseUrl(role ? ROLE_HOME_ROUTE[role] : '/login');
};
