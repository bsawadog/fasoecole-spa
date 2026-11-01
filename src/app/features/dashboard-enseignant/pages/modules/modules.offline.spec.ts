import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { TeacherModule } from './modules';
import { AuthService } from '../../../../core/auth';
import { SelfSpaceService } from '../../../../shared/self-space/self-space.service';
import { ParentPortalService } from '../../../../shared/self-space/parent-portal.service';
import { SchoolLifeService } from '../../../../shared/school-life/school-life.service';
import { SchoolDataSyncService } from '../../../../shared/school-data-sync.service';
import { OfflineAttendanceService } from '../../../../shared/offline/offline-attendance.service';
import { SelectField } from '../../../../shared/ui/select-field';

describe('Offline homework class selection', () => {
  it('keeps the real class picker usable when homework and tracking copies are missing and saves the previous class draft', async () => {
    const classes = [11, 12].map(classId => ({ classId, schoolId: 1, schoolName: 'École', className: classId === 11 ? 'CP1' : 'CP2', academicYearId: 1, academicYearLabel: '2026-2027', subjects: [] }));
    const unavailable = () => throwError(() => ({ status: 0, error: { offline: true, message: 'Ces données ne sont pas disponibles hors connexion Internet.' } }));
    const posts = vi.fn((id: number) => id === 11 ? of([]) : unavailable());
    const savePublication = vi.fn(async () => {});
    TestBed.configureTestingModule({ imports: [TeacherModule], providers: [provideRouter([]),
      { provide: AuthService, useValue: { user: () => ({ id: 7 }) } },
      { provide: SelfSpaceService, useValue: {} },
      { provide: ParentPortalService, useValue: { teacherPosts: posts } },
      { provide: SchoolLifeService, useValue: { overview: unavailable } },
      { provide: SchoolDataSyncService, useValue: { watch: () => new Subject() } },
      { provide: OfflineAttendanceService, useValue: { enabled: () => true, unlocked: () => true, online: () => false,
        cachedClasses: () => classes, cachedView: () => null, publications: () => [], pending: () => [], revision: () => 0,
        lastPublicationSync: () => null, busy: () => false, savePublication,
      } },
      { provide: ActivatedRoute, useValue: { data: of({ module: 'devoirs' }), queryParamMap: of(convertToParamMap({})), snapshot: { queryParamMap: convertToParamMap({}) } } },
    ] });
    const fixture = TestBed.createComponent(TeacherModule), page = fixture.componentInstance; fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('dialog[open]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Ces données ne sont pas disponibles');
    page.postTitle = 'Travail CP1'; page.content = 'Consignes CP1'; page.dueDate = '2099-11-30';
    const picker = fixture.debugElement.query(By.directive(SelectField)).componentInstance as SelectField;
    expect(picker.disabled).toBe(false); picker.selectChoice({ value: 12 }); fixture.detectChanges(); await fixture.whenStable();
    expect(page.classId()).toBe(12); expect(posts).toHaveBeenCalledWith(12, 'HOMEWORK');
    expect(fixture.nativeElement.querySelector('dialog[open]')).toBeNull();
    await vi.waitFor(() => expect(savePublication).toHaveBeenCalledWith(expect.objectContaining({ draft: true, payload: expect.objectContaining({ classId: 11, title: 'Travail CP1' }) })), { timeout: 2000 });
    expect(page.postTitle).toBe('');
    picker.selectChoice({ value: 11 }); fixture.detectChanges(); expect(page.classId()).toBe(11); expect(page.offlineNotice()).toBeNull();
    fixture.destroy();
  });
});
