import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../auth';
import { OwnerFamilyMessagesService } from '../../../features/dashboard-proprietaire/family-messages.service';
import { SelfSpaceService } from '../../../shared/self-space/self-space.service';
import { AcademicContextPicker } from '../../../shared/academic-context';
import { AppShell } from './app-shell';

// These tests exercise shell account gates; academic context has its own API lifecycle.
@Component({ selector: 'app-academic-context', standalone: true, template: '' })
class AcademicContextStub {}

describe('AppShell account readiness', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(role: 'parent' | 'proprietaire') {
    const user = signal({ id: 7, firstName: 'Awa', lastName: 'Diallo', email: 'awa@test.bf', role,
      rawRoles: role === 'proprietaire' ? ['SCHOOL_ADMIN'] : ['PARENT'],
      approved: false, emailVerified: false, requestedSchoolName: 'École', requestedSchoolType: 'PRIMAIRE' });
    const auth = {
      user, role: () => role, isSchoolOwner: () => role === 'proprietaire', selectedSchoolType: () => 'PRIMAIRE',
      ownerModules: () => new Set(), ownerAccess: () => [], logout: vi.fn(),
      refreshCurrentUser: vi.fn(() => of(user())),
      getOwnedSchools: vi.fn(() => of([{ id: 2, name: 'École', type: 'PRIMAIRE' }])),
      loadOwnerAccess: vi.fn(() => of([])),
    };
    const self = { unreadConversationCount: vi.fn(() => of(5)) };
    const messages = { unreadCount: () => 0, refreshUnreadCount: vi.fn(() => of(0)) };
    TestBed.configureTestingModule({ imports: [AppShell], providers: [provideRouter([]),
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
});
