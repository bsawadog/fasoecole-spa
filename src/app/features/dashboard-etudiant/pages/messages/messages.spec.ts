import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { StudentMessages } from './messages';
import { AuthService } from '../../../../core/auth';
import { ConversationThread, SelfSpaceService } from '../../../../shared/self-space/self-space.service';
import { StudentDashboardService, StudyProfile } from '../../../../shared/self-space/student-dashboard.service';

describe('StudentMessages', () => {
  const profiles = [{ studentId: 5, schoolId: 1, schoolName: 'École A' },
    { studentId: 6, schoolId: 2, schoolName: 'École B' }] as StudyProfile[];
  const thread = { conversation: { id: 50, schoolId: 1, subject: 'Question' }, messages: [] } as unknown as ConversationThread;
  function setup() {
    const api = {
      conversations: vi.fn(() => of([])), startConversation: vi.fn(() => of(thread)),
      conversation: vi.fn(() => of(thread)), replyToConversation: vi.fn(() => of(thread)),
    };
    TestBed.configureTestingModule({ imports: [StudentMessages], providers: [provideRouter([]),
      { provide: SelfSpaceService, useValue: api },
      { provide: AuthService, useValue: { user: () => null } },
      { provide: StudentDashboardService, useValue: { profiles: () => of(profiles) } },
    ] });
    const fixture = TestBed.createComponent(StudentMessages);
    fixture.detectChanges();
    return { fixture, page: fixture.componentInstance, api };
  }
  it('opens the composer from the new conversation button', () => {
    const { fixture, page } = setup();
    const button = fixture.nativeElement.querySelector('header button') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(button.textContent).toContain('Nouvelle conversation');
    button.click(); fixture.detectChanges();
    expect(page.showComposer()).toBe(true);
    expect(fixture.nativeElement.querySelector('input[name="subject"]')).not.toBeNull();
  });
  it('sends to the school of the selected student profile and opens the created thread', () => {
    const { page, api } = setup();
    page.newConversation(); page.studentId = 6; page.subject = ' Question '; page.message = ' Bonjour ';
    const attachment = new File(['document'], 'document.txt'); page.messageFiles = [attachment];
    page.startConversation();
    expect(api.startConversation).toHaveBeenCalledWith({ schoolId: 2, studentId: 6,
      subject: 'Question', content: 'Bonjour', recipientSchool: true, recipientUserIds: [] }, [attachment]);
    expect(page.thread()).toEqual(thread);
    expect(page.conversations()).toEqual([thread.conversation]);
    expect(page.showComposer()).toBe(false);
    expect(page.messageFiles).toEqual([]);
  });
  it('rejects empty messages and profiles outside the loaded list', () => {
    const { page, api } = setup();
    page.subject = 'Question'; page.message = '   '; page.startConversation();
    page.message = 'Bonjour'; page.studentId = 999; page.startConversation();
    expect(api.startConversation).not.toHaveBeenCalled();
  });
  it('prevents duplicate sends and preserves the draft after a server error', () => {
    const { page, api } = setup();
    const pending = new Subject<ConversationThread>(); api.startConversation.mockReturnValueOnce(pending);
    page.newConversation(); page.subject = 'Question'; page.message = 'Bonjour';
    page.startConversation(); page.startConversation();
    expect(api.startConversation).toHaveBeenCalledTimes(1);
    pending.error({ error: { message: 'Envoi impossible' } });
    expect(page.sending()).toBe(false);
    expect(page.error()).toBe('Envoi impossible');
    expect(page.message).toBe('Bonjour'); expect(page.showComposer()).toBe(true);
    page.error.set(null); expect(page.error()).toBeNull();
  });
});
