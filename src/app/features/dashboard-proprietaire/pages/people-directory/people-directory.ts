import { Component, DestroyRef, computed, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin, from, mergeMap, of, Subscription, switchMap, toArray } from 'rxjs';
import { AuthService, RegistrationSchool } from '../../../../core/auth';
import { OwnerManagementService, RosterParent, StudentRecord } from '../../owner-management.service';

interface ParentRow extends RosterParent { children: StudentRecord[]; }

@Component({
  selector: 'app-people-directory', standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './people-directory.html',
  styleUrl: '../class-roster/class-roster.scss',
})
export class PeopleDirectory implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly api = inject(OwnerManagementService);
  private readonly destroyRef = inject(DestroyRef);
  readonly parentsMode = inject(ActivatedRoute).snapshot.routeConfig?.path === 'parents';
  readonly schools = signal<RegistrationSchool[]>([]);
  readonly schoolId = signal<number | null>(null);
  readonly students = signal<StudentRecord[]>([]);
  readonly parents = signal<ParentRow[]>([]);
  readonly search = signal('');
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  private request?: Subscription;
  readonly title = computed(() => this.parentsMode ? 'Parents' : this.schools().find(s => s.id === this.schoolId())?.type === 'UNIVERSITE' ? 'Étudiants' : 'Élèves');
  private matches(value: string): boolean {
    const normalize = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();
    return normalize(this.search()).trim().split(/\s+/).every(term => normalize(value).includes(term));
  }
  readonly filteredStudents = computed(() => this.students().filter(s => this.matches(`${s.firstName ?? ''} ${s.lastName ?? ''} ${s.registrationNumber} ${s.email ?? ''}`)));
  readonly filteredParents = computed(() => this.parents().filter(p => this.matches(`${p.firstName} ${p.lastName} ${p.email ?? ''} ${p.phone ?? ''} ${p.children.map(s => `${s.firstName ?? ''} ${s.lastName ?? ''} ${s.registrationNumber}`).join(' ')}`)));

  ngOnInit(): void {
    const userId = this.auth.user()?.id;
    if (!userId) { this.loading.set(false); this.error.set('Compte introuvable.'); return; }
    this.auth.getOwnedSchools(userId, 'STUDENTS').pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: schools => {
        this.schools.set(schools);
        const selected = schools.find(s => s.id === Number(localStorage.getItem('fasoecole_owner_school'))) ?? schools[0];
        if (selected) this.selectSchool(selected.id); else this.loading.set(false);
      }, error: () => { this.loading.set(false); this.error.set('Impossible de charger les établissements.'); },
    });
  }

  selectSchool(id: number): void {
    if (!this.schools().some(s => s.id === id)) return;
    this.request?.unsubscribe();
    this.schoolId.set(id); this.auth.selectSchoolContext(id);
    this.students.set([]); this.parents.set([]); this.search.set(''); this.error.set(null); this.loading.set(true);
    this.request = forkJoin({
      students: this.api.getStudents(id),
      rosters: this.parentsMode ? this.api.getClasses(id).pipe(
        switchMap(classes => from(classes).pipe(mergeMap(c => this.api.getClassRoster(c.id), 4), toArray())),
      ) : of([]),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: data => {
        this.students.set([...data.students].sort((a, b) => `${a.lastName ?? ''} ${a.firstName ?? ''}`.localeCompare(`${b.lastName ?? ''} ${b.firstName ?? ''}`, 'fr')));
        const parents = new Map<number, ParentRow>();
        for (const row of data.rosters.flat()) for (const parent of row.parents) {
          const entry = parents.get(parent.parentId) ?? { ...parent, children: [] };
          const student = data.students.find(s => s.id === row.studentId);
          if (student && !entry.children.some(s => s.id === student.id)) entry.children.push(student);
          parents.set(parent.parentId, entry);
        }
        this.parents.set([...parents.values()].sort((a, b) => a.lastName.localeCompare(b.lastName, 'fr')));
        this.loading.set(false);
      }, error: () => { this.loading.set(false); this.error.set('Impossible de charger la liste. Réessayez.'); },
    });
  }
}
