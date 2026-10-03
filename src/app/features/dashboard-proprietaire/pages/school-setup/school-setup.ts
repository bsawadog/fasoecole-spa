import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../../core/auth';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';
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
  private readonly confirmation = inject(ConfirmationService);
  readonly schoolName = signal('');
  readonly finalized = signal(false);
  readonly step = signal<Step>('school');
  readonly schoolId = signal<number | null>(null);
  readonly saving = signal(false);
  readonly loading = signal(true);
  readonly creating = signal(true);
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
    const draftId = Number(localStorage.getItem(this.draftKey));
    if (!draftId) { this.loading.set(false); return; }
    this.api.getSchool(draftId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (school) => {
        this.loading.set(false);
        if (school.status === 'ACTIVE') {
          localStorage.removeItem(this.draftKey);
          this.schoolName.set(school.name);
          this.finalized.set(true);
          this.success.set(`L’établissement « ${school.name} » a été créé et activé avec succès.`);
          return;
        }
        if (school.status !== 'DRAFT') { localStorage.removeItem(this.draftKey); return; }
        this.schoolId.set(school.id);
        this.schoolName.set(school.name);
        this.creating.set(false);
        this.step.set('academic');
      },
      error: (err) => {
        this.loading.set(false);
        if (err.status === 403 || err.status === 404) localStorage.removeItem(this.draftKey);
        this.error.set(apiError(err, 'Impossible de reprendre la création de votre école.'));
      },
    });
  }

  private get draftKey(): string {
    return `fasoecole_school_draft_${this.auth.user()?.id}`;
  }

  startAnother(): void {
    this.schoolId.set(null);
    this.schoolName.set('');
    this.finalized.set(false);
    this.success.set(null);
    this.error.set(null);
    this.step.set('school');
    this.creating.set(true);
  }

  create(): void {
    const ownerId = this.auth.user()?.id;
    if (!ownerId || this.saving() || !this.form.name.trim()) return;
    this.saving.set(true);
    this.error.set(null);
    this.api.createSchool({ ...this.form, name: this.form.name.trim(), ownerId, status: 'DRAFT' })
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (school) => {
          this.schoolId.set(school.id);
          this.schoolName.set(school.name);
          this.creating.set(false);
          localStorage.setItem(this.draftKey, String(school.id));
          this.auth.selectSchoolContext(school.id);
          this.step.set('academic');
          this.form = { name: '', type: 'PRIMAIRE', address: '', phone: '', email: '' };
          this.success.set('Brouillon enregistré. Configurez votre école, puis confirmez sa création avec « Finaliser ».');
          this.saving.set(false);
        },
        error: (err) => { this.saving.set(false); this.error.set(apiError(err, 'Impossible de créer l’établissement.')); },
      });
  }

  async finalize(): Promise<void> {
    const id = this.schoolId();
    if (!id || this.saving() || this.finalized()) return;
    this.saving.set(true);
    const confirmed = await this.confirmation.confirm({
      title: 'Finaliser la création de cette école ?',
      message: `Confirmez la création de « ${this.schoolName()} ». Les configurations déjà enregistrées seront conservées et l’établissement sera activé.`,
      confirmLabel: 'Confirmer la création',
    });
    if (this.destroyRef.destroyed) return;
    if (!confirmed) { this.saving.set(false); return; }
    this.error.set(null);
    this.api.finalizeSchool(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (school) => {
        localStorage.removeItem(this.draftKey);
        this.finalized.set(true);
        this.schoolName.set(school.name);
        this.success.set(`L’établissement « ${school.name} » a été créé et activé avec succès.`);
        this.saving.set(false);
      },
      error: (err) => { this.saving.set(false); this.error.set(apiError(err, 'Impossible de finaliser la création de l’école.')); },
    });
  }
}
