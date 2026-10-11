import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { AuthService } from '../../../../core/auth';
import { OwnerManagementService, StudentRecord } from '../../owner-management.service';
import { PeopleDirectory } from './people-directory';

describe('PeopleDirectory', () => {
  const student: StudentRecord = { id: 7, userId: 70, schoolId: 1, firstName: 'Ali', lastName: 'Kaboré', email: 'ali@ecole.bf', registrationNumber: '001', birthDate: null, gender: null };
  function setup(path = 'eleves') {
    localStorage.removeItem('fasoecole_owner_school');
    const api = {
      getStudents: vi.fn(() => of([student])),
      getClasses: vi.fn(() => of([{ id: 100 }, { id: 101 }])),
      getClassRoster: vi.fn(() => of([{ studentId: 7, parents: [{ parentId: 8, firstName: 'Awa', lastName: 'Kaboré', email: null, phone: '123' }] }])),
    };
    TestBed.configureTestingModule({
      imports: [PeopleDirectory], providers: [provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { routeConfig: { path } } } },
        { provide: AuthService, useValue: { user: () => ({ id: 10 }), selectSchoolContext: vi.fn(), getOwnedSchools: () => of([{ id: 1, name: 'École A' }, { id: 2, name: 'École B' }]) } },
        { provide: OwnerManagementService, useValue: api },
      ],
    });
    const fixture = TestBed.createComponent(PeopleDirectory);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, api };
  }
  it('lists students without requiring a class and links to their own file', () => {
    const { fixture, component, api } = setup();
    expect(api.getClasses).not.toHaveBeenCalled();
    expect(component.students()).toEqual([student]);
    expect(fixture.nativeElement.querySelector('a.class-roster__action').getAttribute('href')).toBe('/proprietaire/eleves/7');
    component.search.set('kabore 001');
    expect(component.filteredStudents()).toHaveLength(1);
    component.search.set('inconnu');
    expect(component.filteredStudents()).toHaveLength(0);
  });
  it('deduplicates parents and children across class rosters', () => {
    const { component } = setup('parents');
    expect(component.parents()).toHaveLength(1);
    expect(component.parents()[0].children).toEqual([student]);
  });
  it('cancels an old school request when switching schools', () => {
    const { component, api } = setup();
    const oldRequest = new Subject<StudentRecord[]>();
    api.getStudents.mockReturnValueOnce(oldRequest);
    component.selectSchool(1);
    api.getStudents.mockReturnValueOnce(of([{ ...student, id: 9, schoolId: 2 }]));
    component.selectSchool(2);
    oldRequest.next([student]);
    expect(component.students().map(s => s.id)).toEqual([9]);
  });
});
