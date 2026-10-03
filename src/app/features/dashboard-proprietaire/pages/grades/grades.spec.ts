import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../../../core/auth';
import { OwnerManagementService } from '../../owner-management.service';
import { EvaluationInfo, GradePeriod, GradesService } from '../../grades.service';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';
import { GradesPage } from './grades';

const period: GradePeriod = {
  id: 3, schoolId: 5, academicYearId: 9, academicYearLabel: '2026-2027', code: 'TERM1', name: '1er trimestre',
  startDate: '2026-09-01', endDate: '2026-12-20', passMark: 10, status: 'OPEN', publishedAt: null, evaluationCount: 1,
};

const evaluation: EvaluationInfo = {
  id: 51, classSubjectTeacherId: 31, subjectId: 41, subjectName: 'Mathématiques', teacherName: 'Paul Ouédraogo',
  periodId: 3, title: 'Devoir 1', type: 'DEVOIR', evalDate: '2026-10-10', maxValue: 20, weight: 1, gradedCount: 1,
  studentCount: 2, averageOn20: 16,
};

describe('GradesPage', () => {
  function setup() {
    const grades = {
      periods: vi.fn(() => of([period])),
      summary: vi.fn(() => of({
        period, average: 12.5, passRate: 75, studentCount: 4, rankedCount: 4,
        classes: [{ classId: 1, className: '6e A', levelName: '6e', studentCount: 4, rankedCount: 4, average: 12.5,
          passRate: 75, reportCards: 0 }],
      })),
      subjects: vi.fn(() => of([{ subjectId: 41, subjectName: 'Mathématiques', coefficient: 2,
        defaultCoefficient: 2, overridden: false,
        assignments: [{ classSubjectTeacherId: 31, teacherId: 8, teacherName: 'Paul Ouédraogo', active: true }] }])),
      evaluations: vi.fn(() => of([evaluation])),
      sheet: vi.fn(() => of({ evaluation, period, className: '6e A', rows: [
        { studentId: 20, fullName: 'Awa Kaboré', registrationNumber: 'M-20', value: 16 },
        { studentId: 21, fullName: 'Issa Zongo', registrationNumber: 'M-21', value: null },
      ] })),
      saveGrades: vi.fn(() => of({ created: 1, updated: 1, deleted: 0, unchanged: 0 })),
    };
    TestBed.configureTestingModule({
      imports: [GradesPage],
      providers: [
        provideRouter([]),
        { provide: ConfirmationService, useValue: { confirm: () => Promise.resolve(true) } },
        { provide: AuthService, useValue: {
          user: () => ({ id: 7 }),
          selectSchoolContext: vi.fn(), selectedSchoolType: () => 'PRIMAIRE', getOwnedSchools: () => of([{ id: 5, name: 'École', type: 'SECONDAIRE' }]),
        } },
        { provide: OwnerManagementService, useValue: {
          getAcademicYears: () => of([{ id: 9, schoolId: 5, label: '2026-2027', startDate: '2026-09-01',
            endDate: '2027-06-30', isCurrent: true }]),
          getClasses: () => of([{ id: 1, schoolId: 5, name: '6e A', levelId: 8, academicYearId: 9, capacity: 30 }]),
          getLevels: () => of([{ id: 8, schoolId: 5, name: '6e', cycle: 'COLLEGE', orderIndex: 10 }]),
        } },
        { provide: GradesService, useValue: grades },
      ],
    });
    const fixture = TestBed.createComponent(GradesPage);
    fixture.detectChanges();
    return { fixture, grades };
  }

  it('shows the school results summary for the selected period', () => {
    const { fixture, grades } = setup();
    expect(grades.summary).toHaveBeenCalledWith(3);
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Taux de réussite');
    expect(text).toContain('75 %');
    expect(text).toContain('6e · 6e A');
  });

  it('requires a reason before changing an existing grade', () => {
    const { fixture, grades } = setup();
    const page = fixture.componentInstance;
    page.setTab('entry');
    fixture.detectChanges();
    expect(grades.evaluations).toHaveBeenCalledWith(1, 3);
    expect(fixture.nativeElement.textContent).toContain('Devoir 1');

    page.openSheet(evaluation);
    page.sheetValues[20] = 15;
    page.sheetValues[21] = 12;
    page.saveSheet();
    expect(grades.saveGrades).not.toHaveBeenCalled();
    expect(page.error()).toContain('motif');

    page.sheetReason = 'Erreur de report';
    page.saveSheet();
    expect(grades.saveGrades).toHaveBeenCalledWith(51,
      [{ studentId: 20, value: 15 }, { studentId: 21, value: 12 }], 'Erreur de report');
  });
});
