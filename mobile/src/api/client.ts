import axios from 'axios';

// 开发环境后端地址：本地测试用 localhost，真机需要改为局域网 IP
const BASE_URL = 'http://localhost:8000/api/v1';

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

// ── AI 配置 API ──────────────────────────────────────────────

export interface AIConfigPayload {
  provider: string;
  model: string;
  api_key: string;
}

export interface AIConfigResponse {
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
