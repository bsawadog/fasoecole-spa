import { Component, ElementRef, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  LucideArrowRight,
  LucideBell,
  LucideBookOpen,
  LucideChartNoAxesColumnIncreasing,
  LucideChevronDown,
  LucideGraduationCap,
  LucideHeartHandshake,
  LucideLayoutDashboard,
  LucideLightbulb,
  LucideMessageCircle,
  LucideSchool,
  LucideUsersRound,
  LucideWallet,
} from '@lucide/angular';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    RouterLink,
    LucideArrowRight,
    LucideBell,
    LucideBookOpen,
    LucideChartNoAxesColumnIncreasing,
    LucideChevronDown,
    LucideGraduationCap,
    LucideHeartHandshake,
    LucideLayoutDashboard,
    LucideLightbulb,
    LucideMessageCircle,
    LucideSchool,
    LucideUsersRound,
    LucideWallet,
  ],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'onEscape()',
  },
})
export class Home {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);

  protected openOnHover(event: PointerEvent): void {
    if (event.pointerType !== 'mouse') return;
    const target = event.currentTarget as HTMLDetailsElement;
    for (const dropdown of this.openDropdowns()) {
      if (dropdown !== target) dropdown.open = false;
    }
    target.open = true;
  }

  protected closeOnLeave(event: PointerEvent): void {
    if (event.pointerType !== 'mouse') return;
    const dropdown = event.currentTarget as HTMLDetailsElement;
    if (!dropdown.contains(dropdown.ownerDocument.activeElement)) dropdown.open = false;
  }

  protected onDocumentClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Node)) return;

    for (const dropdown of this.openDropdowns()) {
      const clickedLink = Array.from(dropdown.querySelectorAll('a')).some(link => link.contains(target));
      if (!dropdown.contains(target) || clickedLink) dropdown.open = false;
    }
  }

  protected onEscape(): void {
    for (const dropdown of this.openDropdowns()) {
      const hadFocus = dropdown.contains(dropdown.ownerDocument.activeElement);
      dropdown.open = false;
      if (hadFocus) dropdown.querySelector('summary')?.focus();
    }
  }

  private openDropdowns(): NodeListOf<HTMLDetailsElement> {
    return this.element.nativeElement.querySelectorAll<HTMLDetailsElement>('.home__dropdown[open]');
  }
}
