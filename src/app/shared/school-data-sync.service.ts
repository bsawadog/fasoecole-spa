import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { auditTime, catchError, defer, distinctUntilChanged, EMPTY, expand, map, merge, Observable, retry, share, timer } from 'rxjs';
import { environment } from '../../environments/environment';

interface Revision { revision: number; date: string; }

/** Une connexion partagée par établissement, avec reprise et actualisation de secours. */
@Injectable({ providedIn: 'root' })
export class SchoolDataSyncService {
  private readonly http = inject(HttpClient);
  private readonly streams = new Map<number,Observable<void>>();
  readonly connections = signal<Record<number,boolean>>({});
  watch(schoolId: number): Observable<void> {
    const existing = this.streams.get(schoolId); if (existing) return existing;
    const request = (since?: number) => this.http.get<Revision>(`${environment.apiUrl}/schools/${schoolId}/changes`, {
      params: since === undefined ? {} : { since },
    });
    const live = defer(() => request()).pipe(
      expand(value => request(value.revision)),
      map(value => { this.connections.update(state => ({...state,[schoolId]:true})); return value; }),
      retry({ delay: () => { this.connections.update(state => ({...state,[schoolId]:false})); return timer(5000); } }),
      distinctUntilChanged((a,b) => a.revision === b.revision && a.date === b.date),
      map(() => undefined),
      catchError(() => EMPTY),
    );
    const stream = merge(live,timer(30_000,30_000).pipe(map(() => undefined))).pipe(auditTime(150),share());
    this.streams.set(schoolId,stream); return stream;
  }
}
