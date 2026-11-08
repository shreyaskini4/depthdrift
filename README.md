# Drift — Generative Particle Depth Canvas

> Browser-only generative particle art tool driven by client-side depth estimation.

Drift transforms user-uploaded still imagery into organic, 3D point cloud particle sculptures with client-side monocular depth estimation, dynamic motion vector fields, and technical HUD overlays.

---

## Architecture Overview

```
src/
├── types.ts          # Central TypeScript interfaces and type contracts
├── main.ts           # Application entry point & bootstrap lifecycle
├── style.css         # Dark theme (#050506), safe-area insets, reset & typography
├── depth/            # ONNX Runtime Web client-side depth estimation worker
├── engine/           # Three.js WebGL particle engine (50k - 600k points)
├── modes/            # Motion behavior implementations (DRIFT, SPLASH, GATHER, DEPTH, etc.)
├── overlays/         # 2D HUD overlays (trackers, links, scanlines, trails, markings, crop marks)
├── ui/               # Minimalist floating controls, drawer, gestures, and state management
└── export/           # High-resolution canvas snapshot and video recording pipeline
```

### Core Technologies
- **Vite 5 + TypeScript 5**: High-speed ES module development and bundling.
- **Three.js**: GPU particle rendering, custom GLSL shaders, camera framing, and supersampling.
- **onnxruntime-web**: Client-side depth estimation using lightweight ONNX neural models in dedicated Web Workers.
- **Manrope & Noto Serif TC**: Distinctive typographic identity for technical elegance.

---

## Features

- **Client-Side Neural Depth Estimation**: Depth Anything V2 Small ONNX running in a dedicated Web Worker with WebGPU and WASM fallback.
- **High-Capacity Particle Engine**: Up to 600,000 particles with bilinear color sampling, tone-weighted importance CDF distribution, and adaptive framerate regulation.
- **7 Motion Modes**: DRIFT, SPLASH, GATHER, DEPTH, TRAVEL, SWARM, and MELT with smooth transition blending and near-plane fade curves.
- **Interactive Navigation**: Cursor-anchored zooming (0.5x to 12x), bounded panning, two-finger pinch, double-click zoom, and touch gesture recognition.
- **Minimal HUD & Technical Overlays**: Camera-projected trackers, dynamic crop marks, links, scan planes, motion trails, and freehand attractors.
- **Media Export**: Snapshot export and WebM video recording directly from the canvas.

---

## Getting Started

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
Starts the Vite local dev server with COOP/COEP isolation headers configured for WebAssembly and Web Workers.

### Production Build
```bash
npm run build
```
Executes TypeScript type checking (`tsc`) followed by the Vite production bundle output in `dist/`.

### Preview Production Build
```bash
npm run preview
```

### Code Quality
```bash
npm run lint    # ESLint TypeScript source inspection
npm run format  # Prettier code formatting
```
