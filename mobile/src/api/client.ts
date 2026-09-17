import axios from 'axios';
import { Platform } from 'react-native';

const defaultHost = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
export const AGENT_BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL || `http://${defaultHost}:8000`
).replace(/\/$/, '');
const BASE_URL = `${AGENT_BASE_URL}/api/v1`;

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
}

const agentHeaders = { Accept: 'application/json', 'Content-Type': 'application/json' };
const AGENT_TIMEOUT_MS = Number(process.env.EXPO_PUBLIC_API_TIMEOUT_MS || 30000);

function timeoutError(error: any): Error {
  return error?.name === 'AbortError' ? new Error('请求超时，请检查网络后重试') : error;
}

async function readAgentResponse(response: Response): Promise<any> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof body?.detail === 'string'
      ? body.detail
      : body?.detail?.message || body?.error?.message || `请求失败（${response.status}）`;
    throw new Error(detail);
  }
  return body;
}

async function agentJson(path: string, init: RequestInit = {}): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AGENT_TIMEOUT_MS);
  try {
    const response = await fetch(`${AGENT_BASE_URL}${path}`, { ...init, signal: controller.signal });
    return await readAgentResponse(response);
  } catch (error) {
    throw timeoutError(error);
  } finally {
    clearTimeout(timer);
  }
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
      imageUrl: (() => {
        const value = item.image_url ?? item.imageURL ?? null;
        return typeof value === 'string' && value.startsWith('/')
          ? `${AGENT_BASE_URL}${value}`
          : value;
      })(),
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

export async function chatStream(
  input: ChatInput,
  onEvent: (event: StreamEvent) => void,
): Promise<AgentReply> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AGENT_TIMEOUT_MS);
  try {
    const response = await fetch(`${AGENT_BASE_URL}/chat/stream`, {
      method: 'POST', headers: { ...agentHeaders, Accept: 'text/event-stream' },
      body: JSON.stringify(chatBody(input)), signal: controller.signal,
    });
    if (!response.ok) await readAgentResponse(response);
    const reader = (response.body as any)?.getReader?.();
    if (!reader) throw new Error('当前环境不支持 SSE 流式读取，请使用普通对话请求');

    const decoder = new TextDecoder();
    let buffer = '';
    let sessionId = input.sessionId || '';
    let narrative = '';
    let decision: Record<string, unknown> = {};
    let toolResult: any = {};
    let trace: Record<string, unknown> = {};
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() || '';
      for (const frame of frames) {
        const parsed = parseSSEFrame(frame);
        if (!parsed) continue;
        onEvent(parsed);
        if (parsed.event === 'session') sessionId = parsed.data?.session_id || sessionId;
        if (parsed.event === 'meta') {
          decision = parsed.data?.decision || decision;
          trace = parsed.data?.trace || trace;
        }
        if (parsed.event === 'tool_result') toolResult = parsed.data || toolResult;
        if (parsed.event === 'token') narrative += String(parsed.data || '');
        if (parsed.event === 'done' && parsed.data?.narrative) narrative = parsed.data.narrative;
        if (parsed.event === 'error') throw new Error(parsed.data?.message || '流式响应中断');
      }
      if (done) break;
    }
    return normalizeAgentReply({ session_id: sessionId, narrative, decision, tool_result: toolResult, trace });
  } catch (error) {
    throw timeoutError(error);
  } finally {
    clearTimeout(timer);
  }
}

export function chatWithFallback(
  input: ChatInput,
  onEvent: (event: StreamEvent) => void,
): Promise<AgentReply> {
  // React Native fetch does not consistently expose a ReadableStream. Selecting /chat
  // before dispatch avoids replaying a cart mutation after an already-executed SSE call.
  return Platform.OS === 'web' ? chatStream(input, onEvent) : chat(input);
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
    method: 'POST', headers: agentHeaders, body: JSON.stringify(payload),
  });

export const getPreferences = async (userId: string) =>
  agentJson(`/preferences/${encodeURIComponent(userId)}`);

export const updatePreferences = async (userId: string, payload: Record<string, unknown>) =>
  agentJson(`/preferences/${encodeURIComponent(userId)}`, {
    method: 'PUT', headers: agentHeaders, body: JSON.stringify(payload),
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
