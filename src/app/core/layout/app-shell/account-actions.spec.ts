import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { AuthService } from '../../auth';
import { AccountActions } from './account-actions';
import { environment } from '../../../../environments/environment';

describe('AccountActions', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(approved = true) {
    const user = signal({ id: 7, firstName: 'Awa', lastName: 'Diallo', approved, emailVerified: true });
    const logout = vi.fn();
    TestBed.configureTestingModule({
      imports: [AccountActions],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: AuthService, useValue: { user, logout } }],
    });
    const fixture = TestBed.createComponent(AccountActions);
    fixture.detectChanges();
    vi.advanceTimersByTime(1);
    return { fixture, page: fixture.componentInstance, http: TestBed.inject(HttpTestingController), logout };
  }

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
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Aucune notification');
    fixture.destroy();
  });
});
