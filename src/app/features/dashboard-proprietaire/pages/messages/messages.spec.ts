import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { OwnerMessages } from './messages';
import { AuthService } from '../../../../core/auth';
import { OwnerFamilyMessagesService } from '../../family-messages.service';
import { ConversationThread } from '../../../../shared/self-space/self-space.service';

describe('School conversation creation', () => {
  it('opens and sends a conversation in the shared school messaging workspace', async () => {
    const thread = { conversation: { id: 50, subject: 'Information' }, messages: [] } as unknown as ConversationThread;
    const auth = { user: () => ({ id: 7 }), getOwnedSchools: vi.fn(() => of([{ id: 1, name: 'École A' }])) };
    const api = {
      conversations: vi.fn(() => of([])),
      recipients: vi.fn(() => of([{ userId: 10, fullName: 'Awa', role: 'ELEVE' }])),
      start: vi.fn(() => of(thread)),
    };
    TestBed.configureTestingModule({ imports: [OwnerMessages], providers: [provideRouter([]),
      { provide: AuthService, useValue: auth }, { provide: OwnerFamilyMessagesService, useValue: api },
    ] });
    const fixture = TestBed.createComponent(OwnerMessages); fixture.detectChanges();
    const page = fixture.componentInstance;
    expect(auth.getOwnedSchools).toHaveBeenCalledWith(7, 'MESSAGES');
    const button = fixture.nativeElement.querySelector('header button') as HTMLButtonElement;
    expect(button.textContent).toContain('Nouvelle conversation');
    button.click(); fixture.detectChanges(); await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('input[name="subject"]')).not.toBeNull();
    page.toggleRecipient(10, true);
    const subject = fixture.nativeElement.querySelector('input[name="subject"]') as HTMLInputElement;
    subject.value = 'Information'; subject.dispatchEvent(new Event('input'));
    const message = fixture.nativeElement.querySelector('textarea[name="message"]') as HTMLTextAreaElement;
    message.value = 'Bonjour'; message.dispatchEvent(new Event('input'));
    fixture.detectChanges(); await fixture.whenStable();
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(api.start).toHaveBeenCalledWith({ schoolId: 1, studentId: null,
      subject: 'Information', content: 'Bonjour', recipientSchool: false, recipientUserIds: [10] }, []);
    expect(page.thread()).toEqual(thread); expect(page.composing()).toBe(false);
    fixture.destroy();
  });
});
