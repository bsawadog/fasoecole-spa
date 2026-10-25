import { booleanAttribute, Component, computed, contentChildren, forwardRef, input } from '@angular/core';
import { FormsModule, NG_VALIDATORS, NG_VALUE_ACCESSOR } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { FormField } from './form-field';

@Component({ selector: 'app-select-option', standalone: true, template: '' })
export class SelectOption {
  readonly value = input<unknown>(null);
  readonly label = input('');
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly group = input<string | null>(null);
}

/** Declarative choices keep page-local labels, disabled options and numeric IDs typed. */
@Component({
  selector: 'app-select-field', standalone: true, imports: [FormsModule, SelectModule],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SelectField), multi: true },
    { provide: NG_VALIDATORS, useExisting: forwardRef(() => SelectField), multi: true },
  ],
  template: `
    <span hidden aria-hidden="true"><ng-content /></span>
    <p-select [options]="options()" [group]="grouped()" optionGroupLabel="label" optionGroupChildren="items"
      optionLabel="label" optionDisabled="disabled" [ngModel]="selectedChoice()"
      (ngModelChange)="selectChoice($event)" [ngModelOptions]="{standalone: true}" (onBlur)="blur()"
      [inputId]="inputId || name" [name]="name" [ariaLabel]="ariaLabel || undefined" [ariaLabelledBy]="ariaLabelledBy"
      [required]="required" [disabled]="disabled || readonly" [invalid]="invalid" [placeholder]="placeholder"
      [filter]="choices().length > 7" filterBy="label" [fluid]="true" appendTo="body" />
    @if (errorMessage) { <small class="form-validation-error" role="alert">{{ errorMessage }}</small> }
  `,
  styles: `:host { display: inline-block; min-width: 0; max-width: 100%; width: 100%; }`,
})
export class SelectField extends FormField<unknown> {
  readonly choices = contentChildren(SelectOption, { descendants: true });
  readonly grouped = computed(() => this.choices().some(option => option.group() !== null));
  private readonly flatOptions = computed(() => this.choices().map(option => ({ value: option.value(), label: option.label(), disabled: option.disabled(), group: option.group() })));
  readonly selectedChoice = computed(() => this.flatOptions().find(option => Object.is(option.value, this.model())) ?? null);
  selectChoice(option: { value: unknown } | null): void { this.update(option?.value ?? null); }
  readonly options = computed(() => {
    const options = this.flatOptions();
    if (!this.grouped()) return options;
    const groups = new Map<string, { label: string; items: typeof options }>();
    for (const option of options) {
      const label = option.group ?? 'Choix';
      if (!groups.has(label)) groups.set(label, { label, items: [] });
      groups.get(label)!.items.push(option);
    }
    return Array.from(groups.values());
  });
}
