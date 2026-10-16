import { TestBed } from '@angular/core/testing';
import { provideRouter, UrlTree } from '@angular/router';
import { firstValueFrom, of } from 'rxjs';
import { AuthService, OWNER_MODULES } from './auth.service';
import { ownerModuleGuard } from './owner-module.guard';

describe('Delegated module routes', () => {
  function setup(module: string) {
    TestBed.configureTestingModule({ providers: [provideRouter([]), {
      provide: AuthService, useValue: {
        isSchoolOwner: () => false, loadOwnerAccess: () => of([]), ownerModules: () => new Set([module]),
      },
    }] });
  }

  it.each(OWNER_MODULES)('opens only the delegated $code module', async module => {
    setup(module.code);
    const result = TestBed.runInInjectionContext(() => ownerModuleGuard(module.code)({} as never, {} as never));
    expect(await firstValueFrom(result as ReturnType<typeof of>)).toBe(true);
  });

  it('does not grant student records or owner-only pages to a librarian', async () => {
    setup('LIBRARY');
    for (const requested of ['STUDENTS', null] as const) {
      const result = TestBed.runInInjectionContext(() => ownerModuleGuard(requested)({} as never, {} as never));
      const redirect = await firstValueFrom(result as ReturnType<typeof of>) as UrlTree;
      expect(redirect.toString()).toBe('/proprietaire/bibliotheque');
    }
  });
});
