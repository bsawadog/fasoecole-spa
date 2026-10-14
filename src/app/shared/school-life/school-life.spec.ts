import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { AuthService } from '../../core/auth';
import { SelfSpaceService } from '../self-space/self-space.service';
import { SchoolLifePage } from './school-life';
import { LifeOverview, SchoolLifeService } from './school-life.service';

const data: LifeOverview = { students: [{ id: 4, name: 'Awa', classId: 2, className: 'CM1' }],
  events: [], observations: [], requests: [], books: [], loans: [], homeworks: [] };

describe('School life modules', () => {
  afterEach(() => localStorage.removeItem('fasoecole_owner_school'));
  function setup(scope = 'schools', module = 'calendrier', schools = [{ id: 1, name: 'School' }]) {
    const route = { data: of({ lifeScope: scope, lifeModule: module }) };
    const api = { overview: vi.fn(() => of(data)), create: vi.fn(() => of(undefined)), update: vi.fn(() => of(undefined)) };
    const self = { teacherClasses: vi.fn(() => of([])), myStudents: vi.fn(() => of([{ studentId: 4, fullName: 'Awa', schoolName: 'School' }])) };
    TestBed.configureTestingModule({ imports: [SchoolLifePage], providers: [provideRouter([]),
      { provide: ActivatedRoute, useValue: route }, { provide: SchoolLifeService, useValue: api },
      { provide: SelfSpaceService, useValue: self },
      { provide: AuthService, useValue: { user: () => ({ id: 7, role: 'parent' }), getOwnedSchools: () => of(schools) } },
    ] });
    const fixture = TestBed.createComponent(SchoolLifePage); fixture.detectChanges();
    return { fixture, page: fixture.componentInstance, api };
  }

  it('shows the calendar creation form to authorized school staff', () => {
    const { fixture, api } = setup();
    expect(api.overview).toHaveBeenCalledWith('schools', 1, 'calendrier');
    expect(fixture.nativeElement.textContent).toContain('Ajouter un événement');
  });

  it('uses the school selected in the shared header without a duplicate school selector', () => {
    localStorage.setItem('fasoecole_owner_school', '2');
    const { fixture, api } = setup('schools', 'calendrier', [{ id: 1, name: 'A' }, { id: 2, name: 'B' }]);
    expect(api.overview).toHaveBeenCalledWith('schools', 2, 'calendrier');
    expect(fixture.nativeElement.querySelector('select[name="context"]')).toBeNull();
  });
  it('lets families request documents without exposing school decision controls', () => {
    const { fixture, page, api } = setup('students', 'demandes-administratives');
    expect(fixture.nativeElement.textContent).toContain('Demander un document');
    page.document.reason = 'Application'; page.requestDocument();
    expect(api.create).toHaveBeenCalledWith('students', 4, 'requests', { kind: 'SCHOOL_CERTIFICATE', reason: 'Application' });
    expect(page.document.reason).toBe('');
  });
  it('preserves form input when an operation fails so it can be retried', () => {
    const { page, api } = setup();
    api.create.mockReturnValueOnce(throwError(() => ({ error: { message: 'Offline' } })));
    page.event.title = 'Meeting'; page.event.startsOn = '2026-10-20'; page.event.endsOn = '2026-10-20';
    page.createEvent();
    expect(page.event.title).toBe('Meeting'); expect(page.saving()).toBe(false); expect(page.error()).toBe('Offline');
  });
  it('ignores a late response from a previously selected school', () => {
    const { page, api } = setup();
    const late = new Subject<LifeOverview>(); api.overview.mockReturnValueOnce(late);
    page.reload(); page.contexts.set([{ id: 1, name: 'A' }, { id: 2, name: 'B' }]); page.choose(2);
    late.next({ ...data, students: [] });
    expect(page.data().students).toEqual(data.students); expect(page.contextId()).toBe(2);
  });
  it('prevents a family from modifying a homework status', () => {
    const { page, api } = setup('students', 'suivi-devoirs');
    page.homework({ postId: 9, studentId: 4, studentName: 'Awa', title: 'Work', content: 'Do it', dueOn: '2026-10-20', status: 'TO_DO', feedback: '', editable: false });
    expect(api.update).not.toHaveBeenCalled();
  });
});
