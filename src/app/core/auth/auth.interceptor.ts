import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { OfflineDiagnosticsService } from '../../shared/offline/offline-diagnostics.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const base = environment.apiUrl.replace(/\/+$/, '');
  if (req.url !== base && !req.url.startsWith(`${base}/`)) return next(req);

  const auth = inject(AuthService);
  const diagnostics = inject(OfflineDiagnosticsService);
  const token = auth.getToken();

  // API persistence belongs to the encrypted application cache. Bypass the
  // static-file worker so a failed API fetch stays a network error, not a 504.
  const headers: Record<string, string> = { 'ngsw-bypass': 'true' };
  if (token && !req.headers.has('Authorization')) headers['Authorization'] = `Bearer ${token}`;
  const authorized = req.clone({ setHeaders: headers });
  const requestToken = authorized.headers.get('Authorization')?.replace(/^Bearer /, '');

  return next(authorized).pipe(catchError(error => {
    diagnostics.record(req.url, 'http-error', { status: typeof error?.status === 'number' ? error.status : undefined });
    // Une réponse tardive d'une ancienne session ne doit pas déconnecter la nouvelle.
    if (error instanceof HttpErrorResponse && error.status === 401 && requestToken
        && auth.getToken() === requestToken && !req.url.startsWith(`${base}/auth/`)) auth.logout();
    return throwError(() => error);
  }));
};
