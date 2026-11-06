import { afterEach, describe, expect, it, vi } from 'vitest';
import { Platform } from 'react-native';
import {
  chat, chatWithRetry, compareAgentProducts, mapAgentProducts, mutateCart, newRequestId,
  parseSSEFrame, sendChat, undoPreference,
} from './client';

const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const jsonResponse = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300, status, json: async () => body,
});

function streamResponse(frames: string[]) {
  const encoder = new TextEncoder();
  let index = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () => (index < frames.length
          ? { value: encoder.encode(frames[index++]), done: false }
          : { value: undefined, done: true }),
      }),
    },
  };
}

class FakeXHR {
  static instances: FakeXHR[] = [];
  readyState = 0;
  status = 0;
  responseText = '';
  url = '';
  body = '';
  headers: Record<string, string> = {};
  onprogress?: () => void;
  onload?: () => void;
  onerror?: () => void;
  ontimeout?: () => void;
  open(_method: string, url: string) { this.url = url; }
  setRequestHeader(name: string, value: string) { this.headers[name] = value; }
  send(body: string) { this.body = body; FakeXHR.instances.push(this); }
  abort() {}
  emit(chunk: string) { this.readyState = 3; this.status = 200; this.responseText += chunk; this.onprogress?.(); }
  finish() { this.readyState = 4; this.status = 200; this.onload?.(); }
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

describe('CartPilot API mapping', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Platform.OS = 'web';
    FakeXHR.instances = [];
  });

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

  it('creates request ids the backend accepts', () => {
    const id = newRequestId();
    expect(id).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(newRequestId()).not.toBe(id);
  });

  it('streams on the web and treats done.narrative as the final answer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse([
      sse('session', { session_id: 's1' }),
      sse('token', '{"opening": "半'),
      sse('done', { narrative: '{"opening": "完整回答"}', timings: {} }),
    ])));
    const seen: string[] = [];

    const reply = await sendChat({ query: '推荐耳机' }, event => seen.push(event.event));

    expect(seen).toEqual(['session', 'token', 'done']);
    expect(reply.sessionId).toBe('s1');
    expect(reply.narrative).toBe('{"opening": "完整回答"}');
  });

  it('streams on native clients through incremental XHR reads', async () => {
    Platform.OS = 'android';
    vi.stubGlobal('XMLHttpRequest', FakeXHR);
    const tokens: string[] = [];

    const pending = sendChat({ query: '推荐耳机' }, event => {
      if (event.event === 'token') tokens.push(event.data);
    });
    await tick();
    const xhr = FakeXHR.instances[0];
    expect(xhr.url).toMatch(/\/chat\/stream$/);
    expect(JSON.parse(xhr.body).request_id).toMatch(/^[A-Za-z0-9_-]{8,64}$/);

    xhr.emit(sse('session', { session_id: 's1' }) + sse('token', '你'));
    expect(tokens).toEqual(['你']);  // Delivered before the response completes.
    xhr.emit('event: token\ndata: "好"\n');  // A frame split across two reads.
    xhr.emit('\n' + sse('done', { narrative: '你好' }));
    xhr.finish();

    const reply = await pending;
    expect(tokens).toEqual(['你', '好']);
    expect(reply.narrative).toBe('你好');
  });

  it('retries a dropped stream through /chat with the same request id', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(streamResponse([sse('session', { session_id: 's1' }), sse('token', '已加')]))
      .mockResolvedValueOnce(jsonResponse({
        session_id: 's1', narrative: '已加入购物车', decision: {}, trace: {}, tool_result: { payload: {} },
      }));
    vi.stubGlobal('fetch', fetchMock);

    const reply = await sendChat({ query: '加入购物车' }, () => {});

    expect(reply.narrative).toBe('已加入购物车');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toMatch(/\/chat$/);
    const first = JSON.parse(fetchMock.mock.calls[0][1].body);
    const retry = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(retry.request_id).toBe(first.request_id);
  });

  it('waits while the same request is still being processed', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ detail: { code: 'request_in_progress', message: '处理中', retryable: true } }, 409))
      .mockResolvedValueOnce(jsonResponse({ session_id: 's1', narrative: '好了', tool_result: {}, decision: {}, trace: {} }));
    vi.stubGlobal('fetch', fetchMock);

    const reply = await chatWithRetry({ query: '下单', requestId: 'req-test-0001' }, { retryDelayMs: 0 });

    expect(reply.narrative).toBe('好了');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('surfaces a server error event without replaying the request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(streamResponse([
      sse('session', { session_id: 's1' }), sse('error', { message: 'stream processing failed' }),
    ]));
    vi.stubGlobal('fetch', fetchMock);

    await expect(sendChat({ query: '推荐' }, () => {})).rejects.toThrow('stream processing failed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces backend validation messages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ detail: '图片过大' }, 422)));
    await expect(chat({ query: '识图' })).rejects.toThrow('图片过大');
  });

  it('keeps session and image fields in a refine request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      session_id: 's1', narrative: '已调整', tool_result: {}, decision: {}, trace: {},
    }));
    vi.stubGlobal('fetch', fetchMock);

    await chat({ query: '再便宜点', sessionId: 's1', userId: 'u1', imageBase64: 'abc', requestId: 'req-test-0002' });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      query: '再便宜点', session_id: 's1', user_id: 'u1', image_base64: 'abc', request_id: 'req-test-0002',
    });
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('calls structured compare and cart endpoints with an idempotency key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ rows: [], cart: {} }));
    vi.stubGlobal('fetch', fetchMock);

    await compareAgentProducts(['p1', 'p2'], '价格');
    await mutateCart({ action: 'add', productID: 'p1' });

    expect(String(fetchMock.mock.calls[0][0])).toContain('/compare');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ product_ids: ['p1', 'p2'], focus: '价格' });
    expect(String(fetchMock.mock.calls[1][0])).toContain('/cart/mutate');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).request_id).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });

  it('undoes an automatic preference write with its token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status: 'undone' }));
    vi.stubGlobal('fetch', fetchMock);

    await undoPreference('u1', 'undo_abc');

    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/preferences\/u1\/undo$/);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ undo_token: 'undo_abc' });
  });

  it('converts aborted requests into a recoverable timeout message', async () => {
    const aborted = Object.assign(new Error('aborted'), { name: 'AbortError' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(aborted));
    await expect(chat({ query: '推荐耳机' })).rejects.toThrow('请求超时');
  });

  it('explains a network failure instead of showing the raw fetch error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(sendChat({ query: '推荐耳机' }, () => {}, { retryDelayMs: 0 })).rejects.toThrow('网络连接失败');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Network request failed')));
    await expect(chat({ query: '推荐耳机' })).rejects.toThrow('网络连接失败');
  });
});
