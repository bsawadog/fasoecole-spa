import { Component, computed, ElementRef, forwardRef, inject, input, OnChanges, signal } from '@angular/core';
import { AbstractControl, FormsModule, NG_VALIDATORS, NG_VALUE_ACCESSOR, ValidationErrors } from '@angular/forms';
import { DatePickerModule } from 'primeng/datepicker';
import { FormField } from './form-field';

export type DateFieldMode = 'date' | 'month' | 'time' | 'datetime-local';

/** Convert local calendar dates without UTC conversions that could shift the day. */
export function parseLocalDate(value: string | null | undefined, mode: DateFieldMode): Date | null {
  if (!value) return null;
  const pattern = mode === 'time' ? /^(\d{2}):(\d{2})(?::\d{2})?$/
    : mode === 'month' ? /^(\d{4})-(\d{2})$/
    : mode === 'datetime-local' ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/
    : /^(\d{4})-(\d{2})-(\d{2})$/;
  const match = pattern.exec(value);
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  const [year, month, day, hour, minute] = mode === 'time' ? [2000, 1, 1, ...parts] : [...parts];
  const result = new Date(2000, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0);
  result.setFullYear(year);
  return result.getFullYear() === year && result.getMonth() === month - 1 && result.getDate() === (day ?? 1)
    && result.getHours() === (hour ?? 0) && result.getMinutes() === (minute ?? 0) ? result : null;
}

export function formatLocalDate(value: Date, mode: DateFieldMode): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const month = `${String(value.getFullYear()).padStart(4, '0')}-${pad(value.getMonth() + 1)}`;
  const date = `${month}-${pad(value.getDate())}`;
  const time = `${pad(value.getHours())}:${pad(value.getMinutes())}`;
  return mode === 'month' ? month : mode === 'time' ? time : mode === 'datetime-local' ? `${date}T${time}` : date;
}

@Component({
  selector: 'app-date-field', standalone: true, imports: [FormsModule, DatePickerModule],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DateField), multi: true },
    { provide: NG_VALIDATORS, useExisting: forwardRef(() => DateField), multi: true },
  ],
  template: `
    <p-datepicker [ngModel]="pickerValue()" [ngModelOptions]="{standalone: true}"
      (onSelect)="selectDate($event)" (onClear)="selectDate(null)"
      [inputId]="inputId || name" [name]="name" [ariaLabel]="ariaLabel || undefined" [ariaLabelledBy]="ariaLabelledBy"
      [required]="required" [disabled]="disabled || readonly" [readonlyInput]="readonly" [invalid]="invalid || invalidText"
      [view]="mode() === 'month' ? 'month' : 'date'" [dateFormat]="mode() === 'month' ? 'mm/yy' : 'dd/mm/yy'"
      [showTime]="mode() === 'datetime-local'" [timeOnly]="mode() === 'time'" hourFormat="24"
      [minDate]="minDate()" [maxDate]="maxDate()" [showIcon]="true" [showButtonBar]="true" [keepInvalid]="true"
      [placeholder]="placeholder || (mode() === 'month' ? 'mm/aaaa' : mode() === 'time' ? 'hh:mm' : mode() === 'datetime-local' ? 'jj/mm/aaaa hh:mm' : 'jj/mm/aaaa')"
      [fluid]="true" appendTo="body" (onBlur)="blur()" />
    @if (invalidText) { <small class="form-validation-error" role="alert">Saisissez une date valide.</small> }
    @else if (errorMessage) { <small class="form-validation-error" role="alert">{{ errorMessage }}</small> }
  `,
  styles: `:host { display: inline-block; min-width: 0; max-width: 100%; width: 100%; } small { display: block; color: #b42318; font-size: .8rem; margin-top: .3rem; }`,
})
export class DateField extends FormField<string> implements OnChanges {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly mode = input<DateFieldMode>('date');
  readonly min = input<string | null | undefined>(null);
  readonly max = input<string | null | undefined>(null);
  invalidText = false;
  private readonly typedText = signal<string | null>(null);
  readonly calendarValue = computed(() => parseLocalDate(this.model(), this.mode()));
  readonly pickerValue = computed(() => this.typedText() ?? this.calendarValue());
  readonly minDate = computed(() => parseLocalDate(this.min(), this.mode()));
  readonly maxDate = computed(() => parseLocalDate(this.max(), this.mode()));
  ngOnChanges(): void { this.onValidatorChange(); }
  override writeValue(value: string | null): void { this.invalidText = false; this.typedText.set(null); super.writeValue(value); }
  typeDate(): void {
    const text = this.host.nativeElement.querySelector('input')?.value.trim() ?? '';
    const mode = this.mode();
    const match = (mode === 'month' ? /^(\d{2})\/(\d{4})$/
      : mode === 'datetime-local' ? /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/
      : /^(\d{2})\/(\d{2})\/(\d{4})$/).exec(text);
    const iso = mode === 'time' ? text : !match ? '' : mode === 'month' ? `${match[2]}-${match[1]}`
      : `${match[3]}-${match[2]}-${match[1]}${mode === 'datetime-local' ? `T${match[4]}:${match[5]}` : ''}`;
    const value = parseLocalDate(iso, mode);
    this.invalidText = !!text && !value;
    this.typedText.set(this.invalidText ? text : null);
    this.update(value ? formatLocalDate(value, mode) : null);
    this.onValidatorChange();
  }
  protected override nativeInput(): void { this.typeDate(); }
  selectDate(value: Date | string | null): void {
    this.invalidText = value !== null && value !== '' && (!(value instanceof Date) || Number.isNaN(value.getTime()));
    this.typedText.set(this.invalidText && typeof value === 'string' ? value : null);
    this.update(value instanceof Date && !this.invalidText ? formatLocalDate(value, this.mode()) : null);
    this.onValidatorChange();
  }
  override validate(control: AbstractControl): ValidationErrors | null {
    const required = super.validate(control);
    if (this.invalidText) return { date: true };
    if (required || !control.value) return required;
    if (!parseLocalDate(control.value, this.mode())) return { date: true };
    const min = this.min(), max = this.max();
    if (min && control.value < min) return { min: { min, actual: control.value } };
    if (max && control.value > max) return { max: { max, actual: control.value } };
    return null;
  }
}
