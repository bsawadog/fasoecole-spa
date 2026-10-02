import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { AuthService, RegistrationSchool } from '../../../../core/auth';
import { OwnerManagementService } from '../../owner-management.service';
import { apiError } from '../../../../shared/self-space/self-space.service';
import { OwnerManagement } from '../management/management';
import { TeacherRoster } from '../teacher-roster/teacher-roster';
import { ClassRoster } from '../class-roster/class-roster';
import { StaffPage } from '../staff/staff';

type Step = 'school' | 'academic' | 'teachers' | 'students' | 'fees' | 'staff';

@Component({
  selector: 'app-school-setup',
  standalone: true,
  imports: [FormsModule, OwnerManagement, TeacherRoster, ClassRoster, StaffPage],
  templateUrl: './school-setup.html',
  styleUrl: './school-setup.scss',
})
export class SchoolSetup implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly api = inject(OwnerManagementService);
  private readonly destroyRef = inject(DestroyRef);
  readonly schools = signal<RegistrationSchool[]>([]);
  readonly step = signal<Step>('school');
  readonly schoolId = signal<number | null>(null);
  readonly saving = signal(false);
  readonly loading = signal(true);
  readonly creating = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly steps: { id: Step; label: string; description: string }[] = [
    { id: 'school', label: 'Établissement', description: 'Créez votre école et renseignez ses coordonnées.' },
    { id: 'academic', label: 'Organisation', description: 'Ajoutez une année scolaire, les niveaux, les classes et les matières, dans cet ordre.' },
    { id: 'teachers', label: 'Enseignants', description: 'Créez les enseignants et associez-les aux classes et aux matières.' },
    { id: 'students', label: 'Élèves', description: 'Ajoutez les élèves dans leurs classes et renseignez leurs responsables.' },
    { id: 'fees', label: 'Frais scolaires', description: 'Configurez les tarifs et leur fréquence pour préparer la facturation.' },
    { id: 'staff', label: 'Personnel et accès', description: 'Ajoutez votre équipe administrative et attribuez les modules autorisés.' },
  ];
  form = { name: '', type: 'PRIMAIRE', address: '', phone: '', email: '' };

  ngOnInit(): void {
    const userId = this.auth.user()?.id;
    if (!userId) { this.loading.set(false); return; }
    this.auth.getOwnedSchools(userId, 'MANAGEMENT').pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (schools) => {
        this.schools.set(schools);
        this.loading.set(false);
        this.creating.set(!schools.length);
        const stored = Number(localStorage.getItem('fasoecole_owner_school'));
        if (schools.length) this.selectSchool(schools.find(s => s.id === stored)?.id ?? schools[0].id);
      },
      error: (err) => { this.loading.set(false); this.error.set(apiError(err, 'Impossible de charger les établissements.')); },
    });
  }

  selectSchool(id: number): void {
    if (!this.schools().some(s => s.id === id)) return;
    this.schoolId.set(id);
    localStorage.setItem('fasoecole_owner_school', String(id));
    this.step.set('school');
    this.creating.set(false);
  }

  create(): void {
    const ownerId = this.auth.user()?.id;
    if (!ownerId || this.saving() || !this.form.name.trim()) return;
    this.saving.set(true);
    this.error.set(null);
    this.api.createSchool({ ...this.form, name: this.form.name.trim(), ownerId, status: 'ACTIVE' })
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (school) => {
          this.schools.update(items => [...items, school]);
          this.selectSchool(school.id);
          this.step.set('academic');
          this.form = { name: '', type: 'PRIMAIRE', address: '', phone: '', email: '' };
          this.success.set('Établissement créé. Vous pouvez maintenant configurer son organisation scolaire.');
          this.saving.set(false);
        },
        error: (err) => { this.saving.set(false); this.error.set(apiError(err, 'Impossible de créer l’établissement.')); },
      });
  }
}
