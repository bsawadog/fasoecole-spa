import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, Subject, throwError } from 'rxjs';
import { EnseignantClasses } from './classes';
import { SelfSpaceService, RosterStudent, TeacherClass, ScheduleEntry } from '../../../../shared/self-space/self-space.service';
import { SchoolDataSyncService } from '../../../../shared/school-data-sync.service';
import { OfflineAttendanceService } from '../../../../shared/offline/offline-attendance.service';

describe('Mes classes offline', () => {
  const classes: TeacherClass[] = [11, 12].map(classId => ({ classId, schoolId: 1, className: `Classe ${classId}`, subjects: [],
    levelName: null, schoolName: 'École', academicYearId: 1, academicYearLabel: '2026-2027', currentYear: true, studentCount: 1 }));
  const students: RosterStudent[] = [{ studentId: 1, fullName: 'Awa', registrationNumber: 'A', gender: 'F', birthDate: '2017-01-01' }];
  const schedule = [{ id: 1, classId: 11, dayOfWeek: 1, startTime: '08:00', endTime: '09:00', className: 'Classe 11', schoolName: 'École', subjects: 'Maths', teacherName: 'Issa' }] as ScheduleEntry[];
  function setup(online = true, unlocked = true) {
    const rosters = new Map<number, RosterStudent[]>([[11, structuredClone(students)]]);
    const changes = new Subject<void>();
    const offline = {
      enabled: signal(true), unlocked: signal(unlocked), online: signal(online),
      cachedClasses: () => unlocked ? classes : [], cachedClassSelection: () => 11,
      rememberClassSelection: vi.fn(), rememberClasses: vi.fn(),
      rememberRoster: vi.fn((id: number, rows: RosterStudent[]) => rosters.set(id, structuredClone(rows))),
      cachedRoster: (id: number) => rosters.get(id),
      rememberSchedule: vi.fn(), cachedSchedule: () => schedule,
    };
    const api = {
      teacherClasses: vi.fn(() => of(classes)), teacherSchedule: vi.fn(() => of(schedule)),
      classStudents: vi.fn(() => offline.online() ? of(structuredClone(students)) : throwError(() => ({ status: 0 }))), teacherFamilyReports: vi.fn(() => of([])),
      teacherConversations: vi.fn(() => of([])),
    };
    TestBed.configureTestingModule({ imports: [EnseignantClasses], providers: [
      { provide: OfflineAttendanceService, useValue: offline },
      { provide: SelfSpaceService, useValue: api },
      { provide: SchoolDataSyncService, useValue: { watch: () => changes } },
    ] });
    TestBed.overrideComponent(EnseignantClasses, { set: { template: '' } });
    const fixture = TestBed.createComponent(EnseignantClasses); fixture.detectChanges();
    return { fixture, page: fixture.componentInstance, api, offline, changes };
  }
  it('remembers class lists, consulted rosters and timetable during the unlocked session', () => {
    const { page, api, offline } = setup();
    expect(page.students()).toEqual(students);
    expect(offline.rememberClasses).toHaveBeenCalledWith(classes);
    expect(offline.rememberRoster).toHaveBeenCalledWith(11, students);
    expect(offline.rememberSchedule).toHaveBeenCalledWith(schedule);
    expect(api.teacherFamilyReports).toHaveBeenCalled();
  });
  it('opens offline from the session cache without requests or misleading empty data', () => {
    const { page, api, changes } = setup(false);
    expect(page.classes()).toEqual(classes); expect(page.students()).toEqual(students);
    expect(page.schedule()).toEqual(schedule); expect(page.error()).toBeNull();
    changes.next();
    for (const request of [api.teacherClasses, api.teacherSchedule, api.classStudents]) expect(request).not.toHaveBeenCalled();
    expect(api.teacherFamilyReports).toHaveBeenCalled();
    page.select(12);
    expect(page.rosterUnavailable()).toBe(true); expect(page.students()).toEqual([]);
    page.select(11);
    expect(page.rosterUnavailable()).toBe(false); expect(page.students()).toEqual(students);
  });
  it('refreshes the same class automatically when Internet returns', () => {
    const { fixture, page, api, offline } = setup(false);
    offline.online.set(true); fixture.detectChanges();
    expect(api.teacherClasses).toHaveBeenCalledOnce();
    expect(api.classStudents).toHaveBeenCalledWith(11);
    expect(page.selectedId()).toBe(11); expect(page.students()).toEqual(students);
  });
  it('clears displayed class data when the session is locked', () => {
    const { fixture, page, offline } = setup();
    offline.online.set(false); offline.unlocked.set(false); fixture.detectChanges();
    expect(page.classes()).toEqual([]); expect(page.students()).toEqual([]); expect(page.schedule()).toEqual([]);
    expect(page.conversations()).toEqual([]);
  });
});
