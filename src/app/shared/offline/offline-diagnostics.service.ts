import { Injectable } from '@angular/core';

interface OfflineEvent { at: string; path: string; outcome: string; status?: number; school?: string | null; year?: string | null; }

/** In-memory technical metadata only: never retain bodies, tokens or query values. */
@Injectable({ providedIn: 'root' })
export class OfflineDiagnosticsService {
  private readonly events: OfflineEvent[] = [];
  path(url: string): string {
    try { return new URL(url, 'http://diagnostic.local').pathname; }
    catch { return '(invalid URL)'; }
  }
  record(url: string, outcome: string, context: { status?: number; school?: string | null; year?: string | null } = {}): void {
    this.events.push({ at: new Date().toISOString(), path: this.path(url), outcome, ...context });
    if (this.events.length > 30) this.events.shift();
  }
  snapshot(): OfflineEvent[] { return structuredClone(this.events); }
}
