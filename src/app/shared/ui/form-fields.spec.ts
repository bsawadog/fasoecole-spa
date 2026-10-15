import { Component, signal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { FormValidationDirective } from '../form-validation.directive';
import { DateField, formatLocalDate, parseLocalDate } from './date-field';
import { NumberField } from './number-field';
import { SelectField, SelectOption } from './select-field';

@Component({
  imports: [FormsModule, FormValidationDirective, DateField, NumberField, SelectField, SelectOption],
  template: `<form (ngSubmit)="submissions = submissions + 1">
    <app-date-field name="date" [(ngModel)]="date" [min]="minimum()" [max]="maximum" required (change)="dateEvents.push($any($event.target).value)" />
    <app-number-field name="amount" [(ngModel)]="amount" [min]="0" [max]="10000" step="0.5" required />
    <app-select-field name="school" [(ngModel)]="school" required (change)="changed = $any($event.target).value">
      <app-select-option [value]="null" label="Choisir" />
      @for (choice of choices(); track choice.id) {
        <app-select-option [value]="choice.id" [label]="choice.name" [disabled]="choice.disabled" group="Écoles" />
      }
    </app-select-field>
    <button type="submit">Enregistrer</button>
  </form>`,
})
class TestForm {
  date: string | null = '2026-10-14';
  minimum = signal('2026-10-01'); maximum = '2026-10-31';
  amount: number | null = 1500.5;
  school: number | null = 1;
  choices = signal([{ id: 1, name: 'École A', disabled: false }, { id: 2, name: 'École B', disabled: true }]);
  changed = ''; submissions = 0;
  dateEvents: string[] = [];
}

describe('PrimeNG form field contracts', () => {
  async function setup() {
    const fixture = TestBed.createComponent(TestForm);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    return { fixture, host: fixture.componentInstance,
      date: fixture.debugElement.query(By.directive(DateField)).componentInstance as DateField,
      number: fixture.debugElement.query(By.directive(NumberField)).componentInstance as NumberField,
      select: fixture.debugElement.query(By.directive(SelectField)).componentInstance as SelectField };
  }
  it('serializes dates, months and appointment times without UTC day shifts', () => {
    for (const [value, mode] of [['2026-03-08', 'date'], ['2026-11', 'month'], ['2026-11-01T01:30', 'datetime-local'], ['08:45', 'time']] as const) {
      expect(formatLocalDate(parseLocalDate(value, mode)!, mode)).toBe(value);
    }
    expect(parseLocalDate('2026-02-31', 'date')).toBeNull();
    expect(parseLocalDate('2026-13', 'month')).toBeNull();
    expect(parseLocalDate('25:30', 'time')).toBeNull();
  });
  it('keeps the ISO model while presenting a calendar date', async () => {
    const { fixture, host, date } = await setup();
    expect(date.calendarValue()?.getDate()).toBe(14);
    expect(fixture.nativeElement.querySelector('app-date-field input').value).toBe('14/10/2026');
    date.selectDate(new Date(2026, 9, 20));
    fixture.detectChanges(); await fixture.whenStable();
    expect(host.date).toBe('2026-10-20');
  });
  it('sends one ISO change event when typing, without leaking the formatted DOM value', async () => {
    const { fixture, host } = await setup();
    const input = fixture.nativeElement.querySelector('app-date-field input') as HTMLInputElement;
    input.value = '20/10/2026';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges(); await fixture.whenStable();
    expect(host.date).toBe('2026-10-20');
    expect(host.dateEvents).toEqual(['2026-10-20']);
  });
  it('preserves numeric identifiers, disabled choices and dynamic groups', async () => {
    const { fixture, host, select } = await setup();
    expect(select.choices()).toHaveLength(3);
    expect(select.model()).toBe(1);
    expect(fixture.nativeElement.querySelector('app-select-field .p-select-label').textContent).toContain('École A');
    const groups = select.options() as { label: string; items: { value: unknown; disabled: boolean }[] }[];
    expect(groups[1].items[1]).toMatchObject({ value: 2, disabled: true });
    select.update(1);
    expect(host.school).toBe(1);
    expect(host.changed).toBe('1');
    host.choices.set([{ id: 3, name: 'Nouvelle école', disabled: false }]);
    fixture.detectChanges(); await fixture.whenStable();
    expect(select.choices()).toHaveLength(2);
  });
  it('does not let the internal dropdown search field block a valid form', async () => {
    const { fixture, host } = await setup();
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(host.submissions).toBe(1);
  });
  it('blocks submission when a required choice is cleared', async () => {
    const { fixture, host, select } = await setup();
    select.update(null);
    fixture.detectChanges(); await fixture.whenStable();
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(host.submissions).toBe(0);
    expect(fixture.nativeElement.querySelector('.form-validation-summary')).not.toBeNull();
  });
  it('validates changed date limits and rejects invalid typed dates', async () => {
    const { fixture, date, host } = await setup();
    host.minimum.set('2026-10-25');
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges(); await fixture.whenStable();
    expect(date.min()).toBe('2026-10-25');
    expect(date.validate({ value: host.date } as never)).toHaveProperty('min');
    date.selectDate('date invalide');
    fixture.detectChanges(); await fixture.whenStable();
    expect(date.validate({ value: null } as never)).toEqual({ date: true });
  });
  it('keeps decimal amounts numeric and validates limits', async () => {
    const { host, number } = await setup();
    number.update(1750.5);
    expect(host.amount).toBe(1750.5);
    expect(number.validate({ value: 10001 } as never)).toHaveProperty('max');
    expect(number.validate({ value: -1 } as never)).toHaveProperty('min');
    expect(number.validate({ value: 1.3 } as never)).toHaveProperty('step');
  });
});
