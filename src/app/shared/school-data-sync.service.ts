import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { auditTime, catchError, defer, distinctUntilChanged, EMPTY, expand, filter, fromEvent, map, merge, Observable, of, retry, share, switchMap, tap, timer } from 'rxjs';
import { environment } from '../../environments/environment';
import { ModuleQueryCache } from './offline/module-query-cache';

interface Revision { revision: number; date: string; }

/** Une connexion partagée par établissement, avec reprise et actualisation de secours. */
@Injectable({ providedIn: 'root' })
export class SchoolDataSyncService {
  private readonly http = inject(HttpClient);
  private readonly cache = inject(ModuleQueryCache);
  private readonly streams = new Map<number,Observable<void>>();
  readonly connections = signal<Record<number,boolean>>({});
  watch(schoolId: number, domains?: readonly string[]): Observable<void> {
    let stream = this.streams.get(schoolId);
    if (!stream) {
    let previous: Revision | undefined;
    const request = (since?: number) => this.http.get<Revision>(`${environment.apiUrl}/schools/${schoolId}/changes`, {
      params: since === undefined ? {} : { since },
    });
    const live = defer(() => request()).pipe(
      expand(value => request(value.revision)),
      map(value => { this.connections.update(state => ({...state,[schoolId]:true})); return value; }),
      retry({ delay: () => { this.connections.update(state => ({...state,[schoolId]:false})); return timer(5000); } }),
      distinctUntilChanged((a,b) => a.revision === b.revision && a.date === b.date),
      tap(value => {
        if (previous && (previous.revision !== value.revision || previous.date !== value.date)) this.cache.invalidateSchool(schoolId);
        previous = value;
      }),
      map(() => undefined),
      catchError(() => EMPTY),
    );
    const connected = typeof window === 'undefined' ? of(true) : merge(
      of(navigator.onLine), fromEvent(window, 'online').pipe(map(() => true)),
      fromEvent(window, 'offline').pipe(map(() => false)),
    );
    const available = connected.pipe(distinctUntilChanged(), switchMap(online => {
      if (!online) { this.connections.update(state => ({...state,[schoolId]:false})); return EMPTY; }
      return merge(live,timer(30_000,30_000).pipe(map(() => undefined)));
    }));
    stream = available.pipe(share());
    this.streams.set(schoolId,stream);
    }
    return merge(stream, this.cache.refreshed.pipe(
      filter(scope => (scope.school === null || scope.school === schoolId) && (!domains || domains.includes(scope.domain))),
      map(() => undefined),
    )).pipe(auditTime(150));
  }
}
