# Drift — Cloudflare Pages Deployment Guide

This guide walks through configuring and deploying **Drift** to **Cloudflare Pages** for zero-latency edge delivery with full client-side WebAssembly SIMD multithreading and WebGPU acceleration.

---

## 1. Prerequisites

- **Node.js**: `>=18.0.0` (Node 20+ LTS recommended)
- **Package Manager**: `npm` (v9+)
- **Cloudflare Account**: [Cloudflare Dashboard](https://dash.cloudflare.com/)

---

## 2. Cloudflare Pages Build Settings

When connecting your Git repository (GitHub or GitLab) to Cloudflare Pages, configure the project with the following build settings:

| Setting | Value | Notes |
| :--- | :--- | :--- |
| **Framework preset** | `Vite` or `None` | Vite standard static output |
| **Build command** | `npm run build` | Runs `tsc && vite build` |
| **Build output directory** | `dist` | Contains HTML, CSS, JS bundles, and WASM assets |
| **Root directory** | `/` | Leave empty or set to repository root |

### Environment Variables
Configure the Node.js runtime version in the Cloudflare Pages project settings:

- Under **Settings > Environment variables > Production**:
  - `NODE_VERSION` = `20`

---

## 3. High-Performance WASM & WebGPU Headers (`_headers`)

Drift runs the **Depth Anything V2** neural model directly in the browser via `onnxruntime-web` with multithreaded WASM SIMD. This requires `SharedArrayBuffer`, which modern browsers strictly guard behind Cross-Origin Isolation headers.

A pre-configured `public/_headers` file is automatically copied to `dist/_headers` upon build:

```http
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  X-Content-Type-Options: nosniff

/assets/*.wasm
  Content-Type: application/wasm
  Cache-Control: public, max-age=31536000, immutable
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp

/assets/*.onnx
  Content-Type: application/octet-stream
  Cache-Control: public, max-age=31536000, immutable
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
```

### Why these headers are critical:
1. **`Cross-Origin-Opener-Policy: same-origin` (COOP)**: Isolates the browsing context so attacker windows cannot access the DOM or window references.
2. **`Cross-Origin-Embedder-Policy: require-corp` (COEP)**: Prevents the document from loading cross-origin resources that do not explicitly opt-in.
3. Together, COOP and COEP unlock `self.crossOriginIsolated === true`, enabling:
   - `SharedArrayBuffer` for 4-8x faster multi-threaded WASM SIMD inference.
   - High-precision performance timers (`performance.now()`).
   - WebGPU compute pipelines.

---

## 4. Local Testing with Preview Mode

Before deploying to production, test the exact production bundle and headers locally using Vite's preview server:

```bash
# 1. Run full type check and build
npm run build

# 2. Launch production preview server (configured with COOP & COEP headers)
npm run preview
```

Open `http://localhost:4173/` in Chrome or Edge and open DevTools Console (`F12`):
- Verify `crossOriginIsolated` outputs `true`:
  ```js
  console.log('Cross-origin isolated:', window.crossOriginIsolated);
  ```
- Verify Web Worker loads `ort-wasm-simd-threaded.wasm` without CORS or COEP warnings.

---

## 5. Direct Deployment via Wrangler CLI (Alternative)

If deploying directly from your terminal or CI/CD without Git integration:

```bash
# Install Wrangler globally or use npx
npx wrangler login

# Build application
npm run build

# Deploy dist directory to Cloudflare Pages
npx wrangler pages deploy dist --project-name=drift
```

---

## 6. Verification Checklist

- [x] Application loads fast from Cloudflare global edge CDN.
- [x] `_headers` verified in Network tab for both HTML document and static assets.
- [x] Multi-threaded WASM SIMD depth estimation executes smoothly without cross-origin errors.
- [x] Procedural depth fallback remains immediately available if model fails to download.
- [x] High-resolution PNG snapshot download triggers correctly.
- [x] Real-time WebM/MP4 canvas recording captures smooth particle loops.
- [x] Mobile touch targets (>= 44x44px) and safe-area padding function correctly on iOS and Android.
