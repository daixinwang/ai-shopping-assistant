import type { AgentProduct } from '../api/client';
export type Message = { id: string; role: 'user' | 'assistant'; text: string };
export type Conversation = { id: string; sessionId: string | null; title: string; messages: Message[]; products: AgentProduct[]; updatedAt: number };
export type ConversationState = { activeId: string; conversations: Conversation[] };
export type ConversationAction = { type: 'new'; conversation: Conversation } | { type: 'select'; id: string } | { type: 'update'; id: string; patch: Partial<Conversation> };
export const CONVERSATIONS_KEY = 'ai_shopping_conversations_v1';
export function createConversation(id: string): Conversation {
  return { id, sessionId: null, title: '新对话', messages: [{ id: 'welcome', role: 'assistant', text: '告诉我预算、品类或使用场景，我会从本地商品目录中帮你挑选。' }], products: [], updatedAt: Date.now() };
}
export function conversationReducer(state: ConversationState, action: ConversationAction): ConversationState {
  if (action.type === 'new') return { activeId: action.conversation.id, conversations: [action.conversation, ...state.conversations] };
  if (action.type === 'select') return state.conversations.some(item => item.id === action.id) ? { ...state, activeId: action.id } : state;
  return { ...state, conversations: state.conversations.map(item => item.id === action.id ? { ...item, ...action.patch, id: item.id } : item) };
}
export function restoreConversations(raw: string | null): ConversationState | null {
  try {
    const value = JSON.parse(raw || 'null');
    if (!value || !Array.isArray(value.conversations) || !value.conversations.length) return null;
    const valid = value.conversations.every((item: any) => item && typeof item.id === 'string' && typeof item.title === 'string'
      && (item.sessionId === null || typeof item.sessionId === 'string') && Number.isFinite(item.updatedAt)
      && Array.isArray(item.messages) && item.messages.every((m: any) => m && typeof m.id === 'string' && typeof m.text === 'string' && ['user', 'assistant'].includes(m.role))
      && Array.isArray(item.products) && item.products.every((p: any) => p && typeof p.productId === 'string' && typeof p.title === 'string' && typeof p.priceDisplay === 'string'));
    if (!valid || !value.conversations.some((item: Conversation) => item.id === value.activeId)) return null;
    return value;
  } catch { return null; }
}
