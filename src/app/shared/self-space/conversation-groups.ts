import { ConversationMessage, ConversationSummary } from './self-space.service';

export const normalizeConversationText = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr');
const dateValue = (value: string) => { const time = Date.parse(value); return Number.isFinite(time) ? time : 0; };
const activity = (item: ConversationSummary) => item.lastMessageAt || item.createdAt;
export function conversationDate(value: string): { month: string; day: string; monthLabel: string; dayLabel: string } {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return { month: 'unknown', day: 'unknown', monthLabel: 'Date non disponible', dayLabel: 'Date non disponible' };
  const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  return { month, day: `${month}-${String(date.getDate()).padStart(2, '0')}`,
    monthLabel: new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(date),
    dayLabel: new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(date) };
}
export interface ConversationContact { key: string; name: string; school: string; unread: number; items: ConversationSummary[]; }
export interface ConversationMonth { key: string; label: string; unread: number; count: number; contacts: ConversationContact[]; }
export function groupConversations(items: ConversationSummary[], search = '', viewerName = '', forSchool = false): ConversationMonth[] {
  const query = normalizeConversationText(search.trim()), viewer = normalizeConversationText(viewerName.trim());
  const months = new Map<string, ConversationMonth>();
  for (const item of [...items].sort((a,b) => dateValue(activity(b)) - dateValue(activity(a)) || b.id - a.id)) {
    const names = [...new Set((item.recipientNames ?? []).map(name => name.trim()).filter(name => name && normalizeConversationText(name) !== viewer
      && (!forSchool || normalizeConversationText(name) !== normalizeConversationText(item.schoolName ?? ''))))]
      .sort((a,b) => a.localeCompare(b, 'fr'));
    const name = names.join(', ') || (forSchool ? item.parentName || item.schoolName : item.schoolName || item.parentName) || 'Destinataire non précisé';
    if (query && !normalizeConversationText([name, item.subject, item.schoolName, item.studentName].filter(Boolean).join(' ')).includes(query)) continue;
    const date = conversationDate(activity(item));
    let month = months.get(date.month);
    if (!month) { month = { key: date.month, label: date.monthLabel, unread: 0, count: 0, contacts: [] }; months.set(date.month, month); }
    const key = JSON.stringify([item.schoolId, names.length ? names : [name]]);
    let contact = month.contacts.find(group => group.key === key);
    if (!contact) { contact = { key, name, school: item.schoolName, unread: 0, items: [] }; month.contacts.push(contact); }
    contact.items.push(item); contact.unread += item.unread ? 1 : 0;
    month.count++; month.unread += item.unread ? 1 : 0;
  }
  return [...months.values()];
}
export function groupMessageDays(messages: ConversationMessage[]): { key: string; label: string; messages: ConversationMessage[] }[] {
  const days = new Map<string, { key: string; label: string; messages: ConversationMessage[] }>();
  for (const message of [...messages].sort((a,b) => dateValue(a.sentAt) - dateValue(b.sentAt) || a.id - b.id)) {
    const date = conversationDate(message.sentAt);
    let group = days.get(date.day);
    if (!group) { group = { key: date.day, label: date.dayLabel, messages: [] }; days.set(date.day, group); }
    group.messages.push(message);
  }
  return [...days.values()];
}
