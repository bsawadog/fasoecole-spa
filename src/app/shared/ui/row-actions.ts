import { afterNextRender, Component, ElementRef, input, OnDestroy, signal, viewChild } from '@angular/core';
import { LucideChevronDown } from '@lucide/angular';

let nextActionsId = 0;

/** Project the original links and handlers into a compact, top-layer action panel. */
@Component({
  selector: 'app-row-actions',
  standalone: true,
  imports: [LucideChevronDown],
  template: `
    <button #trigger type="button" class="ui-actions-trigger" [hidden]="!hasActions()" [attr.aria-label]="label()"
            aria-haspopup="dialog" [attr.aria-controls]="panelId" [attr.aria-expanded]="opened()"
            (click)="toggle()">Actions <svg lucideChevronDown [size]="16" aria-hidden="true"></svg></button>
    <div #panel popover="auto" class="ui-actions-panel" [id]="panelId" role="dialog"
         [attr.aria-label]="label()" (toggle)="onToggle($event)" (click)="onAction($event)">
      <ng-content />
    </div>
  `,
  styles: `:host { display: inline-block; vertical-align: middle; }`,
})
export class RowActions implements OnDestroy {
  readonly label = input('Actions de la ligne');
  readonly panelId = `row-actions-${++nextActionsId}`;
  readonly opened = signal(false);
  readonly hasActions = signal(true);
  private observer?: MutationObserver;
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly closeOnViewportChange = (event: Event) => {
    if (event.target instanceof Node && this.panel()?.nativeElement.contains(event.target)) return;
    this.close();
  };

  constructor() {
    afterNextRender(() => {
      const panel = this.panel()?.nativeElement;
      if (!panel) return;
      const update = () => {
        this.hasActions.set(!!panel.querySelector('button, a'));
        if (!this.hasActions()) this.close();
      };
      update();
      this.observer = new MutationObserver(update);
      this.observer.observe(panel, { childList: true, subtree: true });
    });
  }

  toggle(): void {
    const panel = this.panel()?.nativeElement;
    const trigger = this.trigger()?.nativeElement;
    if (!panel || !trigger) return;
    if (this.opened()) { this.close(); return; }
    panel.showPopover();
    this.opened.set(true);
    const anchor = trigger.getBoundingClientRect();
    const bounds = panel.getBoundingClientRect();
    const gutter = 8;
    const left = Math.max(gutter, Math.min(anchor.right - bounds.width, window.innerWidth - bounds.width - gutter));
    const top = anchor.bottom + bounds.height + gutter <= window.innerHeight
      ? anchor.bottom + 4 : Math.max(gutter, anchor.top - bounds.height - 4);
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.querySelector<HTMLElement>('button:not(:disabled), a[href]:not([aria-disabled="true"])')?.focus();
    window.addEventListener('resize', this.closeOnViewportChange);
    document.addEventListener('scroll', this.closeOnViewportChange, true);
  }

  onToggle(event: Event): void {
    // Ignore queued toggle events from a panel that was already removed.
    this.opened.set((event as ToggleEvent).newState === 'open');
    if (!this.opened()) this.removeListeners();
  }

  onAction(event: MouseEvent): void {
    const action = (event.target as Element).closest('button, a');
    if (!action) return;
    this.close();
  }

  close(): void {
    if (this.opened()) this.panel()?.nativeElement.hidePopover();
    this.opened.set(false);
    this.removeListeners();
  }

  private removeListeners(): void {
    window.removeEventListener('resize', this.closeOnViewportChange);
    document.removeEventListener('scroll', this.closeOnViewportChange, true);
  }

  ngOnDestroy(): void { this.removeListeners(); this.observer?.disconnect(); }
}
