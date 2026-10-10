import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../../../environments/environment';
import { TeacherMessages } from './messages';

/** Component template + Angular forms + real SelfSpaceService; only the HTTP transport is simulated. */
describe('Teacher messaging integration', () => {
  let fixture: ComponentFixture<TeacherMessages>;
  let http: HttpTestingController;
  const root = environment.apiUrl;
  const summary = { id: 900, schoolId: 2001, schoolName: 'School', subject: 'Homework',
    createdAt: '2026-10-07T12:00:00', lastMessageAt: '2026-10-07T12:00:00',
    unread: false, recipientNames: ['Parent A'], recipientCount: 1 };

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [TeacherMessages],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(TeacherMessages); fixture.detectChanges();
    http.expectOne(`${root}/me/teacher/classes`).flush([{
      classId: 2003, className: 'CM1', schoolId: 2001, schoolName: 'School', levelName: 'CM1',
      academicYearId: 2002, academicYearLabel: '2026-2027', currentYear: true, studentCount: 1, subjects: [],
    }]);
    http.expectOne(`${root}/conversations`).flush([]);
    fixture.detectChanges(); await fixture.whenStable();
  });
  afterEach(() => { http.verify(); fixture.destroy(); });

  async function compose(): Promise<void> {
    const start = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find(button => button.textContent?.includes('Nouvelle conversation'))!;
    start.click(); fixture.detectChanges(); await fixture.whenStable();
    const select = fixture.nativeElement.querySelector('select[name="classId"]') as HTMLSelectElement;
    select.value = select.options[1].value; select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    const recipients = http.expectOne(`${root}/conversations/teacher/recipients?schoolId=2001&classId=2003`);
    expect(recipients.request.method).toBe('GET');
    recipients.flush([{ userId: 2203, fullName: 'Parent A', role: 'PARENT' }]);
    fixture.detectChanges(); await fixture.whenStable();
    const parents = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find(button => button.textContent?.includes('Tous les parents'))!;
    parents.click(); fixture.detectChanges();
    expect(parents.getAttribute('aria-pressed')).toBe('true');
    const subject = fixture.nativeElement.querySelector('input[name="subject"]') as HTMLInputElement;
    subject.value = 'Homework'; subject.dispatchEvent(new Event('input'));
    const message = fixture.nativeElement.querySelector('textarea[name="message"]') as HTMLTextAreaElement;
    message.value = 'Please review the exercises'; message.dispatchEvent(new Event('input'));
    fixture.detectChanges(); await fixture.whenStable();
  }
  function submit() {
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    const request = http.expectOne(`${root}/conversations/teacher/messages`);
    expect(request.request.method).toBe('POST');
    return request;
  }

  it('selects a class and parents, sends the actual API payload, then opens the saved conversation', async () => {
    await compose();
    const sent = submit();
    expect(sent.request.body).toEqual({ schoolId: 2001, classId: 2003, subject: 'Homework',
      content: 'Please review the exercises', recipientUserIds: [2203] });
    sent.flush([summary]); fixture.detectChanges(); await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Les réponses sont privées');
    (fixture.nativeElement.querySelector('button.ss__conv') as HTMLButtonElement).click();
    http.expectOne(`${root}/conversations/900`).flush({ conversation: summary, messages: [{
      id: 901, mine: true, fromSchool: false, senderId: 2202, senderName: 'Teacher A',
      content: 'Please review the exercises', sentAt: '2026-10-07T12:00:00', readBy: [], attachments: [],
    }] });
    fixture.detectChanges(); await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Please review the exercises');
    expect(fixture.nativeElement.textContent).toContain('Teacher A');
  });

  it('shows an API refusal and preserves the draft for retry', async () => {
    await compose();
    submit().flush({ message: 'Recipient not authorized' }, { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges(); await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Recipient not authorized');
    expect((fixture.nativeElement.querySelector('input[name="subject"]') as HTMLInputElement).value).toBe('Homework');
    expect(fixture.componentInstance.sending()).toBe(false);
    expect(fixture.componentInstance.selectedRecipientIds()).toEqual([2203]);
  });
});
