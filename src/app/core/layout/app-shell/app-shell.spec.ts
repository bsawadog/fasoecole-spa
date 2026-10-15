import { Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { AuthService, SchoolAccess } from '../../auth';
import { OwnerFamilyMessagesService } from '../../../features/dashboard-proprietaire/family-messages.service';
import { SelfSpaceService } from '../../../shared/self-space/self-space.service';
import { AcademicContextPicker } from '../../../shared/academic-context';
import { AppShell } from './app-shell';

// These tests exercise shell account gates; academic context has its own API lifecycle.
@Component({ selector: 'app-academic-context', standalone: true, template: '' })
class AcademicContextStub {
  readonly showSchool = input(true);
  readonly showYear = input(true);
}

describe('AppShell account readiness', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(role: 'parent' | 'proprietaire') {
    const ownerAccess = signal<SchoolAccess[]>([]);
    const schoolContextId = signal<number | null>(null);
    const user = signal({ id: 7, firstName: 'Awa', lastName: 'Diallo', email: 'awa@test.bf', role,
      rawRoles: role === 'proprietaire' ? ['SCHOOL_ADMIN'] : ['PARENT'],
      approved: false, emailVerified: false, requestedSchoolName: 'École', requestedSchoolType: 'PRIMAIRE' });
    const auth = {
      user, role: () => role, isSchoolOwner: () => role === 'proprietaire', selectedSchoolType: () => 'PRIMAIRE',
      ownerModules: () => new Set(), ownerAccess, schoolContextId, logout: vi.fn(),
      refreshCurrentUser: vi.fn(() => of(user())),
      getOwnedSchools: vi.fn(() => of([{ id: 2, name: 'École', type: 'PRIMAIRE' }])),
      loadOwnerAccess: vi.fn(() => of(ownerAccess())),
    };
    const self = { unreadConversationCount: vi.fn(() => of(5)) };
    const messages = { unreadCount: () => 0, refreshUnreadCount: vi.fn(() => of(0)) };
    TestBed.configureTestingModule({ imports: [AppShell], providers: [provideRouter([{ path: 'profil', component: AcademicContextStub }]),
      { provide: AuthService, useValue: auth }, { provide: SelfSpaceService, useValue: self },
      { provide: OwnerFamilyMessagesService, useValue: messages },
    ] });
    TestBed.overrideComponent(AppShell, { remove: { imports: [AcademicContextPicker] }, add: { imports: [AcademicContextStub] } });
    const fixture = TestBed.createComponent(AppShell); fixture.detectChanges(); vi.advanceTimersByTime(1);
    return { fixture, user, auth, self, messages };
  }

  it('hides business menus and delays parent calls until both security gates are complete', () => {
    const { fixture, user, self, auth } = setup('parent');
    expect(fixture.componentInstance.menuItems()).toEqual([]);
    expect(self.unreadConversationCount).not.toHaveBeenCalled(); expect(auth.refreshCurrentUser).toHaveBeenCalled();
    user.update(current => ({ ...current, approved: true })); vi.advanceTimersByTime(20_000);
    expect(self.unreadConversationCount).not.toHaveBeenCalled();
    user.update(current => ({ ...current, emailVerified: true })); fixture.detectChanges(); vi.advanceTimersByTime(20_000);
    expect(fixture.componentInstance.menuItems().length).toBeGreaterThan(0);
    expect(self.unreadConversationCount).toHaveBeenCalledOnce(); expect(fixture.componentInstance.unreadMessages()).toBe(5);
    fixture.destroy();
  });

  it('starts owner school and message calls after verification without recreating the shell', () => {
    const { fixture, user, auth, messages } = setup('proprietaire');
    expect(auth.getOwnedSchools).not.toHaveBeenCalled(); expect(messages.refreshUnreadCount).not.toHaveBeenCalled();
    user.update(current => ({ ...current, approved: true, emailVerified: true }));
    vi.advanceTimersByTime(20_001);
    expect(auth.getOwnedSchools).toHaveBeenCalledWith(7, 'DASHBOARD');
    expect(messages.refreshUnreadCount).toHaveBeenCalledWith([2]);
    vi.advanceTimersByTime(20_000); expect(auth.getOwnedSchools).toHaveBeenCalledOnce();
    fixture.destroy();
  });

  const pendingSchool: SchoolAccess = { schoolId: 3, schoolName: 'BOUBACAR SAWADOGO', schoolType: 'PRIMAIRE',
    status: 'PENDING_APPROVAL', owner: true, jobTitle: 'Propriétaire', modules: ['MANAGEMENT'] };
  const approvedSchool: SchoolAccess = { ...pendingSchool, schoolId: 2, schoolName: 'École primaire la réussite', status: 'ACTIVE' };

  it('only shows an approval preview for the school selected in the global header', () => {
    const { fixture, auth } = setup('proprietaire');
    auth.ownerAccess.set([pendingSchool, approvedSchool]);
    auth.schoolContextId.set(2);
    fixture.detectChanges();
    expect(fixture.componentInstance.selectedContextSchool()?.schoolName).toBe('École primaire la réussite');
    expect(fixture.componentInstance.schoolPreview()).toBeNull();
    auth.schoolContextId.set(3);
    fixture.detectChanges();
    expect(fixture.componentInstance.schoolPreview()?.schoolName).toBe('BOUBACAR SAWADOGO');
    auth.schoolContextId.set(2);
    auth.ownerAccess.set([{ ...pendingSchool }, { ...approvedSchool }]);
    fixture.detectChanges();
    expect(fixture.componentInstance.schoolPreview()).toBeNull();
    fixture.destroy();
  });

  it('never substitutes a different pending school when the selected school is missing from access data', () => {
    const { fixture, auth } = setup('proprietaire');
    auth.schoolContextId.set(2);
    auth.ownerAccess.set([pendingSchool]);
    fixture.detectChanges();
    expect(fixture.componentInstance.selectedContextSchool()).toBeUndefined();
    expect(fixture.componentInstance.schoolPreview()).toBeNull();
    auth.schoolContextId.set(null);
    auth.ownerAccess.set([pendingSchool, approvedSchool]);
    fixture.detectChanges();
    expect(fixture.componentInstance.selectedContextSchool()?.schoolId).toBe(2);
    fixture.destroy();
  });

  it('keeps the context in the shared header and updates the breadcrumb on profile navigation', async () => {
    const { fixture } = setup('parent');
    expect(fixture.componentInstance.modulesOpen()).toBe(true);
    expect(fixture.nativeElement.querySelector('.shell__topbar app-academic-context')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.shell__topbar > .shell__action--logout')).toBeNull();
    await TestBed.inject(Router).navigateByUrl('/profil');
    fixture.detectChanges();
    expect(fixture.componentInstance.breadcrumbs().map(crumb => crumb.label)).toEqual(['Accueil', 'Mon profil']);
    expect(fixture.nativeElement.querySelector('.shell__breadcrumbs [aria-current="page"]').textContent).toContain('Mon profil');
    expect(fixture.componentInstance.modulesOpen()).toBe(true);
    fixture.destroy();
  });
});
