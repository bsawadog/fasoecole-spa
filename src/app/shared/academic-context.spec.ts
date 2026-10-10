import { HttpRequest } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AuthService } from '../core/auth';
import { environment } from '../../environments/environment';
import { academicContextInterceptor } from './academic-context';

describe('academicContextInterceptor', () => {
  beforeEach(() => {
    localStorage.setItem('fasoecole_owner_school', '5');localStorage.setItem('fasoecole_year_5', '2');
    TestBed.configureTestingModule({providers: [{provide: AuthService, useValue: {user: () => ({approved: true, emailVerified: true})}}]});
  });
  afterEach(() => {localStorage.removeItem('fasoecole_owner_school');localStorage.removeItem('fasoecole_year_5');});
  it('uses the requested reporting year instead of the stored year', () => {
    const next = vi.fn((_request: HttpRequest<unknown>) => of());
    const request = new HttpRequest('GET', environment.apiUrl+'/owner/expenses/schools/5/summary', {params: undefined});
    const selected = request.clone({setParams: {academicYearId: '1'}});
    TestBed.runInInjectionContext(() => academicContextInterceptor(selected, next));
    expect(next.mock.calls[0][0].headers.get('X-Academic-Year')).toBe('1');
  });
  it('keeps the stored context when no reporting year is requested', () => {
    const next = vi.fn((_request: HttpRequest<unknown>) => of());
    TestBed.runInInjectionContext(() => academicContextInterceptor(new HttpRequest('GET', environment.apiUrl+'/owner/expenses/schools/5/summary'), next));
    expect(next.mock.calls[0][0].headers.get('X-Academic-Year')).toBe('2');
  });
});
