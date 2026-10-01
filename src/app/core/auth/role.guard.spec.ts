import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';
import { roleHomeRedirectGuard } from './role.guard';

describe('roleHomeRedirectGuard', () => {
  function run(authenticated: boolean, role: string | null): string {
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { isAuthenticated: () => authenticated, role: signal(role) } }],
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