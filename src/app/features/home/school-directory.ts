import { LoadingState } from '../../shared/ui/loading-state';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService, RegistrationSchool } from '../../core/auth';

const SCHOOL_TYPES: Record<string, string> = {
  PRESCOLAIRE_PRIMAIRE: 'Maternelle et primaire',
  PRESCOLAIRE: 'Maternelle',
  PRIMAIRE: 'Primaire',
  SECONDAIRE: 'Secondaire',
  MIXTE: 'Établissement mixte',
  UNIVERSITE: 'Université',
  FORMATION: 'Formation professionnelle',
};

@Component({
  selector: 'app-school-directory',
  standalone: true,
  imports: [LoadingState, RouterLink],
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
  readonly directoryTitle = computed(() => {
    const type = this.filterType();
    return type && SCHOOL_TYPES[type] ? `Établissements · ${SCHOOL_TYPES[type]}` : 'Les établissements partenaires';
  });
  readonly platformFeatures = [
    { slug: 'suivi-scolaire', title: 'Suivi scolaire', description: 'Notes, bulletins, présences et informations de scolarité.' },
    { slug: 'portail-parent', title: 'Espace familles', description: 'Un compte pour accompagner la scolarité de plusieurs enfants.' },
    { slug: 'frais-scolaires', title: 'Frais et paiements', description: 'Suivi des frais scolaires, des versements et des reçus.' },
    { slug: 'communication', title: 'Communication', description: 'Messages et annonces pour rapprocher les familles et les équipes éducatives.' },
    { slug: 'tableaux-de-bord', title: 'Gestion de l’établissement', description: 'Tableaux de bord pour suivre les effectifs et l’activité de l’établissement.' },
  ];
  readonly visibleSchools = computed(() => {
    const type = this.filterType();
    return this.schools().filter((school) => !type || (type === 'PRESCOLAIRE_PRIMAIRE'
      ? school.type === 'PRESCOLAIRE' || school.type === 'PRIMAIRE'
      : school.type === type));
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
