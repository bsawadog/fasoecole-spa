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
    vi.spyOn(window, 'open').mockReturnValue(null);
    const api = {
      overview: vi.fn(() => of({ years })),
      plan: vi.fn(() => of(plan)),
      apply: vi.fn(() => of({ applied: 2, skipped: [] })),
      createYear: vi.fn(() => of({ year: { ...years[0], id: 3, label: '2027-2028' }, classesCopied: 2,
        assignmentsCopied: 0, periodsCopied: 3 })),
      setCurrent: vi.fn(),
      undo: vi.fn(),
      yearClasses: vi.fn((_schoolId: number, yearId: number) => of(yearId === 1 ? [
        { id: 11, name: 'CP1-A', levelId: 1, levelName: 'CP1', capacity: 1, enrolled: 1 },
        { id: 12, name: 'CP1-B', levelId: 1, levelName: 'CP1', capacity: 40, enrolled: 3 },
      ] : [
        { id: 21, name: 'CE1-A', levelId: 2, levelName: 'CE1', capacity: 40, enrolled: 0 },
      ])),
      searchGuardians: vi.fn(() => of([
        { parentId: 41, firstName: 'Moussa', lastName: 'Kaboré', email: 'moussa@x.bf', phone: '70000001', children: ['Ali Kaboré'] },
      ])),
      enrollmentFees: vi.fn(() => of([
        { id: 31, name: 'Inscription', amount: 10000, frequency: 'ONE_TIME', levelId: null },
        { id: 32, name: 'Scolarité CP1', amount: 50000, frequency: 'YEARLY', levelId: 1 },
        { id: 33, name: 'Scolarité CM2', amount: 60000, frequency: 'YEARLY', levelId: 6 },
      ])),
      registerStudent: vi.fn(() => of({
        student: {
          studentId: 300, firstName: 'Sali', lastName: 'Ouédraogo', email: 'sali@ecole.bf', phone: null,
          registrationNumber: 'MAT-2025-005', birthDate: null, gender: null, teacherNames: [],
          parents: [{ parentId: 9, userId: 90, firstName: 'Issa', lastName: 'Ouédraogo', email: null, phone: '70112233', relationship: 'Père' }],
        },
        schoolName: 'École', className: 'CP1-B', yearLabel: '2025-2026',
        invoices: [
          { id: 1, feeTypeId: 31, feeTypeName: 'Inscription', amountDue: 10000, dueDate: '2026-07-30', status: 'PAID',
            totalPaid: 10000, balance: 0, payments: [{ id: 5, amount: 10000, paymentDate: '2026-10-01', method: 'CASH', reference: '2026-0007' }] },
          { id: 2, feeTypeId: 32, feeTypeName: 'Scolarité CP1', amountDue: 50000, dueDate: '2026-07-30', status: 'PENDING',
            totalPaid: 20000, balance: 30000, payments: [{ id: 6, amount: 20000, paymentDate: '2026-10-01', method: 'CASH', reference: '2026-0008' }] },
        ],
      })),
    };
    TestBed.configureTestingModule({
      imports: [EnrollmentPage],
      providers: [
        provideRouter([]),
        { provide: ConfirmationService, useValue: { confirm: () => Promise.resolve(true) } },
        { provide: AuthService, useValue: {
          user: () => ({ id: 7 }),
          selectSchoolContext: vi.fn(), selectedSchoolType: () => 'PRIMAIRE', getOwnedSchools: () => of([{ id: 5, name: 'École', type: 'PRIMAIRE' }]),
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

  it('registers a new student in the first class with room of the current year', () => {
    const { fixture, page, api } = setup();
    page.openNewStudent();
    expect(api.yearClasses).toHaveBeenCalledWith(5, 1);
    expect(api.yearClasses).toHaveBeenCalledWith(5, 2);
    expect(page.newStudentClassGroups().map((g) => g.label)).toEqual(['2025-2026 (en cours)', '2026-2027']);
    expect(page.newStudentClasses().map((c) => c.id)).toEqual([11, 12, 21]);
    expect(page.newStudentForm.classId).toBe(12);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('(complète)');

    page.registerStudent();
    expect(api.registerStudent).not.toHaveBeenCalled();
    expect(page.error()).toContain('courriel');

    Object.assign(page.newStudentForm, {
      firstName: ' Sali ', lastName: 'Ouédraogo', email: 'sali@ecole.bf',
    });
    page.registerStudent();
    expect(api.registerStudent).not.toHaveBeenCalled();
    expect(page.error()).toContain('parent ou tuteur');
    Object.assign(page.guardians[0], { firstName: ' Issa ', lastName: 'Ouédraogo', phone: '70112233' });
    page.addGuardian();
    expect(page.guardians[1].relationship).toBe('Mère');
    page.removeGuardian(1);
    expect(page.guardians.length).toBe(1);
    expect(page.availableFees().map((f) => f.id)).toEqual([31, 32]);
    page.toggleFee(page.availableFees()[0], true);
    page.toggleFee(page.availableFees()[1], true);
    page.feeChoices[32].amountPaid = 60000;
    page.registerStudent();
    expect(api.registerStudent).not.toHaveBeenCalled();
    expect(page.error()).toContain('Scolarité CP1');

    page.feeChoices[32].amountPaid = 20000;
    expect(page.totalDue()).toBe(60000);
    expect(page.totalPaid()).toBe(30000);
    const print = vi.spyOn(page, 'printEnrollmentReceipt').mockImplementation(() => undefined);
    page.registerStudent();
    expect(api.registerStudent).toHaveBeenCalledWith(5, expect.objectContaining({
      classId: 12, firstName: 'Sali', registrationNumber: null, phone: null,
      fees: [{ feeTypeId: 31, amountPaid: 10000 }, { feeTypeId: 32, amountPaid: 20000 }],
      paymentMethod: 'CASH',
      guardians: [{ parentId: null, firstName: 'Issa', lastName: 'Ouédraogo', email: null, phone: '70112233', relationship: 'Père' }],
    }));
    expect(page.success()).toContain('Sali Ouédraogo est inscrit(e) en CP1-B (2025-2026) sous le matricule MAT-2025-005');
    expect(page.guardians[0].firstName).toBe('');
    expect(page.success()).toContain('Paiement de');
    expect(print).toHaveBeenCalled();
    expect(page.lastRegistration()?.student.studentId).toBe(300);
    expect(page.newStudentForm.firstName).toBe('');
    expect(page.newStudentForm.classId).toBe(12);
    expect(page.feeChoices[31].selected).toBe(false);
    expect(page.newStudentClasses()[1].enrolled).toBe(4);
  });

  it('attaches an existing parent found by search', () => {
    vi.useFakeTimers();
    try {
      const { fixture, page, api } = setup();
      page.openNewStudent();
      Object.assign(page.newStudentForm, {
        firstName: 'Sali', lastName: 'Kaboré', email: 'sali@ecole.bf',
      });
      page.setGuardianMode(0, 'existing');
      page.registerStudent();
      expect(api.registerStudent).not.toHaveBeenCalled();
      expect(page.error()).toContain('parent existant');

      page.searchGuardian(0, 'k');
      vi.advanceTimersByTime(400);
      expect(api.searchGuardians).not.toHaveBeenCalled();
      page.searchGuardian(0, 'kab');
      vi.advanceTimersByTime(400);
      expect(api.searchGuardians).toHaveBeenCalledWith(5, 'kab');
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('parent de Ali Kaboré');

      page.selectGuardian(0, page.guardianResults()[0][0]);
      page.addGuardian();
      page.setGuardianMode(1, 'existing');
      page.selectGuardian(1, { parentId: 41, firstName: 'Moussa', lastName: 'Kaboré', email: null, phone: null, children: [] });
      expect(page.error()).toContain('déjà choisi');
      page.removeGuardian(1);

      page.registerStudent();
      expect(api.registerStudent).toHaveBeenCalledWith(5, expect.objectContaining({
        guardians: [{ parentId: 41, firstName: 'Moussa', lastName: 'Kaboré', email: null, phone: null, relationship: 'Père' }],
      }));
    } finally {
      vi.useRealTimers();
    }
  });

  it('prints an enrollment receipt listing fees, references and balance', () => {
    const { page, api } = setup();
    const doc = { write: vi.fn(), close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue({ document: doc, focus: vi.fn(), print: vi.fn() } as never);
    let result: unknown;
    api.registerStudent().subscribe((r: unknown) => (result = r));
    page.printEnrollmentReceipt(result as never);
    const html = doc.write.mock.calls[0][0] as string;
    expect(html).toContain('Reçu d’inscription');
    expect(html).toContain('2026-0007, 2026-0008');
    expect(html).toContain('Scolarité CP1');
    expect(html).toContain('Ouédraogo Issa (70112233)');
    expect(html).toContain('Espèces');
    expect(html).toMatch(/Reste à payer : 30\s000 FCFA/);
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
