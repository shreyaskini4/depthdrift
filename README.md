# Drift — Generative Particle Depth Canvas

> Browser-only generative particle art tool driven by client-side depth estimation.

Drift transforms user-uploaded still imagery into organic, 3D point cloud particle sculptures with client-side monocular depth estimation, dynamic motion vector fields, and technical HUD overlays.

---

## 🏛️ Architecture Overview

```
src/
├── types.ts          # Central TypeScript interfaces and type contracts
├── main.ts           # Application entry point & bootstrap lifecycle
├── style.css         # Dark theme (#050506), safe-area insets, reset & typography
├── depth/            # ONNX Runtime Web client-side depth estimation worker
├── engine/           # Three.js WebGL particle engine (50k - 200k points)
├── modes/            # Motion behavior implementations (DRIFT, SPLASH, GATHER, DEPTH, etc.)
├── overlays/         # 2D HUD overlays (trackers, links, scanlines, trails, markings)
├── ui/               # Minimalist floating controls, drawer, gestures, and state management
└── export/           # High-resolution canvas snapshot and video recording pipeline
```

### Core Technologies
- **Vite 5 + TypeScript 5**: High-speed ES module development and bundling.
- **Three.js**: GPU particle rendering, custom shaders, and 3D camera controls.
- **onnxruntime-web**: Client-side depth estimation using lightweight ONNX neural models in dedicated Web Workers.
- **Manrope & Noto Serif TC**: Distinctive typographic identity for technical elegance.

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ (tested on Node 20+)
- Modern browser with WebGL2 support (Chrome, Edge, Firefox, Safari)

### Installation
```bash
npm install
```

### Development Server
```bash
npm run dev
```
Starts Vite local dev server with COOP/COEP isolation headers configured for WebAssembly / Web Workers.

### Production Build
```bash
npm run build
```
Executes TypeScript type-checking (`tsc`) followed by Vite production bundle output in `dist/`.

### Preview Production Build
```bash
npm run preview
```

### Code Quality
```bash
npm run lint    # ESLint TypeScript source inspection
npm run format  # Prettier code formatting
```
