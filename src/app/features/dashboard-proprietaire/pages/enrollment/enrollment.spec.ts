import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../../../core/auth';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';
import { EnrollmentService, PromotionPlan, YearInfo } from '../../enrollment.service';
import { EnrollmentPage } from './enrollment';

const years: YearInfo[] = [
  { id: 2, label: '2026-2027', startDate: '2026-10-01', endDate: '2027-07-30', current: false,
    classCount: 2, activeStudents: 0, completedStudents: 0, pendingDecisions: 0 },
  { id: 1, label: '2025-2026', startDate: '2025-10-01', endDate: '2026-07-30', current: true,
    classCount: 1, activeStudents: 2, completedStudents: 0, pendingDecisions: 0 },
];

const plan: PromotionPlan = {
  fromYearId: 1, fromYearLabel: '2025-2026', toYearId: 2, toYearLabel: '2026-2027', pending: 2, decided: 0,
  targetClasses: [
    { id: 21, name: 'CP1-A', levelId: 1, levelName: 'CP1', capacity: 40, enrolled: 0 },
    { id: 22, name: 'CP2-A', levelId: 2, levelName: 'CP2', capacity: 1, enrolled: 0 },
  ],
  classes: [{
    classId: 11, className: 'CP1-A', levelId: 1, levelName: 'CP1', lastLevel: false,
    students: [
      { enrollmentId: 101, studentId: 201, firstName: 'Awa', lastName: 'Kaboré', registrationNumber: 'M1',
        annualAverage: 13.5, passMark: 10, suggestedDecision: 'PROMOTED', suggestedClassId: 22,
        decided: false, decision: null, targetClassId: null, targetClassName: null },
      { enrollmentId: 102, studentId: 202, firstName: 'Issa', lastName: 'Zongo', registrationNumber: 'M2',
        annualAverage: 8.25, passMark: 10, suggestedDecision: 'REPEATED', suggestedClassId: 21,
        decided: false, decision: null, targetClassId: null, targetClassName: null },
    ],
  }],
};

describe('EnrollmentPage', () => {
  function setup() {
    const api = {
      overview: vi.fn(() => of({ years })),
      plan: vi.fn(() => of(plan)),
      apply: vi.fn(() => of({ applied: 2, skipped: [] })),
      createYear: vi.fn(() => of({ year: { ...years[0], id: 3, label: '2027-2028' }, classesCopied: 2,
        assignmentsCopied: 0, periodsCopied: 3 })),
      setCurrent: vi.fn(),
      undo: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [EnrollmentPage],
      providers: [
        provideRouter([]),
        { provide: ConfirmationService, useValue: { confirm: () => Promise.resolve(true) } },
        { provide: AuthService, useValue: {
          user: () => ({ id: 7 }),
          getOwnedSchools: () => of([{ id: 5, name: 'École', type: 'PRIMAIRE' }]),
        } },
        { provide: EnrollmentService, useValue: api },
      ],
    });
    const fixture = TestBed.createComponent(EnrollmentPage);
    fixture.detectChanges();
    return { fixture, api, page: fixture.componentInstance };
  }

  it('loads the current year towards the next one with suggested decisions', () => {
    const { fixture, api } = setup();
    expect(api.plan).toHaveBeenCalledWith(5, 1, 2);
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Année en cours');
    expect(text).toContain('Kaboré Awa');
    expect(text).toContain('13.5');
    expect(text).toContain('0 traité(s) · 2 à traiter');
  });

  it('sends the selected decisions with their target class', async () => {
    const { page, api } = setup();
    page.resetSuggestions(page.plan()!.classes[0]);
    await page.applySelected();
    expect(api.apply).toHaveBeenCalledWith(5, 1, 2, [
      { enrollmentId: 101, decision: 'PROMOTED', targetClassId: 22 },
      { enrollmentId: 102, decision: 'REPEATED', targetClassId: 21 },
    ]);
  });

  it('flags an over-full target class and blocks a continuing student without a class', async () => {
    const { page, api } = setup();
    const cls = page.plan()!.classes[0];
    page.resetSuggestions(cls);
    page.setDecision(cls.students[1], cls, 'PROMOTED');
    page.setTarget(cls.students[1], 22);
    expect(page.overCapacity(page.plan()!.targetClasses[1])).toBe(true);

    page.setTarget(cls.students[1], null);
    await page.applySelected();
    expect(api.apply).not.toHaveBeenCalled();
    expect(page.error()).toContain('sans classe');
  });

  it('suggests the following year when preparing a new one', () => {
    const { page, api } = setup();
    page.openYearForm();
    expect(page.yearForm.label).toBe('2027-2028');
    expect(page.yearForm.startDate).toBe('2027-10-01');
    expect(page.yearForm.sourceYearId).toBe(2);
    page.createYear();
    expect(api.createYear).toHaveBeenCalledWith(5, expect.objectContaining({
      label: '2027-2028', sourceYearId: 2, copyClasses: true, copyTeachers: true, copyPeriods: true,
    }));
  });
});
