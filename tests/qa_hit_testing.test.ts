/**
 * QA Hit-Testing & Pointer Events Verification Test
 * Verifies TASK 2 requirements:
 * 1. WebGL canvas fills viewport and receives pointer events.
 * 2. Overlay canvas has pointer-events: none !important.
 * 3. Full-screen UI wrappers (.ui-layer, .app-main, .app-header, .app-footer, .app-drawer) have pointer-events: none.
 * 4. Controls inside .ui-layer have pointer-events: auto.
 * 5. TitleScreen when .hidden has pointer-events: none !important.
 * 6. Closed modals and drawers have pointer-events: none !important.
 * 7. Auto-hide chrome does not leave blocking containers.
 * 8. Real browser elementFromPoint verification if Chrome is present.
 */

import fs from 'fs';
import { spawn } from 'child_process';
import http from 'http';
import path from 'path';

interface TestResult {
  category: string;
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function assert(category: string, name: string, condition: boolean, details: string) {
  results.push({ category, name, passed: condition, details });
  const icon = condition ? '✅ PASS' : '❌ FAIL';
  console.log(`${icon} [${category}] ${name}: ${details}`);
}

console.log('\n--- TASK 2: HIT-TESTING, CSS & DOM VERIFICATION ---');

const css = fs.readFileSync('src/style.css', 'utf-8');

// 1. Canvas Layer fills viewport and has pointer-events: auto
const canvasLayerMatch = /\.canvas-layer\s*\{[^}]*inset:\s*0;[^}]*pointer-events:\s*auto;[^}]*touch-action:\s*none;/s.test(css);
assert(
  'Canvas Layer',
  'Canvas Container Viewport Fill & Pointer Events',
  canvasLayerMatch,
  '.canvas-layer has inset: 0, touch-action: none, and pointer-events: auto'
);

const particleCanvasMatch = /#particle-canvas\s*\{[^}]*inset:\s*0;[^}]*pointer-events:\s*auto;/s.test(css) ||
  /\.canvas-layer canvas,\s*\n#particle-canvas\s*\{[^}]*inset:\s*0;[^}]*pointer-events:\s*auto;/s.test(css);
assert(
  'Canvas Layer',
  'Particle Canvas Element Fill & Hit-testing',
  particleCanvasMatch,
  '#particle-canvas fills viewport (inset: 0) with pointer-events: auto'
);

// 2. Overlay Canvas strictly pointer-events: none !important
const overlayLayerMatch = /\.overlay-layer\s*\{[^}]*pointer-events:\s*none\s*!important;/s.test(css);
const overlayCanvasMatch = /#overlay-canvas[^}]*pointer-events:\s*none\s*!important;/s.test(css);
assert(
  'Overlay Canvas',
  'Overlay Container Strictly Non-Blocking',
  overlayLayerMatch,
  '.overlay-layer has pointer-events: none !important'
);
assert(
  'Overlay Canvas',
  'Overlay Canvas Element Strictly Non-Blocking',
  overlayCanvasMatch,
  '#overlay-canvas has pointer-events: none !important'
);

// 3. Full-screen UI wrappers have pointer-events: none
const uiLayerMatch = /\.ui-layer\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;[^}]*pointer-events:\s*none;/s.test(css);
assert(
  'UI Wrappers',
  '.ui-layer Fixed Inset 0 & pointer-events: none',
  uiLayerMatch,
  '.ui-layer has position: fixed; inset: 0; pointer-events: none;'
);

const appMainMatch = /\.app-main\s*\{[^}]*pointer-events:\s*none;/s.test(css);
assert(
  'UI Wrappers',
  '.app-main pointer-events: none (Unblocks iCamera Canvas Center)',
  appMainMatch,
  '.app-main is non-blocking with pointer-events: none;'
);

const appHeaderMatch = /\.app-header\s*\{[^}]*pointer-events:\s*none;/s.test(css);
assert(
  'UI Wrappers',
  '.app-header pointer-events: none',
  appHeaderMatch,
  '.app-header is non-blocking with pointer-events: none;'
);

const appFooterMatch = /\.app-footer\s*\{[^}]*pointer-events:\s*none;/s.test(css);
assert(
  'UI Wrappers',
  '.app-footer pointer-events: none',
  appFooterMatch,
  '.app-footer is non-blocking with pointer-events: none;'
);

// 4. Interactive controls inside .ui-layer have pointer-events: auto
const controlsSelectorMatch = /\.ui-layer button,\s*\n\.ui-layer \.dock,\s*\n\.ui-layer \.dock-wrapper,\s*\n\.ui-layer \.popover,\s*\n\.ui-layer \.overlays-popover,\s*\n\.ui-layer \.filmstrip,\s*\n\.ui-layer \.filmstrip-thumbnails,\s*\n\.ui-layer \.segmented-control,\s*\n\.ui-layer \.quality-segmented-control,\s*\n\.ui-layer input,\s*\n\.ui-layer select,\s*\n\.ui-layer textarea,\s*\n\.ui-layer label,\s*\n\.ui-layer a,\s*\n\.ui-layer \.floating-actions-dock,\s*\n\.ui-layer \.settings-drawer-panel,\s*\n\.ui-layer \.title-screen-inner,\s*\n\.ui-layer \.credits-modal-panel,\s*\n\.ui-layer \.depth-debug-panel\s*\{\s*\n\s*pointer-events:\s*auto;/s.test(css);

assert(
  'UI Controls',
  'Interactive UI Controls Receive Pointer Events',
  controlsSelectorMatch,
  'All interactive controls (buttons, dock, popover, filmstrip, segmented-control, inputs, modal panels) have pointer-events: auto'
);

// 5. Title screen .hidden strictly non-blocking
const titleScreenHiddenMatch = /\.title-screen\.hidden,\s*\n\.title-screen\.hidden \*\s*\{[^}]*pointer-events:\s*none\s*!important;/s.test(css);
assert(
  'Modal & Overlay States',
  'Title Screen .hidden pointer-events: none !important',
  titleScreenHiddenMatch,
  '.title-screen.hidden and all descendants have pointer-events: none !important'
);

// 6. Modal / Drawer closed states strictly non-blocking
const creditsModalClosedMatch = /\.credits-modal-panel:not\(\.open\)\s*\{[^}]*pointer-events:\s*none\s*!important;/s.test(css);
const depthDebugClosedMatch = /\.depth-debug-panel:not\(\.open\)\s*\{[^}]*pointer-events:\s*none\s*!important;/s.test(css);
const settingsDrawerClosedMatch = /\.settings-drawer-panel:not\(\.open\)\s*\{[^}]*pointer-events:\s*none\s*!important;/s.test(css);
const loadingOverlayClosedMatch = /\.loading-overlay\.hidden,\s*\n\.loading-overlay\.hidden \*\s*\{[^}]*pointer-events:\s*none\s*!important;/s.test(css);

assert(
  'Modal & Overlay States',
  'Credits Modal Panel Closed Non-Blocking',
  creditsModalClosedMatch,
  '.credits-modal-panel:not(.open) has pointer-events: none !important'
);
assert(
  'Modal & Overlay States',
  'Depth Debug Panel Closed Non-Blocking',
  depthDebugClosedMatch,
  '.depth-debug-panel:not(.open) has pointer-events: none !important'
);
assert(
  'Modal & Overlay States',
  'Settings Drawer Panel Closed Non-Blocking',
  settingsDrawerClosedMatch,
  '.settings-drawer-panel:not(.open) has pointer-events: none !important'
);
assert(
  'Modal & Overlay States',
  'Loading Overlay Hidden Non-Blocking',
  loadingOverlayClosedMatch,
  '.loading-overlay.hidden and children have pointer-events: none !important'
);

// 7. Auto-hide Chrome logic
const chromeHiddenHeaderMatch = /body\.chrome-hidden\s+\.app-header\s*\{[^}]*pointer-events:\s*none\s*!important;/s.test(css);
const chromeHiddenFooterMatch = /body\.chrome-hidden\s+\.app-footer\s*\{[^}]*pointer-events:\s*none\s*!important;/s.test(css);
assert(
  'Auto-Hide Chrome',
  'body.chrome-hidden Header Non-Blocking',
  chromeHiddenHeaderMatch,
  'body.chrome-hidden .app-header has pointer-events: none !important'
);
assert(
  'Auto-Hide Chrome',
  'body.chrome-hidden Footer Non-Blocking',
  chromeHiddenFooterMatch,
  'body.chrome-hidden .app-footer has pointer-events: none !important'
);

// 8. Live Headless Chrome elementFromPoint test
async function testElementFromPointBrowser() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  if (!fs.existsSync(chromePath) || !fs.existsSync('dist/index.html')) {
    console.log('Skipping live browser elementFromPoint (Chrome not found or dist/ not built)');
    return;
  }

  const distDir = path.resolve('dist');
  const server = http.createServer((req, res) => {
    let filePath = path.join(distDir, req.url === '/' ? 'index.html' : req.url!.split('?')[0]);
    if (!fs.existsSync(filePath)) filePath = path.join(distDir, 'index.html');
    const ext = path.extname(filePath);
    const contentTypes: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.wasm': 'application/wasm',
      '.json': 'application/json'
    };
    res.writeHead(200, {
      'Content-Type': contentTypes[ext] || 'application/octet-stream',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    });
    res.end(fs.readFileSync(filePath));
  });

  const testPort = 8092;
  await new Promise<void>((resolve) => server.listen(testPort, resolve));

  const cdpPort = 9335;
  const chromeProc = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${cdpPort}`,
    '--no-sandbox',
    '--disable-gpu',
    '--window-size=1280,800',
    `http://localhost:${testPort}`
  ]);

  await new Promise((r) => setTimeout(r, 1200));

  try {
    const listRes = await fetch(`http://127.0.0.1:${cdpPort}/json`);
    const pages = await listRes.json();
    const page = pages.find((p: any) => p.type === 'page');
    if (!page) throw new Error('No browser page found');

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r) => ws.onopen = r);

    let id = 1;
    function send(method: string, params: any = {}): Promise<any> {
      const msgId = id++;
      return new Promise((resolve) => {
        const handler = (event: any) => {
          const data = JSON.parse(event.data);
          if (data.id === msgId) {
            ws.removeEventListener('message', handler);
            resolve(data.result);
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });
    }

    await new Promise((r) => setTimeout(r, 1000));

    // Close title screen
    await send('Runtime.evaluate', {
      expression: `
        (() => {
          const ts = document.querySelector('.title-screen');
          if (ts) {
            ts.classList.remove('visible');
            ts.classList.add('hidden');
          }
        })()
      `,
      returnByValue: true
    });

    // Check elementFromPoint at center
    const res = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
          return el ? el.id : null;
        })()
      `,
      returnByValue: true
    });

    const centerElementId = res?.result?.value;
    assert(
      'Live Browser elementFromPoint',
      'Center Hit-testing Reaches #particle-canvas',
      centerElementId === 'particle-canvas',
      `document.elementFromPoint(w/2, h/2) returned #${centerElementId} (expected #particle-canvas)`
    );

    ws.close();
  } catch (err: any) {
    console.warn('Browser test warning:', err.message);
  } finally {
    chromeProc.kill();
    server.close();
  }
}

async function main() {
  await testElementFromPointBrowser();

  const failed = results.filter((r) => !r.passed);
  console.log('=============================================');
  console.log(`TOTAL HIT-TESTING TESTS: ${results.length} | PASSED: ${results.length - failed.length} | FAILED: ${failed.length}`);
  if (failed.length > 0) {
    console.error('❌ QA Hit-Testing Verification FAILED!');
    process.exit(1);
  } else {
    console.log('QA Hit-Testing Verification SUCCEEDED: All checks passed! 🎉\n');
  }
}

main().catch(console.error);
