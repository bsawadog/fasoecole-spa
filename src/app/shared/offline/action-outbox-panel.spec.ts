import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActionOutboxPanel } from './action-outbox-panel';
import { OfflineAttendanceService } from './offline-attendance.service';
import { ConfirmationService } from '../confirmation/confirmation.service';
import { PendingAction } from './action-outbox';

describe('Action outbox controls', () => {
  function setup(attempted = false) {
    const item: PendingAction = { operationId: 'one', userId: 7, role: 'enseignant', path: '/school-life/classes/11/observations',
      payload: { description: 'Observation', observedOn: '2026-11-01', sharedWithFamily: false, studentId: 4 },
      label: 'Observation de discipline', createdAt: '2026-11-01T12:00:00Z', school: '1', year: '2', attempted };
    const offline = { enabled: () => true, pendingActions: signal([item]), lastActionSync: () => null, online: () => true, busy: () => false,
      editAction: vi.fn(async () => ({ ...item, paused: true })), updateAction: vi.fn(async () => {}), removeAction: vi.fn(async () => {}), retryAction: vi.fn(async () => {}), closeActionEditor: vi.fn(async () => {}) };
    TestBed.configureTestingModule({ imports: [ActionOutboxPanel], providers: [
      { provide: OfflineAttendanceService, useValue: offline }, { provide: ConfirmationService, useValue: { confirm: async () => true } },
    ] });
    const fixture = TestBed.createComponent(ActionOutboxPanel); fixture.detectChanges(); return { fixture, page: fixture.componentInstance, offline, item };
  }
  it('presents pending content and pauses the action before allowing corrections', async () => {
    const { fixture, page, offline, item } = setup();
    expect(fixture.nativeElement.textContent).toContain('En attente de confirmation');
    await page.edit(item); fixture.detectChanges(); expect(offline.editAction).toHaveBeenCalledWith('one');
    page.values['description'] = 'Observation corrigée'; await page.save(item);
    expect(offline.updateAction).toHaveBeenCalledWith('one', expect.objectContaining({ description: 'Observation corrigée', studentId: 4 }));
  });
  it('disables changes to an ambiguous attempted send while retaining the retry control', () => {
    const { fixture } = setup(true); const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    expect(buttons.find(button => button.textContent === 'Modifier')?.disabled).toBe(true);
    expect(buttons.find(button => button.textContent === 'Annuler cet ajout')?.disabled).toBe(true);
    expect(buttons.find(button => button.textContent === 'Réessayer')?.disabled).toBe(false);
  });
});
