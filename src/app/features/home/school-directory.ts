import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService, RegistrationSchool } from '../../core/auth';

const SCHOOL_TYPES: Record<string, string> = {
  PRESCOLAIRE: 'Préscolaire',
  PRIMAIRE: 'Primaire',
  SECONDAIRE: 'Secondaire',
  MIXTE: 'Établissement mixte',
  UNIVERSITE: 'Université',
  FORMATION: 'Formation professionnelle',
};

@Component({
  selector: 'app-school-directory',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './school-directory.html',
  styleUrl: './school-directory.scss',
})
export class SchoolDirectory implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  readonly schools = signal<RegistrationSchool[]>([]);
  readonly filterType = signal<string | null>(this.route.snapshot.queryParamMap.get('type'));
  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly schoolId = Number(this.route.snapshot.paramMap.get('id')) || null;
  readonly selectedSchool = computed(() => this.schools().find((school) => school.id === this.schoolId) ?? null);
  readonly visibleSchools = computed(() => {
    const type = this.filterType();
    return this.schools().filter((school) => !type || school.type === type);
  });

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => this.filterType.set(params.get('type')));
    this.auth.getRegistrationSchools().subscribe({
      next: (schools) => { this.schools.set(schools); this.loading.set(false); },
      error: () => { this.loading.set(false); this.failed.set(true); },
    });
  }

  typeName(type: string): string {
    return SCHOOL_TYPES[type] ?? 'Établissement scolaire';
  }
}
