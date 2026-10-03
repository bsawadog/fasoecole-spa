import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const base = environment.apiUrl.replace(/\/+$/, '');
  if (req.url !== base && !req.url.startsWith(`${base}/`)) return next(req);

  const auth = inject(AuthService);
  const token = auth.getToken();

  const authorized = token && !req.headers.has('Authorization') ? req.clone({
    setHeaders: { Authorization: `Bearer ${token}` },
  }) : req;
  const requestToken = authorized.headers.get('Authorization')?.replace(/^Bearer /, '');

  return next(authorized).pipe(catchError(error => {
    // Une réponse tardive d'une ancienne session ne doit pas déconnecter la nouvelle.
    if (error instanceof HttpErrorResponse && error.status === 401 && requestToken
        && auth.getToken() === requestToken && !req.url.startsWith(`${base}/auth/`)) auth.logout();
    return throwError(() => error);
  }));
};
