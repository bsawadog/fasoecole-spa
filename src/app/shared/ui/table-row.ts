import { Directive, input } from '@angular/core';

/** Retain collection item types in PrimeNG's body template (otherwise typed as any). */
@Directive({ selector: 'ng-template[appTableRow]', standalone: true })
export class TableRow<T> {
  readonly appTableRow = input.required<readonly T[]>();

  static ngTemplateContextGuard<T>(directive: TableRow<T>, context: unknown): context is { $implicit: T; rowIndex: number } {
    return true;
  }
}
