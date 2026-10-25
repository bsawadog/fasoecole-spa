import { afterEveryRender, booleanAttribute, DestroyRef, Directive, ElementRef, Injector, Input, OnInit, output, signal, inject } from '@angular/core';
import { AbstractControl, ControlValueAccessor, NgControl, ValidationErrors, Validator } from '@angular/forms';

/** Shared form contract for PrimeNG controls; change events retain existing page handlers. */
@Directive()
export abstract class FormField<T> implements ControlValueAccessor, Validator, OnInit {
  private readonly injector = inject(Injector);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  protected control: NgControl | null = null;
  readonly model = signal<T | null>(null);
  @Input() name = '';
  @Input() inputId = '';
  @Input() ariaLabel = '';
  @Input() ariaLabelledBy: string | undefined;
  @Input() ariaDescribedBy: string | undefined;
  @Input() placeholder = '';
  @Input({ transform: booleanAttribute }) required = false;
  @Input({ transform: booleanAttribute }) disabled = false;
  @Input({ transform: booleanAttribute }) readonly = false;
  @Input() set value(value: T | null | undefined) { this.writeValue(value ?? null); }
  readonly change = output<Event>();
  readonly input = output<Event>();
  protected onChange: (value: T | null) => void = () => {};
  protected onTouched = () => {};
  protected onValidatorChange = () => {};

  constructor() {
    // Internal text inputs must not send formatted strings to page change handlers.
    const inputListener = (event: Event) => { event.stopImmediatePropagation(); this.nativeInput(); };
    const changeListener = (event: Event) => event.stopImmediatePropagation();
    this.element.nativeElement.addEventListener('input', inputListener);
    this.element.nativeElement.addEventListener('change', changeListener);
    inject(DestroyRef).onDestroy(() => {
      this.element.nativeElement.removeEventListener('input', inputListener);
      this.element.nativeElement.removeEventListener('change', changeListener);
    });
    afterEveryRender(() => {
      const field = this.element.nativeElement.querySelector('input, [role="combobox"]');
      const description = this.ariaDescribedBy ?? this.element.nativeElement.getAttribute('aria-describedby');
      if (description && field?.getAttribute('aria-describedby') !== description) field?.setAttribute('aria-describedby', description);
    });
  }
  protected nativeInput(): void {}

  ngOnInit(): void { this.control = this.injector.get(NgControl, null, { self: true }); }
  get invalid(): boolean { return !!this.control?.invalid && !!this.control?.touched; }
  get errorMessage(): string {
    if (!this.invalid) return '';
    const errors = this.control?.errors ?? {};
    if (errors['required']) return 'Ce champ est obligatoire.';
    if (errors['date']) return 'Saisissez une date valide.';
    if (errors['min']) return `La valeur minimale est ${errors['min'].min}.`;
    if (errors['max']) return `La valeur maximale est ${errors['max'].max}.`;
    if (errors['step']) return `Saisissez une valeur par incréments de ${errors['step'].step}.`;
    return 'La valeur saisie est invalide.';
  }
  writeValue(value: T | null): void { this.model.set(value); }
  registerOnChange(fn: (value: T | null) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  registerOnValidatorChange(fn: () => void): void { this.onValidatorChange = fn; }
  setDisabledState(disabled: boolean): void { this.disabled = disabled; }
  blur(): void { this.onTouched(); }
  validate(control: AbstractControl): ValidationErrors | null {
    return this.required && (control.value === null || control.value === undefined || control.value === '') ? { required: true } : null;
  }
  update(value: T | null): void {
    if (this.disabled || this.readonly) return;
    this.model.set(value);
    this.onChange(value);
    this.input.emit(this.event('input', value));
    this.change.emit(this.event('change', value));
  }
  private event(type: 'input' | 'change', value: T | null): Event {
    const event = new Event(type);
    Object.defineProperty(event, 'target', { value: { value: value === null ? '' : String(value) } });
    return event;
  }
}
