import axios from 'axios';
import { Platform } from 'react-native';

const defaultHost = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
export const AGENT_BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL || `http://${defaultHost}:8000`
).replace(/\/$/, '');
const BASE_URL = `${AGENT_BASE_URL}/api/v1`;

/** The demo has no accounts; preferences and memory belong to this fixed user. */
export const DEMO_USER_ID = 'mobile-demo-user';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000, // 30 秒（AI 识别可能较慢）
  headers: {
    'Accept': 'application/json',
  },
});

export interface RecognitionResult {
  category: string;
  subcategory: string;
  brand: string | null;
  color: string;
  style: string;
  key_features: string[];
  search_keywords: string[];
}

export interface SuggestionCard {
  id: string;
  label: string;
  filter_params: {
    sort?: string;
    store_type?: string;
    platform?: string;
    rating_min?: number;
  };
}

export interface PlatformPrices {
  tmall?: number;
  jd?: number;
  pdd?: number;
}

export interface ProductItem {
  id: string;
  name: string;
  category: string;
  brand: string;
  color: string;
  platform_prices: PlatformPrices;
  min_price: number;
  rating: number;
  sales: number;
  store_type: string;
  tags: string[];
  image_url: string;
}

export interface IdentifyResponse {
  session_id: string;
  recognition: RecognitionResult;
  suggestions: SuggestionCard[];
  products: ProductItem[];
}

export interface FilterParams {
  sort?: string;
  store_type?: string;
  platform?: string;
  rating_min?: number;
  price_max?: number;
  price_min?: number;
  color?: string;
}

// API 函数
export const identifyProduct = async (imageUri: string): Promise<IdentifyResponse> => {
  const formData = new FormData();
  const filename = imageUri.split('/').pop() || 'image.jpg';
  const match = /\.(\w+)$/.exec(filename);
  const type = match ? `image/${match[1]}` : 'image/jpeg';

  // Web 端：blob URL 需要先转成 File 对象
  if (imageUri.startsWith('blob:')) {
    const blob = await fetch(imageUri).then(r => r.blob());
    formData.append('image', blob, filename);
  } else {
    formData.append('image', {
      uri: imageUri,
      name: filename,
      type,
    } as any);
  }

  const response = await api.post<IdentifyResponse>('/identify', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const searchProducts = async (
  sessionId: string,
  filterParams: FilterParams
) => {
  const response = await api.post('/products/search', {
    session_id: sessionId,
    filter_params: filterParams,
  });
  return response.data;
};

export const filterProducts = async (
  sessionId: string,
  nlQuery: string
) => {
  const response = await api.post('/filter', {
    session_id: sessionId,
    nl_query: nlQuery,
  });
  return response.data;
};

export default api;

// ── CartPilot Agent API ─────────────────────────────────────

export interface AgentProduct {
  productId: string;
  title: string;
  brand: string;
  category: string;
  subCategory?: string;
  price: number;
  priceDisplay: string;
  imageUrl?: string | null;
}

export interface AgentReply {
  sessionId: string;
  narrative: string;
  decision: Record<string, unknown>;
  toolResult: { tool_name?: string; payload?: Record<string, any> };
  trace: Record<string, unknown>;
  products: AgentProduct[];
}

export interface ChatInput {
  query: string;
  sessionId?: string | null;
  userId?: string | null;
  imageBase64?: string | null;
  imageUrl?: string | null;
  /** Idempotency key: retries with the same id replay the stored turn on the server. */
  requestId?: string | null;
}

export interface SendOptions {
  signal?: AbortSignal;
  retryDelayMs?: number;
}

const agentHeaders = { Accept: 'application/json', 'Content-Type': 'application/json' };
// A real model turn can take well over 30 seconds; streaming uses an idle timeout instead.
const AGENT_TIMEOUT_MS = Number(process.env.EXPO_PUBLIC_API_TIMEOUT_MS || 60000);
const STREAM_IDLE_TIMEOUT_MS = Number(process.env.EXPO_PUBLIC_STREAM_IDLE_MS || 45000);

/** The connection dropped before the turn finished; the same request id may be retried. */
export class StreamInterruptedError extends Error {
  name = 'StreamInterruptedError';
}

export class AgentHttpError extends Error {
  name = 'AgentHttpError';
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}

export function newRequestId(): string {
  const random = () => Math.random().toString(36).slice(2, 10).padEnd(8, '0');
  return `rq-${Date.now().toString(36)}-${random()}${random()}`;
}

// Browsers and React Native report a failed connection as a TypeError with these messages.
const NETWORK_FAILURE = /Failed to fetch|Network request failed|NetworkError|Load failed/i;

function readableError(error: any): Error {
  if (error?.name === 'AbortError') return new Error('请求超时，请检查网络后重试');
  if (error instanceof TypeError && NETWORK_FAILURE.test(error.message)) {
    return new Error('网络连接失败，请检查网络或后端服务后重试');
  }
  return error;
}

function errorFromBody(status: number, body: any): AgentHttpError {
  const detail = body?.detail;
  const code = body?.code ?? detail?.code;
  const message = typeof detail === 'string'
    ? detail
    : detail?.message || body?.message || body?.error?.message || `请求失败（${status}）`;
  return new AgentHttpError(message, status, code);
}

async function readAgentResponse(response: Response): Promise<any> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw errorFromBody(response.status, body);
  return body;
}

async function agentJson(path: string, init: RequestInit = {}): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AGENT_TIMEOUT_MS);
  try {
    const response = await fetch(`${AGENT_BASE_URL}${path}`, { ...init, signal: controller.signal });
    return await readAgentResponse(response);
  } catch (error) {
    throw readableError(error);
  } finally {
    clearTimeout(timer);
  }
}

export function absoluteAssetUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  return value.startsWith('/') ? `${AGENT_BASE_URL}${value}` : value;
}

export function mapAgentProducts(payload?: Record<string, any>): AgentProduct[] {
  const source = payload?.products || payload?.hits || [];
  if (!Array.isArray(source)) return [];
  return source.map((item: any) => {
    const price = Number(item.price ?? item.base_price ?? item.min_price ?? 0);
    return {
      productId: String(item.product_id ?? item.productID ?? item.id ?? ''),
      title: String(item.title ?? item.name ?? '未命名商品'),
      brand: String(item.brand ?? ''),
      category: String(item.category ?? ''),
      subCategory: item.sub_category ?? item.subCategory,
      price,
      priceDisplay: String(item.price_display ?? item.price?.display ?? `¥${price}`),
      imageUrl: absoluteAssetUrl(item.image_url ?? item.imageURL ?? null),
    };
  }).filter(item => item.productId);
}

function normalizeAgentReply(body: any): AgentReply {
  const toolResult = body.tool_result || {};
  return {
    sessionId: String(body.session_id || ''),
    narrative: String(body.narrative || ''),
    decision: body.decision || {},
    toolResult,
    trace: body.trace || {},
    products: mapAgentProducts(toolResult.payload),
  };
}

function chatBody(input: ChatInput) {
  return {
    query: input.query,
    session_id: input.sessionId || undefined,
    user_id: input.userId || undefined,
    request_id: input.requestId || undefined,
    image_base64: input.imageBase64 || undefined,
    image_url: input.imageUrl || undefined,
  };
}

export async function chat(input: ChatInput): Promise<AgentReply> {
  const body = await agentJson('/chat', {
    method: 'POST', headers: agentHeaders, body: JSON.stringify(chatBody(input)),
  });
  return normalizeAgentReply(body);
}

export interface StreamEvent { event: string; data: any }

export function parseSSEFrame(frame: string): StreamEvent | null {
  let event = 'message';
  const data: string[] = [];
  frame.split(/\r?\n/).forEach(line => {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  });
  if (!data.length) return null;
  const raw = data.join('\n');
  try { return { event, data: JSON.parse(raw) }; }
  catch { return { event, data: raw }; }
}

/** Splits arbitrary network chunks into complete SSE frames. */
function frameReader(onFrame: (event: StreamEvent) => void) {
  let buffer = '';
  const emit = (frame: string) => {
    const parsed = parseSSEFrame(frame);
    if (parsed) onFrame(parsed);
  };
  return {
    push(text: string) {
      buffer += text;
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() || '';
      frames.forEach(emit);
    },
    flush() {
      if (buffer.trim()) emit(buffer);
      buffer = '';
    },
  };
}

type Transport = (
  url: string, body: string, onFrame: (event: StreamEvent) => void, signal: AbortSignal,
) => Promise<void>;

const isAbort = (error: any) => error?.name === 'AbortError';

const fetchTransport: Transport = async (url, body, onFrame, signal) => {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST', headers: { ...agentHeaders, Accept: 'text/event-stream' }, body, signal,
    });
  } catch (error) {
    if (isAbort(error)) throw error;
    throw new StreamInterruptedError('网络连接中断');
  }
  if (!response.ok) await readAgentResponse(response);
  const reader = (response.body as any)?.getReader?.();
  if (!reader) throw new StreamInterruptedError('当前环境无法读取流式响应');
  const decoder = new TextDecoder();
  const frames = frameReader(onFrame);
  try {
    while (true) {
      const { value, done } = await reader.read();
      frames.push(decoder.decode(value || new Uint8Array(), { stream: !done }));
      if (done) break;
    }
  } catch (error) {
    if (isAbort(error)) throw error;
    throw new StreamInterruptedError('流式响应中断');
  }
  frames.flush();
};

// React Native's fetch exposes no readable body, but its XMLHttpRequest updates
// responseText incrementally while a progress listener is attached.
const xhrTransport: Transport = (url, body, onFrame, signal) => new Promise((resolve, reject) => {
  const xhr = new XMLHttpRequest();
  const frames = frameReader(onFrame);
  const ok = () => xhr.status >= 200 && xhr.status < 300;
  let seen = 0;
  const drain = () => {
    const text = xhr.responseText || '';
    if (text.length > seen) {
      frames.push(text.slice(seen));
      seen = text.length;
    }
  };
  xhr.open('POST', url);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.setRequestHeader('Accept', 'text/event-stream');
  xhr.onprogress = () => { if (ok()) drain(); };
  xhr.onload = () => {
    if (ok()) {
      drain();
      frames.flush();
      resolve();
      return;
    }
    let parsed: any = {};
    try { parsed = JSON.parse(xhr.responseText || '{}'); } catch { /* keep the status message */ }
    reject(errorFromBody(xhr.status, parsed));
  };
  xhr.onerror = () => reject(new StreamInterruptedError('网络连接中断'));
  xhr.ontimeout = () => reject(new StreamInterruptedError('响应超时'));
  signal.addEventListener('abort', () => {
    xhr.abort();
    reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
  });
  xhr.send(body);
});

/**
 * Streams one turn. Rejects with StreamInterruptedError when the connection drops
 * before `done`, so callers can safely retry with the same request id.
 */
export async function chatStream(
  input: ChatInput,
  onEvent: (event: StreamEvent) => void,
  options: SendOptions = {},
): Promise<AgentReply> {
  const controller = new AbortController();
  let idleTimedOut = false;
  let idle: ReturnType<typeof setTimeout> | undefined;
  const resetIdle = () => {
    if (idle) clearTimeout(idle);
    idle = setTimeout(() => { idleTimedOut = true; controller.abort(); }, STREAM_IDLE_TIMEOUT_MS);
  };
  const forwardAbort = () => controller.abort();
  options.signal?.addEventListener('abort', forwardAbort);

  const state = {
    sessionId: input.sessionId || '', narrative: '', decision: {} as Record<string, unknown>,
    toolResult: {} as any, trace: {} as Record<string, unknown>, done: false, error: '',
  };
  const handle = (event: StreamEvent) => {
    if (state.done || state.error) return;
    resetIdle();
    onEvent(event);
    const data = event.data;
    if (event.event === 'session') state.sessionId = data?.session_id || state.sessionId;
    if (event.event === 'meta') {
      state.decision = data?.decision || state.decision;
      state.trace = data?.trace || state.trace;
    }
    if (event.event === 'tool_result') state.toolResult = data || state.toolResult;
    if (event.event === 'token') state.narrative += String(data ?? '');
    if (event.event === 'done') {
      state.done = true;
      if (typeof data?.narrative === 'string') state.narrative = data.narrative;
      state.trace = data?.trace || state.trace;
    }
    if (event.event === 'error') state.error = data?.message || '流式响应中断';
  };

  const transport = Platform.OS === 'web' ? fetchTransport : xhrTransport;
  resetIdle();
  try {
    await transport(`${AGENT_BASE_URL}/chat/stream`, JSON.stringify(chatBody(input)), handle, controller.signal);
  } catch (error) {
    if (idleTimedOut) throw new StreamInterruptedError('响应超时');
    throw error;
  } finally {
    if (idle) clearTimeout(idle);
    options.signal?.removeEventListener('abort', forwardAbort);
  }
  if (state.error) throw new AgentHttpError(state.error, 500, 'stream_error');
  if (!state.done) throw new StreamInterruptedError('流式响应提前结束');
  return normalizeAgentReply({
    session_id: state.sessionId, narrative: state.narrative, decision: state.decision,
    tool_result: state.toolResult, trace: state.trace,
  });
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Blocking request that waits while a duplicate of the same request is still running. */
export async function chatWithRetry(
  input: ChatInput,
  { retryDelayMs = 1200 }: SendOptions = {},
): Promise<AgentReply> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await chat(input);
    } catch (error) {
      const busy = error instanceof AgentHttpError && error.code === 'request_in_progress';
      if (!busy || attempt >= 5) throw error;
      await sleep(retryDelayMs);
    }
  }
}

/**
 * Sends a turn with streaming on every platform. If the stream drops, the same request
 * id is retried through /chat; the server replays the finished turn instead of running
 * it again, so a cart mutation is never applied twice.
 */
export async function sendChat(
  input: ChatInput,
  onEvent: (event: StreamEvent) => void,
  options: SendOptions = {},
): Promise<AgentReply> {
  const request = { ...input, requestId: input.requestId || newRequestId() };
  try {
    return await chatStream(request, onEvent, options);
  } catch (error) {
    if (!(error instanceof StreamInterruptedError)) throw readableError(error);
    return chatWithRetry(request, options);
  }
}

export const getProductDetail = async (productId: string) =>
  agentJson(`/products/${encodeURIComponent(productId)}`);

export const compareAgentProducts = async (productIds: string[], focus = '') =>
  agentJson('/compare', {
    method: 'POST', headers: agentHeaders,
    body: JSON.stringify({ product_ids: productIds, focus }),
  });

export const getCart = async () => agentJson('/cart');

export const mutateCart = async (payload: Record<string, unknown>) =>
  agentJson('/cart/mutate', {
    method: 'POST', headers: agentHeaders,
    body: JSON.stringify({ request_id: newRequestId(), ...payload }),
  });

export const getSuggestions = async (): Promise<{ categories: string[]; hot_searches: string[] }> =>
  agentJson('/suggestions');

export const getPreferences = async (userId: string) =>
  agentJson(`/preferences/${encodeURIComponent(userId)}`);

export const updatePreferences = async (userId: string, payload: Record<string, unknown>) =>
  agentJson(`/preferences/${encodeURIComponent(userId)}`, {
    method: 'PUT', headers: agentHeaders, body: JSON.stringify(payload),
  });

export const undoPreference = async (userId: string, undoToken: string) =>
  agentJson(`/preferences/${encodeURIComponent(userId)}/undo`, {
    method: 'POST', headers: agentHeaders, body: JSON.stringify({ undo_token: undoToken }),
  });

// ── AI 配置 API ──────────────────────────────────────────────

export interface AIConfigPayload {
  base_url: string;
  provider: string;
  model: string;
  api_key: string;
}

export interface AIConfigResponse {
  base_url: string;
  source: string;
  provider: string;
  model: string;
  key_set: boolean;
}

export interface ProvidersResponse {
  anthropic: string[];
  openai: string[];
  gemini: string[];
  doubao: string[];
}

export const getProviders = async (): Promise<ProvidersResponse> => {
  const response = await api.get<ProvidersResponse>('/providers');
  return response.data;
};

export const getAIConfig = async (): Promise<AIConfigResponse> => {
  const response = await api.get<AIConfigResponse>('/config');
  return response.data;
};

export const updateAIConfig = async (payload: AIConfigPayload): Promise<AIConfigResponse> => {
  const response = await api.post<AIConfigResponse>('/config', payload);
  return response.data;
};

export const testAIConfig = async (payload: AIConfigPayload): Promise<{ ok: boolean; message: string }> => {
  const response = await api.post('/config/test', payload, { timeout: 20000 });
  return response.data;
};
