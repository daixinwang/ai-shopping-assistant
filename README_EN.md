# AI Shopping Assistant

> [中文版本](./README.md)

An AI-powered shopping app that identifies products from photos, compares prices across platforms, and supports natural language filtering. The backend supports **Anthropic / OpenAI / Google Gemini** — switchable at runtime from the in-app settings screen.

## Interface preview

The interface pairs dark brown (`#1f1a14`) and warm paper (`#f0e6d2`) with editorial typography and SVG action buttons. These screenshots show the running app with a local demonstration catalog; product prices are demo data.

![Desktop home](docs/screenshots/home-desktop.png)

![Product recommendations and comparison selection](docs/screenshots/recommendations-desktop.png)

<p>
  <img src="docs/screenshots/home-mobile.png" alt="Mobile home" width="320" />
  <img src="docs/screenshots/sessions-mobile.png" alt="Mobile conversation history and session controls" width="320" />
</p>

Start a new conversation with independent context, or switch back through conversation history. Messages, product results, and session IDs are saved on the current device and restored when reopening the assistant.

## Architecture

```
┌──────────────────────────────────────┐
│       Frontend (React Native + Expo)  │
│  HomeScreen → CameraScreen           │
│  → RecognitionScreen → ProductList   │
│  SettingsScreen (Provider / Key)     │
└──────────────────┬───────────────────┘
                   │ HTTP/JSON
                   ↓
┌──────────────────────────────────────┐
│          Backend (FastAPI + Python)   │
├──────────────────────────────────────┤
│ Stage 1: VisionService               │
│   Image → Product attributes JSON    │
├──────────────────────────────────────┤
│ Stage 2: SuggestionService           │
│   Attributes → 4-5 suggestion cards  │
├──────────────────────────────────────┤
│ Stage 3: IntentService               │
│   Natural language → structured filter│
├──────────────────────────────────────┤
│ ProductService + MockProductRepo     │
│   Search / filter / sort (~130 SKUs) │
├──────────────────────────────────────┤
│ AIClientFactory (pluggable)          │
│   Unified interface for Anthropic /  │
│   OpenAI / Gemini — switch at runtime│
└──────────────────────────────────────┘
                   ↓
┌──────────────┐ ┌──────────┐ ┌────────┐
│  Anthropic   │ │  OpenAI  │ │ Gemini │
│  (Claude)    │ │  (GPT)   │ │        │
└──────────────┘ └──────────┘ └────────┘
```

## Tech Stack

### Backend
- **Framework**: FastAPI 0.115.5
- **AI (switchable)**: Anthropic Claude / OpenAI GPT / Google Gemini
- **Validation**: Pydantic 2.10.3
- **Tests**: pytest (23 unit tests)

### Frontend
- **Framework**: React Native 0.74.5 + Expo 51
- **Navigation**: React Navigation v6
- **Local storage**: AsyncStorage (persists AI config)
- **HTTP client**: Axios

### Supported AI Providers

| Provider | Recommended Model | Get Key |
|----------|------------------|---------|
| Anthropic | claude-3-5-sonnet-20241022 | [console.anthropic.com](https://console.anthropic.com) |
| OpenAI | gpt-4o | [platform.openai.com](https://platform.openai.com) |
| Google Gemini | gemini-1.5-pro | [aistudio.google.com](https://aistudio.google.com) |

## Quick Start

### Prerequisites
- Python 3.9+
- Node.js 16+
- API key from any supported provider

### Start Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

Server starts at `http://localhost:8000`. Swagger docs: `http://localhost:8000/docs`

> **Optional**: Pre-load a key via `backend/.env` with `ANTHROPIC_API_KEY=...`

### Start Frontend

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with **Expo Go** on your device, or press `i` / `a` for simulator.

## Configuring AI Provider

### Option 1: In-App Settings (Recommended)

Tap the **⚙️** icon on the home screen:
1. Select a provider (Anthropic / OpenAI / Gemini)
2. Enter your API key
3. Choose a model from the dropdown
4. Tap **Save & Test Connection**

Settings are persisted locally and restored automatically on next launch.

### Option 2: Backend `.env`

```bash
# backend/.env
ANTHROPIC_API_KEY=sk-ant-...
```

> `.env` is listed in `.gitignore` and will never be committed.

## Core Features

### 1. Photo Recognition
Capture or upload a product image → AI identifies category, brand, color, style, and key features.

### 2. Smart Suggestion Cards
Dynamically generated cards guide the purchase decision:
- "Lowest Price First"
- "Official Flagship Only"
- "Top Rated"
- "Best Sellers"

### 3. Cross-Platform Price Comparison
Aggregates prices from Tmall, JD, and Pinduoduo. Displays the lowest price and per-platform breakdown on each product card.

### 4. Natural Language Filtering
Type queries like *"under ¥500, black, rated 4.8+"* — the AI parses intent into structured filters and refreshes the product list in real time (800ms debounce).

### 5. Attribute Correction
Tap any recognized attribute (brand, color, style) to correct it, triggering a new search.

## Project Structure

```
.
├── README.md
├── README_EN.md
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   ├── api/v1/
│   │   ├── identify.py           # POST /identify
│   │   ├── products.py           # POST /products/search
│   │   ├── filter.py             # POST /filter
│   │   └── config.py             # POST/GET /config, GET /providers
│   ├── services/
│   │   ├── ai_config.py          # Runtime provider config singleton
│   │   ├── ai_client_factory.py  # Multi-provider factory
│   │   ├── vision_service.py
│   │   ├── suggestion_service.py
│   │   ├── intent_service.py
│   │   ├── product_service.py
│   │   └── session_store.py
│   ├── models/                   # Pydantic schemas
│   ├── repository/               # Data access layer
│   ├── data/mock_products.json   # 130 mock SKUs across 5 categories
│   └── tests/                    # 23 unit tests
└── mobile/
    ├── App.tsx                   # Restores AI config on startup
    ├── src/
    │   ├── screens/
    │   │   ├── HomeScreen.tsx
    │   │   ├── CameraScreen.tsx
    │   │   ├── RecognitionScreen.tsx
    │   │   ├── ProductListScreen.tsx
    │   │   └── SettingsScreen.tsx  # AI provider settings
    │   ├── components/
    │   │   ├── ProductCard.tsx
    │   │   └── NLFilterBar.tsx
    │   └── api/client.ts
    └── package.json
```

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/identify` | Upload image → recognition + suggestions + products |
| `POST` | `/api/v1/products/search` | Filter products by structured params |
| `POST` | `/api/v1/filter` | Natural language → filtered product list |
| `POST` | `/api/v1/config` | Set AI provider / model / API key |
| `GET`  | `/api/v1/config` | Get current AI config (key masked) |
| `GET`  | `/api/v1/providers` | List supported providers and models |
| `GET`  | `/api/v1/health` | Health check |

Full interactive docs: `http://localhost:8000/docs`

## Tests

```bash
cd backend && python3 -m pytest tests/ -v
# 23 passed
```

Coverage: `AIConfig` singleton, `AIClientFactory` provider routing, `ProductService` filter/sort, `SessionStore` TTL, `IntentService` NL parsing (with mocks).

## Troubleshooting

**Backend won't start** — Run `uvicorn main:app --reload` from the `backend/` directory.

**"Unknown product" on recognition** — Check that a valid API key is configured in the Settings screen.

**Can't connect from physical device** — Replace `localhost` with your LAN IP in `mobile/src/api/client.ts`.

**Settings save fails** — Ensure the backend is running and the API key format is correct (Anthropic: `sk-ant-...`, OpenAI: `sk-...`).

**Expo cache issues** — Run `npx expo start --clear`.

## License

MIT

## Resources

- [FastAPI Docs](https://fastapi.tiangolo.com/)
- [React Native Docs](https://reactnative.dev/)
- [Expo Docs](https://docs.expo.dev/)
- [Anthropic API](https://docs.anthropic.com/)
- [OpenAI API](https://platform.openai.com/docs/)
- [Google Gemini API](https://ai.google.dev/)
