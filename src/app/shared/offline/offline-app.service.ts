import { Injectable, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { firstValueFrom, from, fromEvent, take, timeout } from 'rxjs';

/** An active worker can still be downloading its application files. */
@Injectable({ providedIn: 'root' })
export class OfflineAppService {
  private readonly updates = inject(SwUpdate, { optional: true });
  readonly supported = !!this.updates?.isEnabled;
  readonly ready = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  private pending?: Promise<void>;

  constructor() {
    if (this.supported) void this.prepare().catch(() => undefined);
  }

  prepare(): Promise<void> {
    if (!this.supported || this.ready()) return Promise.resolve();
    if (this.pending) return this.pending;
    this.busy.set(true); this.error.set(null);
    this.pending = this.install().then(() => this.ready.set(true)).catch(() => {
      const message = 'Préparation hors connexion incomplète. Gardez Internet et réessayez avant de couper la connexion.';
      this.error.set(message);
      throw new Error(message);
    }).finally(() => { this.busy.set(false); this.pending = undefined; });
    return this.pending;
  }

  retry(): void { void this.prepare().catch(() => undefined); }

  private async install(): Promise<void> {
    await firstValueFrom(from(navigator.serviceWorker.ready).pipe(timeout(30_000)));
    if (!navigator.serviceWorker.controller) {
      await firstValueFrom(fromEvent(navigator.serviceWorker, 'controllerchange').pipe(take(1), timeout(30_000)));
    }
    // This controlled fetch waits for Angular's worker initialization, including
    // every prefetched asset. ServiceWorkerContainer.ready alone does not.
    const shellUrl = new URL('index.csr.html', document.baseURI);
    const response = await fetch(shellUrl, {
      cache: 'no-cache', signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error('Application shell unavailable');
    const html = await response.text();
    const page = new DOMParser().parseFromString(html, 'text/html');
    const files = Array.from(page.querySelectorAll('script[src],link[rel="stylesheet"][href]'))
      .map(element => new URL(element.getAttribute('src') ?? element.getAttribute('href')!, shellUrl).href);
    // A degraded worker can fall through to the network and return 200. Require
    // the same shell and its entry files in one installed cache before declaring
    // success; a successful online response alone does not prove offline access.
    for (const name of await caches.keys()) {
      const cache = await caches.open(name), stored = await cache.match(shellUrl);
      if (!stored?.ok || await stored.text() !== html) continue;
      const entries = await Promise.all(files.map(file => cache.match(file)));
      if (entries.every(entry => entry?.ok)) return;
    }
    throw new Error('Application files are not cached yet');
  }
}
