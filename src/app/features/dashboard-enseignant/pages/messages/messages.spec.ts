import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { TeacherMessages } from './messages';
import { SelfSpaceService, TeacherClass, TeacherMessageRecipient } from '../../../../shared/self-space/self-space.service';

describe('TeacherMessages recipients', () => {
  const recipients: TeacherMessageRecipient[] = [
    { userId: 10, fullName: 'Awa Student', role: 'ELEVE' },
    { userId: 20, fullName: 'Ali Parent', role: 'PARENT' },
    { userId: 30, fullName: 'School Owner', role: 'PROPRIETAIRE' },
  ];

  function setup() {
    const api = {
      teacherMessageRecipients: vi.fn(() => of(recipients)),
      sendTeacherMessage: vi.fn(() => of([])),
    };
    TestBed.configureTestingModule({ providers: [{ provide: SelfSpaceService, useValue: api }] });
    const page = TestBed.runInInjectionContext(() => new TeacherMessages());
    page.classes.set([
      { classId: 1, schoolId: 5 }, { classId: 2, schoolId: 5 },
    ] as TeacherClass[]);
    return { page, api };
  }

  it('selects groups and allows a single student or parent', () => {
    const { page } = setup();
    page.selectClass(1);
    page.selectGroup('ELEVE');
    expect(page.selectedRecipientIds()).toEqual([10]);
    page.selectGroup('PARENT');
    expect(page.selectedRecipientIds()).toEqual([20]);
    page.toggleRecipient(20, false);
    page.toggleRecipient(30, true);
    expect(page.selectedRecipientIds()).toEqual([30]);
    page.recipientFilter = 'ALL';
    page.recipientSearch = 'awa';
    expect(page.visibleRecipients().map(item => item.userId)).toEqual([10]);
  });

  it('clears selected recipients when changing class and ignores stale responses', () => {
    const { page, api } = setup();
    const old = new Subject<TeacherMessageRecipient[]>();
    api.teacherMessageRecipients.mockReturnValueOnce(old);
    page.selectClass(1);
    page.selectedRecipientIds.set([99]);
    page.selectClass(2);
    old.next([{ userId: 99, fullName: 'Other class', role: 'ELEVE' }]);
    expect(page.selectedRecipientIds()).toEqual([]);
    expect(page.recipients()).toEqual(recipients);
  });

  it('sends the selected class and recipient IDs through the private delivery endpoint', () => {
    const { page, api } = setup();
    page.selectClass(1);
    page.selectGroup('PARENT');
    page.subject = ' Homework ';
    page.message = ' Tomorrow ';
    page.startConversation();
    expect(api.sendTeacherMessage).toHaveBeenCalledWith({
      schoolId: 5, classId: 1, subject: 'Homework', content: 'Tomorrow', recipientUserIds: [20],
    }, []);
    expect(page.sending()).toBe(false);
    expect(page.selectedRecipientIds()).toEqual([]);
  });
});
