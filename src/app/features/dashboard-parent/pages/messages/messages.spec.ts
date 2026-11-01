import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ParentMessages } from './messages';
import { AuthService } from '../../../../core/auth';
import { ConversationThread, SelfSpaceService } from '../../../../shared/self-space/self-space.service';

describe('Parent conversation creation', () => {
  it('opens a new message and sends it to the school and selected teacher', async () => {
    const thread = { conversation: { id: 50, subject: 'Question' }, messages: [] } as unknown as ConversationThread;
    const api = {
      contactSchools: vi.fn(() => of([{ schoolId: 1, name: 'École A' }])),
      myStudents: vi.fn(() => of([{ studentId: 5, schoolId: 1, fullName: 'Awa' }])),
      conversationRecipients: vi.fn(() => of([{ userId: 10, fullName: 'Enseignant', role: 'ENSEIGNANT' }])),
      conversations: vi.fn(() => of([])), startConversation: vi.fn(() => of(thread)),
    };
    TestBed.configureTestingModule({ imports: [ParentMessages], providers: [provideRouter([]),
      { provide: SelfSpaceService, useValue: api },
      { provide: AuthService, useValue: { user: () => null } },
    ] });
    const fixture = TestBed.createComponent(ParentMessages); fixture.detectChanges();
    const page = fixture.componentInstance;
    const button = fixture.nativeElement.querySelector('header button') as HTMLButtonElement;
    expect(button.disabled).toBe(false); expect(button.textContent).toContain('Nouveau message');
    button.click(); fixture.detectChanges(); await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('input[name="subject"]')).not.toBeNull();
    page.selectStudent(5); page.toggleRecipient(10, true);
    const subject = fixture.nativeElement.querySelector('input[name="subject"]') as HTMLInputElement;
    subject.value = 'Question'; subject.dispatchEvent(new Event('input'));
    const message = fixture.nativeElement.querySelector('textarea[name="message"]') as HTMLTextAreaElement;
    message.value = 'Bonjour'; message.dispatchEvent(new Event('input'));
    fixture.detectChanges(); await fixture.whenStable();
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(api.startConversation).toHaveBeenCalledWith({ schoolId: 1, studentId: 5,
      subject: 'Question', content: 'Bonjour', recipientSchool: true, recipientUserIds: [10] }, []);
    expect(page.thread()).toEqual(thread); expect(page.showComposer()).toBe(false);
    fixture.destroy();
  });
});
