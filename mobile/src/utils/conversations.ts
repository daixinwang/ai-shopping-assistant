import { mapAgentProducts } from '../api/client';
import type { AgentProduct, StreamEvent } from '../api/client';
import { parseAnswer } from './answer';

export type CartLine = {
  cartItemId: number; productId: string; skuId: string; title: string;
  options: Record<string, string>; quantity: number; unitPrice: number; subtotal: number;
};
export type CheckoutPreview = { token: string; lines: CartLine[]; itemCount: number; total: number; address: string };
export type PlacedOrder = { orderId: string; lines: CartLine[]; itemCount: number; total: number; address: string };
export type CartSnapshot = { lines: CartLine[]; itemCount: number; total: number };
export type ComparisonRow = { label: string; values: string[]; highlight: number | null };
export type Comparison = {
  products: { productId: string; title: string; brand: string; price: number; imageUrl: string | null }[];
  rows: ComparisonRow[];
  /** Dimensions without data for any product; named once instead of shown as empty rows. */
  missing?: string[];
};

/** Structured content a tool result adds to an answer, rendered as interactive cards. */
export type MessageCard =
  | { kind: 'checkout'; preview: CheckoutPreview }
  | { kind: 'order'; order: PlacedOrder }
  | { kind: 'spec'; title: string; dimensions: { name: string; values: string[] }[] }
  | { kind: 'choices'; options: { label: string; reply: string }[] }
  | { kind: 'compare'; comparison: Comparison }
  | { kind: 'cart'; cart: CartSnapshot };

export type Message = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  status?: 'streaming' | 'done' | 'error';
  /** Narrative as received; `done.narrative` replaces it with the final answer. */
  raw?: string;
  products?: AgentProduct[];
  reasons?: Record<string, string>;
  followups?: string[];
  card?: MessageCard;
  phase?: string;
  phaseLabel?: string;
  hasImage?: boolean;
  /** Why the answer failed, shown next to the retry button. */
  error?: string;
  /** Same request id lets a retry replay a turn that already ran on the server. */
  retry?: { query: string; requestId: string };
};
export type Conversation = { id: string; sessionId: string | null; title: string; messages: Message[]; updatedAt: number };
export type ConversationState = { activeId: string; conversations: Conversation[] };
export type ConversationAction =
  | { type: 'new'; conversation: Conversation }
  | { type: 'select'; id: string }
  | { type: 'update'; id: string; patch: Partial<Conversation> };

export const CONVERSATIONS_KEY = 'ai_shopping_conversations_v2';
export const LEGACY_CONVERSATIONS_KEY = 'ai_shopping_conversations_v1';
export const WELCOME_TEXT = '说说预算、品类或使用场景，我来帮你挑。也可以拍张照片，找找同款。';

export function createConversation(id: string): Conversation {
  return {
    id, sessionId: null, title: '新对话', updatedAt: Date.now(),
    messages: [{ id: 'welcome', role: 'assistant', text: WELCOME_TEXT, status: 'done' }],
  };
}

export function conversationReducer(state: ConversationState, action: ConversationAction): ConversationState {
  if (action.type === 'new') return { activeId: action.conversation.id, conversations: [action.conversation, ...state.conversations] };
  if (action.type === 'select') return state.conversations.some(item => item.id === action.id) ? { ...state, activeId: action.id } : state;
  return { ...state, conversations: state.conversations.map(item => item.id === action.id ? { ...item, ...action.patch, id: item.id } : item) };
}

// ── Stream events → message ───────────────────────────────────────────────

const num = (value: unknown, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

function mapLines(lines: unknown): CartLine[] {
  if (!Array.isArray(lines)) return [];
  return lines.map((line: any) => ({
    cartItemId: num(line.cart_item_id),
    productId: String(line.product_id ?? ''),
    skuId: String(line.sku_id ?? ''),
    title: String(line.title ?? ''),
    options: line.options && typeof line.options === 'object' ? line.options : {},
    quantity: num(line.quantity, 1),
    unitPrice: num(line.unit_price),
    subtotal: num(line.subtotal),
  }));
}

export function cartFromPayload(cart: any): CartSnapshot | null {
  if (!cart || typeof cart !== 'object') return null;
  return { lines: mapLines(cart.lines), itemCount: num(cart.item_count), total: num(cart.total) };
}

const EMPTY_VALUE = '—';

export function comparisonFromPayload(comparison: any): Comparison | null {
  if (!comparison || !Array.isArray(comparison.rows)) return null;
  const rows: ComparisonRow[] = comparison.rows.map((row: any) => ({
    label: String(row.label ?? ''),
    values: (row.values || []).map((value: unknown) => (value == null || String(value).trim() === '' ? EMPTY_VALUE : String(value))),
    highlight: typeof row.highlight === 'number' ? row.highlight : null,
  }));
  const hasData = (row: ComparisonRow) => row.values.some(value => value !== EMPTY_VALUE);
  return {
    products: mapAgentProducts({ products: comparison.products }).map(item => ({
      productId: item.productId, title: item.title, brand: item.brand, price: item.price, imageUrl: item.imageUrl ?? null,
    })),
    rows: rows.filter(hasData),
    missing: rows.filter(row => !hasData(row)).map(row => row.label),
  };
}

function cardFromPayload(payload: any): MessageCard | undefined {
  switch (payload?.action) {
    case 'checkout_confirm': {
      const preview = payload.preview || {};
      return { kind: 'checkout', preview: {
        token: String(preview.confirm_token ?? ''), lines: mapLines(preview.lines),
        itemCount: num(preview.item_count), total: num(preview.total), address: String(preview.address ?? ''),
      } };
    }
    case 'checkout': {
      const order = payload.order || {};
      return { kind: 'order', order: {
        orderId: String(order.order_id ?? ''), lines: mapLines(order.lines),
        itemCount: num(order.item_count), total: num(order.total), address: String(order.address ?? ''),
      } };
    }
    case 'ask_spec':
      return { kind: 'spec', title: String(payload.title ?? ''), dimensions: (payload.dimensions || []).map((dim: any) => ({
        name: String(dim.name ?? ''), values: (dim.values || []).map(String),
      })) };
    case 'ask_which_product':
      return { kind: 'choices', options: (payload.candidates || []).map((item: any, index: number) => ({
        label: String(item.title ?? `第${index + 1}个`), reply: `第${index + 1}个`,
      })) };
    case 'compare': {
      const comparison = comparisonFromPayload(payload.comparison);
      return comparison ? { kind: 'compare', comparison } : undefined;
    }
    case 'view': {
      const cart = cartFromPayload(payload.cart);
      return cart ? { kind: 'cart', cart } : undefined;
    }
    default:
      return undefined;
  }
}

function withNarrative(message: Message, raw: string): Message {
  const parsed = parseAnswer(raw);
  return { ...message, raw, text: parsed.opening, reasons: parsed.reasons, followups: parsed.followups };
}

/** Folds one SSE event into the assistant message that is being streamed. */
export function applyStreamEvent(message: Message, event: StreamEvent): Message {
  const data = event.data;
  switch (event.event) {
    case 'status':
      return { ...message, phase: data?.phase, phaseLabel: data?.message };
    case 'tool_result': {
      const payload = data?.payload || {};
      const products = mapAgentProducts(payload);
      return {
        ...message,
        ...(products.length ? { products } : {}),
        ...(cardFromPayload(payload) ? { card: cardFromPayload(payload) } : {}),
      };
    }
    case 'token':
      return withNarrative(message, (message.raw || '') + String(data ?? ''));
    case 'done': {
      const finished = typeof data?.narrative === 'string' ? withNarrative(message, data.narrative) : message;
      return { ...finished, status: 'done', phase: undefined, phaseLabel: undefined };
    }
    case 'error':
      return { ...message, status: 'error', error: data?.message, phase: undefined, phaseLabel: undefined };
    default:
      return message;
  }
}

// ── Persistence ───────────────────────────────────────────────────────────

const isProduct = (p: any) => p && typeof p.productId === 'string' && typeof p.title === 'string' && typeof p.priceDisplay === 'string';

function sanitizeMessage(m: any): Message | null {
  if (!m || typeof m.id !== 'string' || typeof m.text !== 'string' || !['user', 'assistant'].includes(m.role)) return null;
  const message: Message = { id: m.id, role: m.role, text: m.text };
  if (typeof m.raw === 'string') message.raw = m.raw;
  if (Array.isArray(m.products) && m.products.every(isProduct)) message.products = m.products;
  if (m.reasons && typeof m.reasons === 'object' && !Array.isArray(m.reasons)) message.reasons = m.reasons;
  if (Array.isArray(m.followups) && m.followups.every((t: unknown) => typeof t === 'string')) message.followups = m.followups;
  if (m.card && typeof m.card === 'object' && typeof m.card.kind === 'string') message.card = m.card;
  if (m.hasImage === true) message.hasImage = true;
  if (typeof m.error === 'string') message.error = m.error;
  if (m.retry && typeof m.retry.query === 'string' && typeof m.retry.requestId === 'string') message.retry = m.retry;
  if (m.status === 'done' || m.status === 'error') message.status = m.status;
  // An answer still streaming when the app closed can be retried with its request id.
  if (m.status === 'streaming') message.status = 'error';
  return message;
}

/** Restores v2 history, migrating v1 (recommendations stored per conversation). */
export function restoreConversations(raw: string | null): ConversationState | null {
  try {
    const value = JSON.parse(raw || 'null');
    if (!value || !Array.isArray(value.conversations) || !value.conversations.length) return null;
    const conversations: Conversation[] = [];
    for (const item of value.conversations) {
      if (!item || typeof item.id !== 'string' || typeof item.title !== 'string'
        || !(item.sessionId === null || typeof item.sessionId === 'string') || !Number.isFinite(item.updatedAt)
        || !Array.isArray(item.messages)) return null;
      const messages = item.messages.map(sanitizeMessage);
      if (messages.some((m: Message | null) => m === null)) return null;
      if (Array.isArray(item.products) && item.products.length && item.products.every(isProduct)) {
        const last = [...messages].reverse().find((m: Message) => m.role === 'assistant');
        if (last && !last.products) last.products = item.products;
      }
      conversations.push({ id: item.id, sessionId: item.sessionId, title: item.title, updatedAt: item.updatedAt, messages });
    }
    if (!conversations.some(item => item.id === value.activeId)) return null;
    return { activeId: value.activeId, conversations };
  } catch {
    return null;
  }
}
