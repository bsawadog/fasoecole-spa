import { Component, forwardRef, Input, OnChanges } from '@angular/core';
import { AbstractControl, FormsModule, NG_VALIDATORS, NG_VALUE_ACCESSOR, ValidationErrors } from '@angular/forms';
import { InputNumberModule } from 'primeng/inputnumber';
import { FormField } from './form-field';

@Component({
  selector: 'app-number-field', standalone: true, imports: [FormsModule, InputNumberModule],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => NumberField), multi: true },
    { provide: NG_VALIDATORS, useExisting: forwardRef(() => NumberField), multi: true },
  ],
  template: `<p-inputnumber [ngModel]="model()" (ngModelChange)="update($event)" [ngModelOptions]="{standalone: true}"
    [inputId]="inputId || name" [name]="name" [ariaLabel]="ariaLabel || undefined" [ariaLabelledBy]="ariaLabelledBy"
    [required]="required" [disabled]="disabled" [readonly]="readonly" [invalid]="invalid" [placeholder]="placeholder"
    [min]="minimum" [max]="maximum" [step]="increment" [maxFractionDigits]="fractionDigits"
    locale="fr-FR" [fluid]="true" (onBlur)="blur()" />
    @if (errorMessage) { <small class="form-validation-error" role="alert">{{ errorMessage }}</small> }`,
  styles: `:host { display: inline-block; min-width: 0; max-width: 100%; width: 100%; }`,
})
export class NumberField extends FormField<number> implements OnChanges {
  @Input() min: number | string | null | undefined = null;
  @Input() max: number | string | null | undefined = null;
  @Input() step: number | string = 1;
  get minimum(): number | undefined { return this.min == null || this.min === '' ? undefined : Number(this.min); }
  get maximum(): number | undefined { return this.max == null || this.max === '' ? undefined : Number(this.max); }
  get increment(): number { return this.step === 'any' ? 0.01 : Number(this.step) || 1; }
  get fractionDigits(): number { return this.step === 'any' ? 10 : (String(this.step).split('.')[1]?.length ?? 0); }
  ngOnChanges(): void { this.onValidatorChange(); }
  override validate(control: AbstractControl): ValidationErrors | null {
    const required = super.validate(control);
    if (required || control.value === null || control.value === undefined || control.value === '') return required;
    if (!Number.isFinite(control.value)) return { number: true };
    if (this.minimum !== undefined && control.value < this.minimum) return { min: { min: this.minimum, actual: control.value } };
    if (this.maximum !== undefined && control.value > this.maximum) return { max: { max: this.maximum, actual: control.value } };
    const steps = (control.value - (this.minimum ?? 0)) / this.increment;
    if (this.step !== 'any' && Math.abs(steps - Math.round(steps)) > 1e-8) return { step: { step: this.increment } };
    return null;
  }
}
