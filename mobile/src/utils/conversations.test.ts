import { describe, expect, it } from 'vitest';
import {
  Message, applyStreamEvent, comparisonFromPayload, createConversation, conversationReducer, restoreConversations,
} from './conversations';

const answer = (patch: Partial<Message> = {}): Message => ({
  id: 'a1', role: 'assistant', text: '', status: 'streaming', ...patch,
});
const product = { productId: 'p1', title: '耳机', brand: '示例', category: '数码', price: 199, priceDisplay: '¥199' };

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
    const old = {
      ...createConversation('old'), sessionId: 'server-old',
      messages: [{ id: 'm', role: 'user' as const, text: '通勤耳机' }, answer({ status: 'done', products: [product] })],
    };
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
  it('migrates v1 history by attaching recommendations to the last answer', () => {
    const v1 = {
      activeId: 'c', conversations: [{
        id: 'c', sessionId: 's', title: '耳机', updatedAt: 1, products: [product],
        messages: [{ id: 'u', role: 'user', text: '耳机' }, { id: 'a', role: 'assistant', text: '为你推荐' }],
      }],
    };
    const restored = restoreConversations(JSON.stringify(v1))!;
    expect(restored.conversations[0].messages[1].products).toEqual([product]);
    expect('products' in restored.conversations[0]).toBe(false);
  });
  it('marks an answer interrupted by a reload as retryable', () => {
    const state = {
      activeId: 'c', conversations: [{
        ...createConversation('c'),
        messages: [answer({ text: '为你', retry: { query: '耳机', requestId: 'rq-1234567890' } })],
      }],
    };
    const restored = restoreConversations(JSON.stringify(state))!;
    expect(restored.conversations[0].messages[0].status).toBe('error');
    expect(restored.conversations[0].messages[0].retry).toEqual({ query: '耳机', requestId: 'rq-1234567890' });
  });
});

describe('applyStreamEvent', () => {
  it('shows the current phase until the first words arrive', () => {
    const next = applyStreamEvent(answer(), { event: 'status', data: { phase: 'tool', message: '正在为你检索商品…' } });
    expect(next).toMatchObject({ phase: 'tool', phaseLabel: '正在为你检索商品…' });
  });

  it('fills the answer as tokens arrive and finalizes it on done', () => {
    let message = answer();
    for (const token of ['{"opening": "为你', '推荐了 1 款", "items": [{"productId": "p1", "description": "降噪', '好"}]']) {
      message = applyStreamEvent(message, { event: 'token', data: token });
    }
    expect(message.text).toBe('为你推荐了 1 款');
    expect(message.reasons).toEqual({ p1: '降噪好' });
    expect(message.followups).toEqual([]);

    message = applyStreamEvent(message, { event: 'done', data: {
      narrative: '{"opening": "为你推荐了 1 款耳机", "items": [{"productId": "p1", "description": "降噪好"}], "followup": ["再便宜点"]}',
    } });
    expect(message).toMatchObject({ status: 'done', text: '为你推荐了 1 款耳机', followups: ['再便宜点'] });
  });

  it('keeps a plain-text answer as written', () => {
    const message = applyStreamEvent(answer(), { event: 'done', data: { narrative: '订单已提交：订单号 ord_1。' } });
    expect(message.text).toBe('订单已提交：订单号 ord_1。');
  });

  it('attaches product cards from the tool result', () => {
    const message = applyStreamEvent(answer(), { event: 'tool_result', data: {
      tool_name: 'recommend', payload: { products: [{ product_id: 'p1', title: '耳机', price: 199, price_display: '¥199' }] },
    } });
    expect(message.products?.map(item => item.productId)).toEqual(['p1']);
  });

  it('turns a checkout preview into a confirmation card', () => {
    const message = applyStreamEvent(answer(), { event: 'tool_result', data: { tool_name: 'cart', payload: {
      action: 'checkout_confirm',
      preview: {
        confirm_token: 't1', item_count: 2, total: 258, address: '默认地址',
        lines: [{ cart_item_id: 1, product_id: 'p1', sku_id: 's1', title: '精华', options: { 规格: '30ml' }, quantity: 2, unit_price: 129, subtotal: 258 }],
      },
    } } });
    expect(message.card).toEqual({ kind: 'checkout', preview: {
      token: 't1', itemCount: 2, total: 258, address: '默认地址',
      lines: [{ cartItemId: 1, productId: 'p1', skuId: 's1', title: '精华', options: { 规格: '30ml' }, quantity: 2, unitPrice: 129, subtotal: 258 }],
    } });
  });

  it('turns a placed order into a receipt card', () => {
    const message = applyStreamEvent(answer(), { event: 'tool_result', data: { tool_name: 'cart', payload: {
      action: 'checkout', order: { order_id: 'ord_1', item_count: 1, total: 99, address: '默认地址', lines: [] },
    } } });
    expect(message.card).toEqual({ kind: 'order', order: { orderId: 'ord_1', itemCount: 1, total: 99, address: '默认地址', lines: [] } });
  });

  it('offers spec values and candidate products as tappable replies', () => {
    const spec = applyStreamEvent(answer(), { event: 'tool_result', data: { tool_name: 'cart', payload: {
      action: 'ask_spec', title: '耳机', dimensions: [{ name: '颜色', values: ['黑', '白'] }],
    } } });
    expect(spec.card).toEqual({ kind: 'spec', title: '耳机', dimensions: [{ name: '颜色', values: ['黑', '白'] }] });

    const choices = applyStreamEvent(answer(), { event: 'tool_result', data: { tool_name: 'cart', payload: {
      action: 'ask_which_product', candidates: [{ product_id: 'p1', title: 'A 耳机' }, { product_id: 'p2', title: 'B 耳机' }],
    } } });
    expect(choices.card).toEqual({ kind: 'choices', options: [
      { label: 'A 耳机', reply: '第1个' }, { label: 'B 耳机', reply: '第2个' },
    ] });
  });

  it('records a server error on the message', () => {
    const message = applyStreamEvent(answer({ text: '为你' }), { event: 'error', data: { message: 'stream processing failed' } });
    expect(message.status).toBe('error');
  });
});

describe('comparisonFromPayload', () => {
  it('drops rows that have no data for any product and lists them as missing', () => {
    const comparison = comparisonFromPayload({
      products: [{ product_id: 'p1', title: 'A 耳机' }, { product_id: 'p2', title: 'B 耳机' }],
      rows: [
        { label: '价格', values: ['¥1499 起', '¥1799 起'], highlight: 0 },
        { label: '续航', values: ['—', '—'], highlight: null },
        { label: '降噪', values: ['强', '—'], highlight: null },
        { label: '屏幕', values: ['', null], highlight: null },
      ],
    });
    expect(comparison?.rows.map(row => row.label)).toEqual(['价格', '降噪']);
    expect(comparison?.missing).toEqual(['续航', '屏幕']);
  });
});
