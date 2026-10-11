import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { EMPTY, of, throwError } from 'rxjs';
import { ParentPortalService } from '../self-space/parent-portal.service';
import { SchoolDataSyncService } from '../school-data-sync.service';
import { AppointmentsService, SchoolAppointment } from './appointments.service';
import { Appointments } from './appointments';

describe('Appointments', () => {
  const appointment: SchoolAppointment = { id: 8, schoolId: 2, schoolName: 'École B', organizerName: 'Direction', recipientName: 'Awa', proposedAt: '2099-10-09T10:00', reason: 'Rencontre', status: 'PENDING', response: null, mine: true };
  function setup(owner = true) {
    const api = {
      received: vi.fn(() => of([{ ...appointment, mine: false }, { ...appointment, id: 9, schoolId: 3 }])),
      sent: vi.fn(() => of([appointment])), recipients: vi.fn(() => of([{ userId: 7, fullName: 'Awa', role: 'PARENT' }])),
      create: vi.fn(() => of({ ...appointment, id: 10 })), cancel: vi.fn(() => of(undefined)), decide: vi.fn(() => of(undefined)),
    };
    const portal = { schoolAppointments: vi.fn(() => of([{ id: 1, studentId: 4, studentName: 'Ali', parentName: 'Awa', teacherName: 'Administration', proposedAt: appointment.proposedAt, reason: 'Discussion', status: 'PENDING', response: null }])), decide: vi.fn(() => of(undefined)), teacherDecide: vi.fn(() => of(undefined)), cancel: vi.fn(() => of(undefined)) };
    TestBed.configureTestingModule({ imports: [Appointments], providers: [provideRouter([]),
      { provide: AppointmentsService, useValue: api }, { provide: ParentPortalService, useValue: portal },
      { provide: SchoolDataSyncService, useValue: { watch: () => EMPTY } },
    ] });
    const fixture = TestBed.createComponent(Appointments);
    fixture.componentRef.setInput('owner', owner);
    fixture.componentRef.setInput('schoolId', owner ? 2 : null);
    fixture.detectChanges();
    return { fixture, page: fixture.componentInstance, api, portal };
  }
  it('shows received and sent appointments for the selected school', () => {
    const { page, fixture } = setup();
    expect(page.incoming().map(a => a.id)).toEqual([8]);
    expect(page.pendingCount()).toBe(3);
    expect(fixture.nativeElement.textContent).toContain('Rendez-vous que j’ai pris');
    expect(fixture.nativeElement.textContent).toContain('Accepter');
  });
  it('requires a response and updates a parent request only after success', () => {
    const { page, portal } = setup();
    const request = page.parentRequests()[0];
    page.decide(request, 'ACCEPTED', true);
    expect(portal.decide).not.toHaveBeenCalled();
    page.responses['parent-1'] = 'Bureau de la direction';
    page.decide(request, 'ACCEPTED', true);
    expect(portal.decide).toHaveBeenCalledWith(2, 1, 'ACCEPTED', 'Bureau de la direction');
    expect(page.parentRequests()[0].status).toBe('ACCEPTED');
  });
  it('preserves status when the server rejects a decision', () => {
    const { page, api } = setup(false);
    api.decide.mockReturnValueOnce(throwError(() => new Error('Already handled')));
    page.responses['school-8'] = 'Indisponible';
    page.decide(page.incoming()[0], 'REJECTED');
    expect(page.incoming()[0].status).toBe('PENDING');
    expect(page.error()).toBeTruthy();
    expect(api.sent).not.toHaveBeenCalled();
  });
  it('creates an invitation and allows its organizer to cancel it', () => {
    const { page, api } = setup();
    page.recipientUserId = 7; page.proposedAt = '2099-10-09T10:00'; page.reason = ' Rencontre ';
    page.create();
    expect(api.create).toHaveBeenCalledWith(2, { recipientUserId: 7, proposedAt: '2099-10-09T10:00', reason: 'Rencontre' });
    const sent = page.sent()[0];
    page.cancel(sent);
    expect(api.cancel).toHaveBeenCalledWith(2, 10);
    expect(page.sent()[0].status).toBe('CANCELLED');
  });
  it('prevents requests with a past date or an inaccessible recipient', () => {
    const { page, api } = setup();
    page.recipientUserId = 7; page.proposedAt = '2000-01-01T10:00'; page.reason = 'Rencontre'; page.create();
    page.proposedAt = '2099-10-09T10:00'; page.recipientUserId = 999; page.create();
    expect(api.create).not.toHaveBeenCalled();
  });
  it('groups all sources by status and expiry, with nearest dates first', () => {
    const { page, fixture } = setup();
    page.now.set(new Date('2026-10-09T10:00').getTime());
    page.parentRequests.set([]); page.incoming.set([]);
    page.sent.set([
      { ...appointment, id: 1, proposedAt: '2026-10-12T10:00' },
      { ...appointment, id: 2, proposedAt: '2026-10-10T10:00', status: 'ACCEPTED' },
      { ...appointment, id: 3, proposedAt: '2026-10-08T10:00' },
      { ...appointment, id: 4, proposedAt: '2026-10-01T10:00', status: 'ACCEPTED' },
      { ...appointment, id: 5, proposedAt: '2026-10-01T10:00', status: 'REJECTED' },
      { ...appointment, id: 6, proposedAt: '2026-10-12T10:00', status: 'CANCELLED' },
    ]);
    expect(page.groups().map(g => g.entries.map(e => e.appointment.id))).toEqual([[2, 1], [3, 4], [5], [6]]);
    expect(page.pendingCount()).toBe(1);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#appointments-expired').textContent).toContain('Demande expirée');
    expect(fixture.nativeElement.querySelector('#appointments-expired').querySelector('button')).toBeNull();
  });
  it('lets a parent cancel their own request without approving it', () => {
    const { page, fixture, portal } = setup(false);
    const request = { id: 1, studentId: 4, studentName: 'Ali', parentName: 'Awa', teacherName: 'Administration', proposedAt: appointment.proposedAt, reason: 'Discussion', status: 'PENDING', response: null };
    fixture.componentRef.setInput('legacyRequests', [request]);
    fixture.componentRef.setInput('legacyKind', 'parent');
    fixture.detectChanges();
    const entry = page.entries().find(e => e.legacy)!;
    expect(entry.sent).toBe(true);
    page.respond(entry, 'ACCEPTED');
    expect(portal.teacherDecide).not.toHaveBeenCalled();
    page.cancelEntry(entry);
    expect(portal.cancel).toHaveBeenCalledWith(4, 1);
  });
  it('routes a teacher decision through the assigned class endpoint', () => {
    const { page, fixture, portal } = setup(false);
    fixture.componentRef.setInput('legacyRequests', [{ id: 1, studentId: 4, studentName: 'Ali', parentName: 'Awa', teacherName: 'Teacher', proposedAt: appointment.proposedAt, reason: 'Discussion', status: 'PENDING', response: null }]);
    fixture.componentRef.setInput('legacyKind', 'teacher');
    fixture.componentRef.setInput('teacherClassId', 10);
    fixture.detectChanges();
    page.responses['legacy-1'] = 'Salle 2';
    page.respond(page.entries().find(e => e.legacy)!, 'ACCEPTED');
    expect(portal.teacherDecide).toHaveBeenCalledWith(10, 1, 'ACCEPTED', 'Salle 2');
    expect(portal.decide).not.toHaveBeenCalled();
  });
});
