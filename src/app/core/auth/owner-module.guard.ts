import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Observable, catchError, map, of } from 'rxjs';
import { AuthService, OWNER_MODULES, OwnerModule } from './auth.service';

/**
 * Espace propriétaire : le propriétaire accède à tout ; le personnel uniquement aux modules délégués.
 * Sans le module demandé, le personnel est redirigé vers son premier module autorisé.
 * Sans module (null), la route est réservée au propriétaire.
 */
export function ownerModuleGuard(module: OwnerModule | null): CanActivateFn {
  return (): Observable<boolean | UrlTree> | boolean => {
    const auth = inject(AuthService);
    const router = inject(Router);
    if (auth.isSchoolOwner()) {
      return true;
    }
    return auth.loadOwnerAccess().pipe(
      map(() => {
        const allowed = auth.ownerModules();
        if (module && allowed.has(module)) {
          return true;
        }
        const fallback = OWNER_MODULES.find((m) => allowed.has(m.code));
        return router.parseUrl(fallback ? fallback.route : '/unauthorized');
      }),
      catchError(() => of(router.parseUrl('/unauthorized')))
    );
  };
}
