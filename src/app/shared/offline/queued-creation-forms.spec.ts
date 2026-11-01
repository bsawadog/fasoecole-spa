import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { NgForm } from '@angular/forms';
import { throwError } from 'rxjs';
import { StudentStudyModule } from '../../features/dashboard-etudiant/pages/home/study-module';
import { TeacherDailyTools } from '../self-space/teacher-daily-tools';
import { StudentDashboardService } from '../self-space/student-dashboard.service';
import { TeacherDailyToolsService } from '../self-space/teacher-daily-tools.service';
import { ParentPortalService } from '../self-space/parent-portal.service';
import { SelfSpaceService } from '../self-space/self-space.service';
import { ConfirmationService } from '../confirmation/confirmation.service';

const queued = () => throwError(() => ({ status: 0, error: { offline: true, actionQueued: true, message: 'Ajout conservé · en attente d’envoi.' } }));
const form = () => ({ valid: true, resetForm: vi.fn() }) as unknown as NgForm;

describe('Pending creation form states', () => {
  it('does not announce a queued student reminder as an updated server record', () => {
    const api = { saveTask: vi.fn(queued) };
    TestBed.configureTestingModule({ imports: [StudentStudyModule], providers: [
      { provide: StudentDashboardService, useValue: api }, { provide: SelfSpaceService, useValue: {} },
      { provide: ParentPortalService, useValue: {} }, { provide: ConfirmationService, useValue: {} },
      { provide: ActivatedRoute, useValue: {} }, { provide: Router, useValue: {} },
    ] });
    TestBed.overrideComponent(StudentStudyModule, { set: { template: '' } });
    const fixture = TestBed.createComponent(StudentStudyModule), page = fixture.componentInstance;
    page.studentId.set(4); page.draft = { title: 'Réviser', details: 'Calcul', dueOn: null, done: false };
    const taskForm = form(); page.saveTask(taskForm);
    expect(taskForm.resetForm).toHaveBeenCalled(); expect(page.draft.title).toBe('');
    expect(page.success()).toBeNull(); expect(page.queuedNotice()).toContain('en attente'); expect(page.tasks()).toEqual([]);
  });
  it('clears a teacher note after durable queueing and retains the form on storage failure', () => {
    const api = { save: vi.fn(queued) };
    TestBed.configureTestingModule({ imports: [TeacherDailyTools], providers: [provideHttpClient(),
      { provide: TeacherDailyToolsService, useValue: api }, { provide: SelfSpaceService, useValue: {} }, { provide: ConfirmationService, useValue: {} },
    ] });
    TestBed.overrideComponent(TeacherDailyTools, { set: { template: '' } });
    const fixture = TestBed.createComponent(TeacherDailyTools); fixture.componentRef.setInput('mode', 'notes');
    const page = fixture.componentInstance; page.note.title = 'Séance'; page.note.content = 'Préparer'; page.saveNote(form());
    expect(page.note.title).toBe(''); expect(page.success()).toBeNull(); expect(page.queuedNotice()).toContain('en attente');
    api.save.mockReturnValueOnce(throwError(() => ({ status: 0, error: { offline: true, message: 'Coffre plein' } })));
    page.note.title = 'À conserver'; page.note.content = 'Contenu'; page.saveNote(form());
    expect(page.note.title).toBe('À conserver'); expect(page.queuedNotice()).toBeNull(); expect(page.error()).toBe('Coffre plein');
  });
});
