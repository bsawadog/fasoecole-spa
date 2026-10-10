import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import { AuthService } from '../../core/auth';
import { SelfSpaceService } from '../self-space/self-space.service';
import { ParentPortalService } from '../self-space/parent-portal.service';
import { AppointmentsService } from './appointments.service';
import { AppointmentOverviewService } from './appointment-overview.service';

describe('AppointmentOverviewService', () => {
  function setup() {
    const received = { id: 8, proposedAt: '2099-01-01T10:00', status: 'PENDING', schoolId: 2 };
    const legacy = { id: 1, proposedAt: '2099-01-01T10:00', status: 'PENDING' };
    const api = { received: vi.fn(() => of([received])), sent: vi.fn(() => of([])) };
    const portal = { appointments: vi.fn(() => of([legacy])), teacherAppointments: vi.fn(() => of([legacy])), schoolAppointments: vi.fn(() => of([legacy])) };
    const self = { myStudents: vi.fn(() => of([{ studentId: 1 }, { studentId: 2 }])), teacherClasses: vi.fn(() => of([{ classId: 10 }, { classId: 11 }])) };
    TestBed.configureTestingModule({ providers: [
      { provide: AppointmentsService, useValue: api }, { provide: ParentPortalService, useValue: portal },
      { provide: SelfSpaceService, useValue: self }, { provide: AuthService, useValue: { user: () => ({ id: 10 }), getOwnedSchools: () => of([{ id: 2 }]) } },
    ] });
    return { service: TestBed.inject(AppointmentOverviewService), api, portal, self };
  }
  it('includes invitations and requests for every child without double counting', async () => {
    const { service, portal, self } = setup();
    const rows = await firstValueFrom(service.load('parent'));
    expect(rows).toHaveLength(2);
    expect(portal.appointments).toHaveBeenCalledWith(1);
    expect(portal.appointments).toHaveBeenCalledWith(2);
    expect(self.teacherClasses).not.toHaveBeenCalled();
  });
  it('deduplicates a teacher request returned for several assigned classes', async () => {
    const { service, portal } = setup();
    expect(await firstValueFrom(service.load('teacher'))).toHaveLength(2);
    expect(portal.teacherAppointments).toHaveBeenCalledWith(10);
    expect(portal.teacherAppointments).toHaveBeenCalledWith(11);
  });
  it('loads only personal invitations for student or platform administration', async () => {
    const { service, portal, self } = setup();
    expect(await firstValueFrom(service.load('personal'))).toHaveLength(1);
    expect(self.myStudents).not.toHaveBeenCalled();
    expect(self.teacherClasses).not.toHaveBeenCalled();
    expect(portal.schoolAppointments).not.toHaveBeenCalled();
  });
});
