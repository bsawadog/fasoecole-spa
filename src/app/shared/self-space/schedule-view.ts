import { Component, computed, input } from '@angular/core';
import { DAY_LABELS, ScheduleEntry } from './self-space.service';

/** Emploi du temps hebdomadaire (créneaux en vigueur), regroupé par jour. */
@Component({
  selector: 'app-schedule-view',
  standalone: true,
  template: `
    @if (!days().length) {
      <p class="ss__state">Aucun créneau n’est encore planifié.</p>
    } @else {
      <div class="ss__week">
        @for (day of days(); track day.day) {
          <section class="ss__day" [class.ss__day--today]="day.day === today">
            <h3>{{ day.label }}</h3>
            @for (slot of day.slots; track slot.id) {
              <div class="ss__slot">
                <strong>{{ slot.startTime.slice(0, 5) }} – {{ slot.endTime.slice(0, 5) }}</strong>
                <span>{{ slot.subjects || 'Cours' }}</span>
                @if (showClass()) { <small>{{ slot.className }} · {{ slot.schoolName }}</small> }
                @if (showTeacher()) { <small>{{ slot.teacherName }}</small> }
              </div>
            }
          </section>
        }
      </div>
    }
  `,
  styleUrl: './self-space.scss',
  host: { class: 'ss', style: 'padding:0;background:transparent' },
})
export class ScheduleView {
  readonly entries = input.required<ScheduleEntry[]>();
  readonly showClass = input(false);
  readonly showTeacher = input(false);
  readonly today = ((new Date().getDay() + 6) % 7) + 1;

  readonly days = computed(() => {
    const byDay = new Map<number, ScheduleEntry[]>();
    for (const entry of this.entries()) {
      byDay.set(entry.dayOfWeek, [...(byDay.get(entry.dayOfWeek) ?? []), entry]);
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => a - b)
      .map(([day, slots]) => ({
        day,
        label: DAY_LABELS[day] ?? `Jour ${day}`,
        slots: [...slots].sort((a, b) => a.startTime.localeCompare(b.startTime)),
      }));
  });
}
