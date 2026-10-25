import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { AuthService } from '../../auth';
import { User } from '../../models';
import { AccountActions } from './account-actions';
import { environment } from '../../../../environments/environment';

describe('AccountActions', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(approved = true) {
    const user = signal({ id: 7, firstName: 'Awa', lastName: 'Diallo', approved, emailVerified: true,
      role: 'enseignant', rawRoles: ['TEACHER', 'PARENT'] });
    const logout = vi.fn();
    const switchRole = vi.fn(async (role: string) => { user.update(current => ({ ...current, role })); return true; });
    TestBed.configureTestingModule({
      imports: [AccountActions],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: AuthService, useValue: { user, logout, switchRole, refreshCurrentUser: vi.fn(() => of(user())) } }],
    });
    const fixture = TestBed.createComponent(AccountActions);
    fixture.detectChanges();
    vi.advanceTimersByTime(1);
    return { fixture, page: fixture.componentInstance, http: TestBed.inject(HttpTestingController), logout, user, switchRole };
  }

  it('shows the active space and lets a multi-role user switch from the profile menu', async () => {
    const { fixture, page, http, switchRole } = setup();
    http.expectOne(`${environment.apiUrl}/notifications/by-user/7`).flush([]);
    expect(fixture.nativeElement.textContent).toContain('Espace Enseignant');
    page.toggle('profile'); fixture.detectChanges();
    const options = fixture.nativeElement.querySelectorAll('.account-spaces button');
    expect(options.length).toBe(2);
    expect(options[0].getAttribute('aria-pressed')).toBe('true');
    await page.changeSpace('parent'); fixture.detectChanges();
    expect(switchRole).toHaveBeenCalledWith('parent');
    expect(fixture.nativeElement.textContent).toContain('Espace Parent');
    expect(page.opened()).toBeNull();
    fixture.destroy();
  });

  it('hides the switcher for a single-role account', () => {
    const { fixture, page, http, user } = setup();
    http.expectOne(`${environment.apiUrl}/notifications/by-user/7`).flush([]);
    user.update(current => ({ ...current, rawRoles: ['TEACHER'] }));
    page.toggle('profile'); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.account-spaces')).toBeNull();
    fixture.destroy();
  });

  it('refreshes role assignments when opening the profile without requiring a new login', () => {
    const { fixture, page, http, user } = setup();
    http.expectOne(`${environment.apiUrl}/notifications/by-user/7`).flush([]);
    user.update(current => ({ ...current, rawRoles: ['TEACHER'] }));
    vi.mocked(TestBed.inject(AuthService).refreshCurrentUser).mockImplementationOnce(() => {
      user.update(current => ({ ...current, rawRoles: ['TEACHER', 'PARENT'] }));
      return of(user() as unknown as User);
    });
    page.toggle('profile'); fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.account-spaces button').length).toBe(2);
    expect(TestBed.inject(AuthService).refreshCurrentUser).toHaveBeenCalledOnce();
    fixture.destroy();
  });

  it('loads real notifications and persists the read state', () => {
    const { fixture, page, http } = setup();
    const item = { id: 3, title: 'Rendez-vous accepté', content: 'Votre rendez-vous est confirmé.', isRead: false, createdAt: '2026-10-15T10:00:00' };
    http.expectOne(`${environment.apiUrl}/notifications/by-user/7`).flush([item]);
    expect(page.unread()).toBe(1);
    page.toggle('notifications');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(item.title);
    page.markRead(item);
    page.markRead(item);
    const request = http.expectOne(`${environment.apiUrl}/notifications/3/read`);
    expect(request.request.method).toBe('PATCH');
    request.flush({ ...item, isRead: true });
    expect(page.unread()).toBe(0);
    http.verify();
    fixture.destroy();
  });

  it('keeps logout inside the profile panel and closes on Escape or an outside click', () => {
    const { fixture, page, http, logout } = setup();
    http.expectOne(`${environment.apiUrl}/notifications/by-user/7`).flush([]);
    expect(fixture.nativeElement.querySelector('.account-logout')).toBeNull();
    page.toggle('profile'); fixture.detectChanges();
    fixture.nativeElement.querySelector('.account-logout').click();
    expect(logout).toHaveBeenCalledOnce();
    page.closeWithKeyboard(); fixture.detectChanges();
    expect(page.opened()).toBeNull();
    page.toggle('notifications');
    page.closeOutside({ target: document.body } as unknown as Event);
    expect(page.opened()).toBeNull();
    fixture.destroy();
  });

  it('does not fetch personal notifications before account approval', () => {
    const { fixture, http } = setup(false);
    http.expectNone(`${environment.apiUrl}/notifications/by-user/7`);
    fixture.destroy();
  });

  it('shows a load error without claiming there are no notifications', () => {
    const { fixture, page, http } = setup();
    http.expectOne(`${environment.apiUrl}/notifications/by-user/7`).flush({}, { status: 500, statusText: 'Error' });
    page.toggle('notifications'); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Aucune notification');
    fixture.destroy();
  });
});
