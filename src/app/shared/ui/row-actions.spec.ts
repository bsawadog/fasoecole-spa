import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { RowActions } from './row-actions';

@Component({
  standalone: true, imports: [RowActions],
  template: `<app-row-actions label="Actions : Ali"><a href="/fiche">Voir la fiche</a>
    <button type="button" (click)="calls = calls + 1; disabled = true" [disabled]="disabled">Modifier</button>
  </app-row-actions>`,
})
class Host { calls = 0; disabled = false; }

describe('RowActions', () => {
  function setup() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const component = fixture.debugElement.query(By.directive(RowActions)).componentInstance as RowActions;
    const panel = fixture.nativeElement.querySelector('[popover]') as HTMLElement;
    // jsdom does not implement the browser's top-layer popover API.
    panel.showPopover = vi.fn();
    panel.hidePopover = vi.fn();
    return { fixture, component, panel };
  }

  it('opens the panel, focuses its first action and preserves link destinations', () => {
    const { fixture, component, panel } = setup();
    const trigger = fixture.nativeElement.querySelector('.ui-actions-trigger') as HTMLButtonElement;
    trigger.click(); fixture.detectChanges();
    expect(panel.showPopover).toHaveBeenCalledOnce();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(panel.querySelector('a')?.getAttribute('href')).toBe('/fiche');
    expect(document.activeElement).toBe(panel.querySelector('a'));
    expect(parseFloat(panel.style.left)).toBeGreaterThanOrEqual(8);
    component.close();
  });

  it('executes the existing handler and closes even when it disables the action', () => {
    const { fixture, component, panel } = setup();
    component.toggle();
    (panel.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.calls).toBe(1);
    expect(component.opened()).toBe(false);
    expect(panel.hidePopover).toHaveBeenCalledOnce();
  });

  it('closes on viewport changes but allows scrolling within the panel', () => {
    const { component, panel } = setup();
    component.toggle();
    panel.dispatchEvent(new Event('scroll'));
    expect(component.opened()).toBe(true);
    window.dispatchEvent(new Event('resize'));
    expect(component.opened()).toBe(false);
    expect(panel.hidePopover).toHaveBeenCalledOnce();
  });

  it('synchronizes the trigger after native Escape or light-dismiss and removes listeners', () => {
    const { fixture, component, panel } = setup();
    component.toggle();
    const event = new Event('toggle');
    Object.defineProperty(event, 'newState', { value: 'closed' });
    panel.dispatchEvent(event);
    fixture.detectChanges();
    expect(component.opened()).toBe(false);
    fixture.destroy();
    window.dispatchEvent(new Event('resize'));
    expect(panel.hidePopover).not.toHaveBeenCalled();
  });
});
