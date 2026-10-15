import { TestBed } from '@angular/core/testing';
import { NavigationCancel, NavigationCancellationCode, NavigationEnd, NavigationError, NavigationSkipped, NavigationSkippedCode, NavigationStart, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { NavigationActivity } from './navigation-activity';

describe('NavigationActivity', () => {
  const events = new Subject<NavigationStart | NavigationEnd | NavigationCancel | NavigationError | NavigationSkipped>();

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ imports: [NavigationActivity], providers: [{ provide: Router, useValue: { events } }] });
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.useRealTimers(); });

  it('avoids flashing the indicator for fast navigation', () => {
    const fixture = TestBed.createComponent(NavigationActivity);
    events.next(new NavigationStart(1, '/proprietaire/classes'));
    vi.advanceTimersByTime(100);
    events.next(new NavigationEnd(1, '/proprietaire/classes', '/proprietaire/classes'));
    vi.advanceTimersByTime(100);
    expect(fixture.componentInstance.visible()).toBe(false);
  });

  it.each([
    new NavigationEnd(1, '/a', '/a'),
    new NavigationCancel(1, '/a', 'Guard', NavigationCancellationCode.GuardRejected),
    new NavigationError(1, '/a', new Error('Network')),
    new NavigationSkipped(1, '/a', 'Same URL', NavigationSkippedCode.IgnoredSameUrlNavigation),
  ])('clears the indicator when navigation finishes with $constructor.name', terminal => {
    const fixture = TestBed.createComponent(NavigationActivity);
    events.next(new NavigationStart(1, '/a'));
    vi.advanceTimersByTime(150);
    expect(fixture.componentInstance.visible()).toBe(true);
    events.next(terminal);
    expect(fixture.componentInstance.visible()).toBe(false);
  });
});
