import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';
import { OwnerManagementService } from '../../owner-management.service';
import { TeacherDetail, TeacherWorkService } from '../../teacher-work.service';
import { TeacherDetailPage } from './teacher-detail';

describe('TeacherDetailPage', () => {
  const month = {
    plannedHours: 10, workedHours: 2, absenceHours: 1, extraHours: 0,
    amountDue: 2000, paid: 0, remaining: 2000, perClass: [],
    sessions: [{ slotId: 4, date: '2026-09-15', classId: 1, className: 'L1',
      startTime: '08:00', endTime: '10:00', status: 'PENDING' as const, hours: 2 }],
    extras: [], payments: [],
  };
  const data: TeacherDetail = {
    teacher: { id: 3, schoolId: 2, firstName: 'Awa', lastName: 'Traoré',
      email: 'awa@example.test', phone: null, specialty: null, subjects: ['Mathématiques'], activeInClass: null, classCount: 1 },
    rateType: 'HOURLY', rate: 1000, schedule: [], month,
  };

  it('loads the teacher and records a dated presence against the selected month', () => {
    const detail = vi.fn(() => of(data));
    const pointSession = vi.fn(() => of(undefined));
    TestBed.configureTestingModule({
      imports: [TeacherDetailPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => '3' } } } },
        { provide: TeacherWorkService, useValue: { detail, pointSession } },
        { provide: OwnerManagementService, useValue: { getClasses: () => of([]), getLevels: () => of([]) } },
        { provide: ConfirmationService, useValue: {} },
      ],
    });

    const fixture = TestBed.createComponent(TeacherDetailPage);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const monthInput = fixture.nativeElement.querySelector('input[type="month"]') as HTMLInputElement;
    monthInput.value = '2026-09';
    monthInput.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(detail).toHaveBeenCalledWith(3, '2026-09');
    expect(component.detail()?.teacher.firstName).toBe('Awa');
    expect(fixture.nativeElement.textContent).toContain('Calendrier et pointage');
    component.point(month.sessions[0], 'PRESENT');
    expect(pointSession).toHaveBeenCalledWith(3, {
      slotId: 4, date: '2026-09-15', status: 'PRESENT',
    });
    expect(detail).toHaveBeenCalledTimes(3);
  });
});
