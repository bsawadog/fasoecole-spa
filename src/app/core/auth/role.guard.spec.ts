import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';
import { roleGuard, roleHomeRedirectGuard } from './role.guard';

describe('roleHomeRedirectGuard', () => {
  function run(authenticated: boolean, role: string | null): string {
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { isAuthenticated: () => authenticated, role: signal(role),
        user: () => ({ approved: true, emailVerified: true }) } }],
    });
    const result = TestBed.runInInjectionContext(() => roleHomeRedirectGuard({} as never, {} as never));
    return TestBed.inject(Router).serializeUrl(result as UrlTree);
  }

  it('garde un enseignant connecté dans son espace', () => {
    expect(run(true, 'enseignant')).toBe('/enseignant');
  });

  it('renvoie un visiteur non connecté vers la connexion', () => {
    expect(run(false, null)).toBe('/login');
  });
});

describe('roleGuard account status', () => {
  it.each([
    { approved: false, emailVerified: false },
    { approved: false, emailVerified: true },
    { approved: true, emailVerified: false },
  ])('keeps incomplete account %j on the profile page', state => {
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: {
      role: () => 'parent', user: () => state,
    } }] });
    const result = TestBed.runInInjectionContext(() => roleGuard(['parent'])({} as never, {} as never));
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/profil');
  });

  it('allows the ready account only for its role', () => {
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: {
      role: () => 'parent', user: () => ({ approved: true, emailVerified: true }),
    } }] });
    expect(TestBed.runInInjectionContext(() => roleGuard(['parent'])({} as never, {} as never))).toBe(true);
    const result = TestBed.runInInjectionContext(() => roleGuard(['admin'])({} as never, {} as never));
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/unauthorized');
  });
});
