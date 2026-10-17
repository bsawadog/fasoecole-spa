import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AuthService } from '../../core/auth';
import { AppearanceService, APPEARANCE_THEMES } from './appearance.service';

describe('AppearanceService', () => {
  const user = signal<{id:number; role?:string} | null>({id:7});
  beforeEach(() => {
    localStorage.clear(); user.set({id:7});
    TestBed.configureTestingModule({providers:[{provide:AuthService,useValue:{user}}]});
  });
  afterEach(() => { TestBed.resetTestingModule(); localStorage.clear(); delete document.body.dataset['appTheme']; });
  const setup = () => { const service=TestBed.inject(AppearanceService); TestBed.tick(); return service; };

  it('offers all seven themes and uses blue-black for an unknown stored value', () => {
    localStorage.setItem('fasoecole_theme_7','invalid');
    const service=setup();
    expect(APPEARANCE_THEMES).toHaveLength(7);
    expect(service.selected()).toBe('blue-black');
    expect(document.body.dataset['appTheme']).toBe('blue-black');
  });
  it('applies the saved preference and persists a new choice', () => {
    localStorage.setItem('fasoecole_theme_7','night-violet');
    const service=setup(); expect(service.selected()).toBe('night-violet');
    service.choose('white'); TestBed.tick();
    expect(document.body.dataset['appTheme']).toBe('white');
    expect(localStorage.getItem('fasoecole_theme_7')).toBe('white');
  });
  it('keeps preferences across roles, isolates users and resets on logout', () => {
    const service=setup(); service.choose('night-green'); TestBed.tick();
    user.set({id:7,role:'parent'}); TestBed.tick(); expect(service.selected()).toBe('night-green');
    user.set({id:8}); TestBed.tick(); expect(service.selected()).toBe('blue-black');
    service.choose('light-gray'); TestBed.tick();
    user.set({id:7}); TestBed.tick(); expect(service.selected()).toBe('night-green');
    user.set(null); TestBed.tick(); expect(service.selected()).toBe('blue-black');
  });
  it('allows a session preference when storage is blocked', () => {
    const service=setup();
    vi.spyOn(Storage.prototype,'setItem').mockImplementation(() => { throw new Error('Blocked'); });
    service.choose('glossy-black'); TestBed.tick();
    expect(service.selected()).toBe('glossy-black'); expect(service.saved()).toBe(false);
    user.set({id:7,role:'parent'}); TestBed.tick();
    expect(service.selected()).toBe('glossy-black'); expect(service.saved()).toBe(false);
    vi.restoreAllMocks();
  });
});
