import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor session lifecycle', () => {
  let client: HttpClient;
  let http: HttpTestingController;
  let token: string | null;
  let logout: ReturnType<typeof vi.fn>;
  const endpoint = `${environment.apiUrl}/users/me`;

  beforeEach(() => {
    token = 'old-jwt'; logout = vi.fn();
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(),
      { provide: AuthService, useValue: { getToken: () => token, logout } },
    ] });
    client = TestBed.inject(HttpClient); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  function failure(status: number, url = endpoint) {
    client.get(url).subscribe({ error: () => undefined });
    http.expectOne(url).flush({}, { status, statusText: 'Error' });
  }

  it('adds the JWT to API calls and logs out on session revocation', () => {
    client.get(endpoint).subscribe({ error: () => undefined });
    const request = http.expectOne(endpoint);
    expect(request.request.headers.get('Authorization')).toBe('Bearer old-jwt');
    request.flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(logout).toHaveBeenCalledOnce();
  });
  it('does not log out on a permission refusal', () => { failure(403); expect(logout).not.toHaveBeenCalled(); });
  it('does not log out on a rejected public login', () => {
    failure(401, `${environment.apiUrl}/auth/login`); expect(logout).not.toHaveBeenCalled();
  });
  it('does not leak the JWT to another server', () => {
    client.get('https://example.test/data').subscribe();
    const request = http.expectOne('https://example.test/data');
    expect(request.request.headers.has('Authorization')).toBe(false); request.flush({});
  });
  it('keeps a new session when an old pending request returns unauthorized', () => {
    client.get(endpoint).subscribe({ error: () => undefined });
    const request = http.expectOne(endpoint); token = 'new-jwt';
    request.flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(logout).not.toHaveBeenCalled();
  });
  it('does not create a session or force logout for an anonymous request', () => {
    token = null; failure(401); expect(logout).not.toHaveBeenCalled();
  });
});
