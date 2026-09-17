import { afterEach, describe, expect, it, vi } from 'vitest';
import { Platform } from 'react-native';
import {
  chat, chatStream, chatWithFallback, compareAgentProducts, mapAgentProducts,
  mutateCart, parseSSEFrame,
} from './client';

describe('CartPilot API mapping', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('maps backend snake_case product cards to the mobile DTO', () => {
    expect(mapAgentProducts({ products: [{
      product_id: 'p1', title: '轻量耳机', brand: 'Demo', category: '数码',
      price: 499, price_display: '¥399–¥499', image_url: '/images/p1.jpg',
    }] })).toEqual([{
      productId: 'p1', title: '轻量耳机', brand: 'Demo', category: '数码',
      subCategory: undefined, price: 499, priceDisplay: '¥399–¥499', imageUrl: `${process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000'}/images/p1.jpg`,
    }]);
  });

  it('parses named SSE events and JSON data', () => {
    expect(parseSSEFrame('event: token\ndata: "你好"')).toEqual({ event: 'token', data: '你好' });
  });

  it('selects non-streaming before dispatch on native clients', async () => {
    const originalOS = Platform.OS;
    Platform.OS = 'android';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        session_id: 's1', narrative: '完成', decision: {}, trace: {},
        tool_result: { payload: { products: [] } },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const reply = await chatWithFallback({ query: '推荐耳机' }, () => {});

    expect(reply.sessionId).toBe('s1');
    expect(reply.narrative).toBe('完成');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/chat$/);
    Platform.OS = originalOS;
  });

  it('does not replay a request when an accepted SSE response cannot be read', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, body: null });
    vi.stubGlobal('fetch', fetchMock);
    await expect(chatStream({ query: '加入购物车' }, () => {})).rejects.toThrow('不支持 SSE');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces backend validation messages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 422, json: async () => ({ detail: '图片过大' }),
    }));
    await expect(chat({ query: '识图' })).rejects.toThrow('图片过大');
  });

  it('keeps session and image fields in a refine request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ session_id: 's1', narrative: '已调整', tool_result: {}, decision: {}, trace: {} }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await chat({ query: '再便宜点', sessionId: 's1', userId: 'u1', imageBase64: 'abc' });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ query: '再便宜点', session_id: 's1', user_id: 'u1', image_base64: 'abc' });
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('calls structured compare and cart endpoints', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rows: [], cart: {} }) });
    vi.stubGlobal('fetch', fetchMock);

    await compareAgentProducts(['p1', 'p2'], '价格');
    await mutateCart({ action: 'add', productID: 'p1' });

    expect(String(fetchMock.mock.calls[0][0])).toContain('/compare');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ product_ids: ['p1', 'p2'], focus: '价格' });
    expect(String(fetchMock.mock.calls[1][0])).toContain('/cart/mutate');
  });

  it('converts aborted requests into a recoverable timeout message', async () => {
    const aborted = Object.assign(new Error('aborted'), { name: 'AbortError' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(aborted));
    await expect(chat({ query: '推荐耳机' })).rejects.toThrow('请求超时');
  });
});
