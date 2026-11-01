import { groupConversations, groupMessageDays } from './conversation-groups';
import { ConversationMessage, ConversationSummary } from './self-space.service';

describe('Conversation organization', () => {
  const item = (id: number, date: string, names = ['Vous', 'Awa'], schoolId = 1) => ({ id, schoolId, schoolName: 'École A',
    subject: `Objet ${id}`, recipientNames: names, lastMessageAt: date, createdAt: date, unread: false } as ConversationSummary);
  it('groups by latest activity month, recipients and school, preserving every private thread and original order', () => {
    const items = [item(1,'2026-09-01T12:00:00'), item(2,'2026-10-05T12:00:00'),
      item(3,'2026-10-06T12:00:00',['Awa','Vous']), item(4,'2026-10-07T12:00:00',['Vous','Ali']),
      item(5,'2026-10-08T12:00:00',['Vous','Awa'],2)];
    items[1].unread = true;
    const groups = groupConversations(items, '', 'Vous');
    expect(groups.map(month => month.key)).toEqual(['2026-10','2026-09']);
    expect(groups[0].count).toBe(4); expect(groups[0].unread).toBe(1);
    expect(groups[0].contacts).toHaveLength(3);
    expect(groups[0].contacts.at(-1)?.items.map(row => row.id)).toEqual([3,2]);
    expect(groups[0].contacts.at(-1)?.name).toBe('Awa');
    expect(items.map(row => row.id)).toEqual([1,2,3,4,5]);
  });
  it('finds names, subjects, children and school names without accent sensitivity', () => {
    const items = [item(1,'2026-10-01T12:00:00',['Boubacar']), item(2,'2026-09-01T12:00:00',['Fatou'])];
    items[0].subject = 'Réunion'; items[1].studentName = 'Élodie';
    expect(groupConversations(items,'reunion')[0].contacts[0].items[0].id).toBe(1);
    expect(groupConversations(items,'elodie')[0].contacts[0].items[0].id).toBe(2);
    expect(groupConversations(items,'fatou')[0].count).toBe(1);
    expect(groupConversations(items,'ecole a')).toHaveLength(2);
    expect(groupConversations(items,'absent')).toEqual([]);
  });
  it('falls back to creation date and keeps old or incomplete summaries readable', () => {
    const row = { ...item(1,''), createdAt: '2026-10-01T12:00:00', recipientNames: [] };
    expect(groupConversations([row])[0].key).toBe('2026-10');
    expect(groupConversations([row])[0].contacts[0].name).toBe('École A');
    expect(groupConversations([item(2,'invalid')])[0].label).toBe('Date non disponible');
  });
  it('groups messages by local calendar day in chronological order without changing the source', () => {
    const messages = [{ id: 3, sentAt: '2026-10-02T12:00:00' }, { id: 2, sentAt: '2026-10-01T14:00:00' },
      { id: 1, sentAt: '2026-10-01T12:00:00' }] as ConversationMessage[];
    expect(groupMessageDays(messages).map(day => day.messages.map(message => message.id))).toEqual([[1,2],[3]]);
    expect(messages.map(message => message.id)).toEqual([3,2,1]);
  });
  it('names the correspondent instead of the school itself in the school workspace', () => {
    const row = item(1,'2026-10-01T12:00:00',['École A','Awa']);
    expect(groupConversations([row], '', 'Direction', true)[0].contacts[0].name).toBe('Awa');
    row.recipientNames = []; row.parentName = 'Awa';
    expect(groupConversations([row], '', 'Direction', true)[0].contacts[0].name).toBe('Awa');
    expect(groupConversations([row])[0].contacts[0].name).toBe('École A');
  });
});
