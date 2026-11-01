import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { MessageOutboxPanel } from './message-outbox-panel';
import { OfflineAttendanceService } from './offline-attendance.service';

describe('Message outbox visibility', () => {
  function setup() {
    const offline = { enabled: signal(true), unlocked: signal(true), online: signal(false), busy: signal(false),
      pendingMessages: signal<any[]>([]), lastMessageSync: signal<string | null>(null), unlock: vi.fn(), synchronize: vi.fn() };
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: OfflineAttendanceService, useValue: offline }] });
    const fixture = TestBed.createComponent(MessageOutboxPanel);
    fixture.componentRef.setInput('showStatus', true); fixture.detectChanges();
    return { fixture, offline };
  }
  it('keeps an explicit empty queue visible in Messages and replaces it with collapsed pending details', () => {
    const { fixture, offline } = setup();
    expect(fixture.nativeElement.textContent).toContain('Aucun message en attente');
    offline.pendingMessages.set([{ operationId: 'one', subject: 'Devoir', createdAt: '2026-11-01T12:00:00' }]); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('summary').textContent).toContain('1 message(s)');
    expect(fixture.nativeElement.querySelector('details').open).toBe(false);
    expect(fixture.nativeElement.textContent).not.toContain('Aucun message en attente');
    offline.pendingMessages.set([]); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Aucun message en attente');
  });
  it('explains disabled and locked states without exposing queued content', () => {
    const { fixture, offline } = setup();
    offline.pendingMessages.set([{ operationId: 'one', subject: 'Texte privé', createdAt: '2026-11-01T12:00:00' }]);
    offline.unlocked.set(false); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('La file est verrouillée');
    expect(fixture.nativeElement.textContent).not.toContain('Texte privé');
    offline.enabled.set(false); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a').getAttribute('href')).toBe('/profil');
    expect(fixture.nativeElement.textContent).toContain('désactivé');
  });
  it('keeps the compact indicator hidden on other pages when nothing is waiting', () => {
    const { fixture } = setup();
    fixture.componentRef.setInput('showStatus', false); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('section')).toBeNull();
  });
});
