import { HttpErrorResponse, HttpHeaders, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, mergeMap, of, throwError } from 'rxjs';
import { AuthService } from '../../core/auth';
import { environment } from '../../../environments/environment';
import { OfflineAttendanceService } from './offline-attendance.service';
import { offlineApiPath, offlineReadKey, readBody, serializeRead } from './offline-read-cache';
import { ModuleQueryCache, QUERY_FRESH_MS, QUERY_RECHECK_MS, queryScope } from './module-query-cache';
import { isMessageWrite, MESSAGE_ID, MESSAGE_REPLAY, packMessage } from './message-outbox';
import { ACTION_ID, ACTION_REPLAY, queuedActionLabel } from './action-outbox';

/** Session cache for online reads; encrypted persistence requires explicit offline opt-in. */
export const offlineReadInterceptor: HttpInterceptorFn = (request, next) => {
  const path = offlineApiPath(request.url, environment.apiUrl);
  if (path === null) return next(request);
  const auth = inject(AuthService);
  const offline = inject(OfflineAttendanceService);
  const cache = inject(ModuleQueryCache);
  const user = auth.user(), token = auth.getToken(), role = user?.role ?? '';
  if (!user?.approved || !user.emailVerified || user.mustChangePassword
      || request.headers.get('Authorization') !== `Bearer ${token}`) return next(request);
  cache.useSession(`${user.id}/${role}/${token}`);
  const sameSession = () => auth.getToken() === token && auth.user()?.id === user.id && auth.user()?.role === role;
  const messageWrite = isMessageWrite(request.method, path);
  const actionLabel = queuedActionLabel(request.method, path, role);
  if (actionLabel && !request.headers.has(ACTION_ID)) request = request.clone({ setHeaders: { [ACTION_ID]: crypto.randomUUID() } });
  if (messageWrite && !request.headers.has(MESSAGE_ID)) request = request.clone({ setHeaders: { [MESSAGE_ID]: crypto.randomUUID() } });
  const key = offlineReadKey(request, role);
  const scope = queryScope(request);
  const unavailable = (message: string) => throwError(() => new HttpErrorResponse({
    status: 0, statusText: 'Hors connexion Internet', url: request.urlWithParams, error: { message, offline: true },
  }));
  const queueMessage = () => from((async () => {
    try {
      const packed = await packMessage(request.body);
      if (!sameSession()) throw new Error('La session a changé. Le message n’a pas été mis en attente.');
      await offline.queueMessage({ ...packed, path, operationId: request.headers.get(MESSAGE_ID)!,
        createdAt: new Date().toISOString(), subject: String((packed.payload as { subject?: string })?.subject ?? 'Réponse'), role,
        school: request.headers.get('X-Academic-School'), year: request.headers.get('X-Academic-Year') });
    } catch (error) {
      throw new HttpErrorResponse({ status: 0, error: { offline: true, message: error instanceof Error ? error.message : 'Impossible de conserver ce message. Il reste dans le formulaire.' } });
    }
    throw new HttpErrorResponse({ status: 0, error: { offline: true, messageQueued: true, message: 'Message conservé chiffré sur cet appareil, en attente de connexion Internet.' } });
  })());
  const queueAction = () => from((async () => {
    try {
      if (!sameSession()) throw new Error('La session a changé. Votre action n’a pas été conservée.');
      await offline.queueAction({ operationId: request.headers.get(ACTION_ID)!, userId: user.id, role, path,
        payload: structuredClone(request.body), label: actionLabel!, createdAt: new Date().toISOString(),
        school: request.headers.get('X-Academic-School'), year: request.headers.get('X-Academic-Year') });
    } catch (error) {
      throw new HttpErrorResponse({ status: 0, error: { offline: true, message: error instanceof Error ? error.message : 'Conservation impossible. Votre saisie reste dans le formulaire.' } });
    }
    throw new HttpErrorResponse({ status: 0, error: { offline: true, actionQueued: true, message: 'Action conservée chiffrée sur cet appareil · en attente d’envoi. La base de données sera mise à jour après confirmation du serveur.' } });
  })());
  const copy = () => {
    if (!sameSession() || !offline.unlocked()) return unavailable('Retrouvez Internet pour déverrouiller les données locales de ce compte.');
    const entry = offline.readCopy(key);
    return entry ? of(new HttpResponse({ status: 200, url: request.urlWithParams, body: readBody(entry), headers: new HttpHeaders(entry.headers) }))
      : unavailable('Ces données ne sont pas disponibles hors connexion Internet. Consultez cette page avec Internet pour préparer sa copie locale.');
  };
  if (!navigator.onLine) {
    if (!offline.enabled()) return next(request);
    if (messageWrite && !request.headers.has(MESSAGE_REPLAY)) return queueMessage();
    if (actionLabel && !request.headers.has(ACTION_REPLAY)) return queueAction();
    if (request.method !== 'GET') return unavailable('Mode consultation hors connexion Internet : cette action nécessite Internet. Les présences peuvent être enregistrées dans leur module pour un envoi ultérieur.');
    return copy();
  }
  const network = (background = false) => {
    const generation = cache.generation();
    return next(request).pipe(
    mergeMap(event => {
      if (!(event instanceof HttpResponse) || !sameSession()) return of(event);
      if (request.method !== 'GET') { if (event.ok) cache.invalidate(scope); return of(event); }
      if (event.status !== 200 || request.responseType === 'arraybuffer' || generation !== cache.generation()) return of(event);
      const headers: Record<string, string> = {};
      for (const name of ['content-type', 'content-disposition']) {
        const value = event.headers.get(name); if (value) headers[name] = value;
      }
      const save = async () => {
        let changed = false;
        try {
          if (request.responseType === 'json') changed = cache.put(key, event, scope);
          const entry = await serializeRead(event.body, new Date().toISOString(), headers);
          if (sameSession() && generation === cache.generation() && offline.enabled()) await offline.rememberRead(key, entry);
          if (background && changed && sameSession()) cache.announce(scope);
        } catch { /* A failed local copy must never turn a successful server request into a failed action. */ }
        return event;
      };
      return from(save());
    }),
    catchError(error => {
      if (!sameSession()) return throwError(() => error);
      if (actionLabel && !request.headers.has(ACTION_REPLAY) && offline.enabled() && offline.unlocked()
          && (!error.status || error.status >= 500 || [408, 429].includes(error.status))) return queueAction();
      if (messageWrite && !request.headers.has(MESSAGE_REPLAY) && offline.enabled() && offline.unlocked()
          && (!error.status || error.status >= 500)) return queueMessage();
      if (background) cache.refreshIssue.set('Actualisation en arrière-plan indisponible. Les données affichées restent celles de la dernière consultation.');
      if (error.status === 401 || error.status === 403) {
        cache.useSession('');
        return from(offline.forgetReads().catch(() => undefined)).pipe(mergeMap(() => {
          if (background && sameSession()) auth.logout();
          return throwError(() => error);
        }));
      }
      if (request.method === 'GET' && !error.status && offline.enabled()) {
        offline.online.set(false);
        return copy();
      }
      return throwError(() => error);
    }),
  );
  };
  if (request.method !== 'GET' || request.responseType !== 'json') return network();
  let cached = cache.get(key);
  if (!cached && offline.enabled() && offline.unlocked()) {
    const entry = offline.readCopy(key);
    const savedAt = entry ? Date.parse(entry.savedAt) : 0;
    if (entry && Date.now() - savedAt < QUERY_FRESH_MS && cache.valid(scope, savedAt)) {
      cache.put(key, new HttpResponse({ status: 200, body: readBody(entry), headers: new HttpHeaders(entry.headers), url: request.urlWithParams }), scope, savedAt);
      cached = cache.get(key);
    }
  }
  if (cached) {
    if (Date.now() - cached.savedAt >= QUERY_RECHECK_MS) cache.fetch(key, () => network(true)).subscribe({ error: () => undefined });
    if (offline.enabled() && offline.unlocked()) {
      const response = cached.response, savedAt = cached.savedAt;
      return from((async () => {
        try {
          const entry = await serializeRead(response.body, new Date(savedAt).toISOString(), {});
          if (sameSession() && cache.valid(scope, savedAt)) await offline.rememberRead(key, entry);
        } catch { /* A storage failure does not hide a valid session copy. */ }
        return response;
      })());
    }
    return of(cached.response);
  }
  return cache.fetch(key, () => network());
};
