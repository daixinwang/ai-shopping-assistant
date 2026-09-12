import { describe, expect, it } from 'vitest';
import { createConversation, conversationReducer, restoreConversations } from './conversations';

describe('conversation lifecycle', () => {
  it('starts an independent conversation and retains the previous history', () => {
    const old = { ...createConversation('old'), sessionId: 'server-old', messages: [{ id: 'm', role: 'user' as const, text: '耳机' }] };
    const next = conversationReducer({ activeId: old.id, conversations: [old] }, { type: 'new', conversation: createConversation('new') });
    expect(next.activeId).toBe('new');
    expect(next.conversations[0].sessionId).toBeNull();
    expect(next.conversations[0].messages).toHaveLength(1);
    expect(next.conversations[1]).toEqual(old);
  });
  it('switches back with the original session, messages and recommendations intact', () => {
    const old = { ...createConversation('old'), sessionId: 'server-old', messages: [{ id: 'm', role: 'user' as const, text: '通勤耳机' }], products: [{ productId: 'p1', title: '耳机', brand: '示例', category: '数码', price: 199, priceDisplay: '¥199' }] };
    const state = { activeId: 'new', conversations: [createConversation('new'), old] };
    const next = conversationReducer(state, { type: 'select', id: 'old' });
    expect(next.activeId).toBe('old');
    expect(next.conversations[1]).toEqual(old);
    expect(conversationReducer(state, { type: 'select', id: 'missing' })).toEqual(state);
  });
  it('routes a late reply to its original conversation', () => {
    const state = { activeId: 'new', conversations: [createConversation('new'), createConversation('old')] };
    const next = conversationReducer(state, { type: 'update', id: 'old', patch: { sessionId: 'server-old', title: '耳机' } });
    expect(next.activeId).toBe('new');
    expect(next.conversations[0].sessionId).toBeNull();
    expect(next.conversations[1].sessionId).toBe('server-old');
  });
  it('restores the active conversation after reload', () => {
    const state = { activeId: 'old', conversations: [createConversation('old')] };
    expect(restoreConversations(JSON.stringify(state))).toEqual(state);
  });
  it('rejects corrupt or malformed stored history without crashing', () => {
    for (const raw of ['{broken', '{}', '{"activeId":"a","conversations":[{"id":"a"}]}']) {
      expect(restoreConversations(raw)).toBeNull();
    }
  });
});
