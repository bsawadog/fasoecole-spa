import { TestBed } from '@angular/core/testing';
import { ConversationThreadView } from './conversation-thread';
import { ConversationMessage } from './self-space.service';

describe('Conversation history window', () => {
  it('shows the most recent thirty messages, allows older history, and preserves expansion across refreshes', async () => {
    const fixture = TestBed.createComponent(ConversationThreadView);
    const messages = Array.from({ length: 40 }, (_, index) => ({ id: index + 1, content: `Message ${index + 1}`,
      senderName: 'Awa', sentAt: `2026-10-01T12:${String(index).padStart(2,'0')}:00`, mine: false } as ConversationMessage));
    fixture.componentRef.setInput('conversationId', 1); fixture.componentRef.setInput('messages', messages);
    fixture.detectChanges(); await fixture.whenStable();
    expect(fixture.nativeElement.querySelectorAll('article')).toHaveLength(30);
    expect(fixture.nativeElement.textContent).not.toContain('Message 10');
    (fixture.nativeElement.querySelector('button.older') as HTMLButtonElement).click(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('article')).toHaveLength(40);
    fixture.componentRef.setInput('messages', [...messages]); fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('article')).toHaveLength(40);
    fixture.componentRef.setInput('conversationId', 2); fixture.detectChanges(); await fixture.whenStable();
    expect(fixture.nativeElement.querySelectorAll('article')).toHaveLength(30);
    fixture.destroy();
  });
});
