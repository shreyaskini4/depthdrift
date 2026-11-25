import fs from 'fs';
import path from 'path';
import http from 'http';
import { spawn } from 'child_process';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const distDir = path.resolve('dist');

const mimeTypes: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

interface ViewportSpec {
  width: number;
  height: number;
  name: string;
}

const viewports: ViewportSpec[] = [
  { width: 1920, height: 917, name: '1920x917 (Wide Desktop)' },
  { width: 1366, height: 768, name: '1366x768 (Standard Laptop)' },
  { width: 390, height: 844, name: '390x844 (Mobile)' },
];

const imagesToTest = [
  { name: 'Wide (16:9)', width: 1600, height: 900, aspect: 1600 / 900 },
  { name: 'Portrait (9:16)', width: 900, height: 1600, aspect: 900 / 1600 },
  { name: 'Square (1:1)', width: 1000, height: 1000, aspect: 1.0 },
];

async function runVerification() {
  const testPort = 8788;
  const server = http.createServer((req, res) => {
    let reqPath = req.url?.split('?')[0] || '/';
    if (reqPath === '/') reqPath = '/index.html';
    const filePath = path.join(distDir, reqPath);

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
      const ext = path.extname(filePath);
      res.writeHead(200, {
        'Content-Type': mimeTypes[ext] || 'application/octet-stream',
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      });
      res.end(data);
    });
  });

  await new Promise<void>((resolve) => server.listen(testPort, resolve));

  console.log('================================================================');
  console.log('TASK 1 VERIFICATION: CENTERING, DIAGNOSTICS & CROSSHAIR TEST');
  console.log('================================================================');

  let allPassed = true;

  for (const vp of viewports) {
    console.log(`\n>>> VIEWPORT: ${vp.name} (${vp.width}x${vp.height}) <<<`);
    const cdpPort = 9550 + Math.floor(Math.random() * 100);
    const chromeProc = spawn(chromePath, [
      '--headless=new',
      `--remote-debugging-port=${cdpPort}`,
      '--no-sandbox',
      '--disable-gpu',
      `--window-size=${vp.width},${vp.height}`,
      `http://localhost:${testPort}/?debug`,
    ]);

    await new Promise((r) => setTimeout(r, 1400));

    try {
      const listRes = await fetch(`http://127.0.0.1:${cdpPort}/json`);
      const pages = await listRes.json();
      const page = pages.find((p: any) => p.type === 'page');
      if (!page) throw new Error('No browser page found');

      const ws = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise((r) => (ws.onopen = r));

      let msgCounter = 1;
      function send(method: string, params: any = {}): Promise<any> {
        const msgId = msgCounter++;
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

      await send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 1,
        mobile: vp.width < 500,
      });

      await new Promise((r) => setTimeout(r, 400));

      // Dismiss title screen
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
        returnByValue: true,
      });

      await new Promise((r) => setTimeout(r, 200));

      // 1. Initial State Check
      const initMetrics = await send('Runtime.evaluate', {
        expression: `
          (() => {
            const engine = window.driftEngine;
            const canvas = document.getElementById('particle-canvas');
            const rect = canvas.getBoundingClientRect();
            const diag = engine.getCenteringDiagnostics();
            return {
              canvasRect: rect,
              canvasVsWindow: {
                dx: (rect.left + rect.width / 2) - window.innerWidth / 2,
                dy: (rect.top + rect.height / 2) - window.innerHeight / 2,
              },
              engineVsCanvasSize: {
                widthDiff: diag.engineSize.width - rect.width,
                heightDiff: diag.engineSize.height - rect.height,
              },
              rendererDomElementDividedByDpr: diag.rendererDomElementDividedByDpr,
              measureImageCenter: diag.imageCenter,
              cameraPosition: diag.cameraPosition,
              lookAtTarget: diag.lookAtTarget,
              pan: diag.pan,
              pointerState: diag.pointerState,
              pointerNormalized: {
                px: diag.pointerState.x / diag.engineSize.width - 0.5,
                py: diag.pointerState.y / diag.engineSize.height - 0.5,
              },
              hasPointerMoved: diag.hasPointerMoved,
              centerOnContent: diag.centerOnContent
            };
          })()
        `,
        returnByValue: true,
      });

      const init = initMetrics.result.value;
      console.log('Initial Canvas vs Window Offset:', init.canvasVsWindow);
      console.log('Engine Size vs Canvas Rect Diff:', init.engineVsCanvasSize);
      console.log('Initial Pointer State:', init.pointerState);
      console.log('Initial Pointer Normalized (px, py):', init.pointerNormalized);
      console.log('Initial measureImageCenter:', init.measureImageCenter);

      const caseA_pass = Math.abs(init.canvasVsWindow.dx) < 0.1 && Math.abs(init.canvasVsWindow.dy) < 0.1;
      const caseB_pass = Math.abs(init.engineVsCanvasSize.widthDiff) < 0.1 && Math.abs(init.engineVsCanvasSize.heightDiff) < 0.1;
      const caseC_pass = Math.abs(init.pointerNormalized.px) < 0.01 && Math.abs(init.pointerNormalized.py) < 0.01;

      console.log(`[Case A Canvas Centered]: ${caseA_pass ? 'PASSED' : 'FAILED'}`);
      console.log(`[Case B Engine Size Matches Canvas]: ${caseB_pass ? 'PASSED' : 'FAILED'}`);
      console.log(`[Case C Pointer Initialized at Canvas Center (no resting parallax)]: ${caseC_pass ? 'PASSED' : 'FAILED'}`);

      if (!caseA_pass || !caseB_pass || !caseC_pass) allPassed = false;

      // 2. Test 3 Images (Wide, Portrait, Square) with centerOnContent = true and centerOnContent = false
      for (const imgSpec of imagesToTest) {
        console.log(`\n  --- Testing image: ${imgSpec.name} (${imgSpec.width}x${imgSpec.height}, aspect=${imgSpec.aspect.toFixed(3)}) ---`);

        const testRes = await send('Runtime.evaluate', {
          expression: `
            (async () => {
              const engine = window.driftEngine;
              const canvas = document.createElement('canvas');
              canvas.width = ${imgSpec.width};
              canvas.height = ${imgSpec.height};
              const ctx = canvas.getContext('2d');
              
              // Draw an asymmetric subject on the right side to test contentCenter
              ctx.fillStyle = '#050505';
              ctx.fillRect(0, 0, ${imgSpec.width}, ${imgSpec.height});
              ctx.fillStyle = '#ffffff';
              // Subject in right-third
              ctx.fillRect(${imgSpec.width} * 0.65, ${imgSpec.height} * 0.3, ${imgSpec.width} * 0.25, ${imgSpec.height} * 0.4);

              const depthData = new Float32Array(${imgSpec.width} * ${imgSpec.height});
              for (let i = 0; i < depthData.length; i++) depthData[i] = 0.5;

              const depthResult = {
                width: ${imgSpec.width},
                height: ${imgSpec.height},
                data: depthData,
                provider: 'heuristic',
                source: 'heuristic'
              };

              // 1. Load image with centerOnContent: true (default)
              engine.setSettings({ centerOnContent: true });
              engine.setImage(canvas, depthResult);
              await new Promise(r => setTimeout(r, 100));
              const diagWithContentCenter = engine.getCenteringDiagnostics();

              // 2. Test resetView() returns to same content-centred state
              engine.panByPixels(50, 40);
              engine.orbitByPixels(10, -5);
              engine.setZoom(1.8);
              await new Promise(r => setTimeout(r, 60));
              engine.resetView();
              await new Promise(r => setTimeout(r, 150));
              const diagAfterReset = engine.getCenteringDiagnostics();

              // 3. Test clicking zoom percentage button in floating dock returns to same state
              engine.setZoom(2.2);
              await new Promise(r => setTimeout(r, 60));
              const zoomValText = document.querySelector('.zoom-val-text');
              if (zoomValText) zoomValText.click();
              await new Promise(r => setTimeout(r, 150));
              const diagAfterZoomTextClick = engine.getCenteringDiagnostics();

              // 4. Toggle centerOnContent: false -> centered on (0, 0)
              engine.setSettings({ centerOnContent: false });
              engine.resetView();
              await new Promise(r => setTimeout(r, 150));
              const diagZeroCenter = engine.getCenteringDiagnostics();

              return {
                imageAspect: diagWithContentCenter.imageCenter ? engine.imageAspect : 0,
                contentCenter: diagWithContentCenter.contentCenter,
                panWithContent: diagWithContentCenter.pan,
                panAfterReset: diagAfterReset.pan,
                panAfterZoomTextClick: diagAfterZoomTextClick.pan,
                zeroCenterPan: diagZeroCenter.pan,
                zeroCenterImageCenter: diagZeroCenter.imageCenter,
                lookAtWithContent: diagWithContentCenter.lookAtTarget,
                lookAtZero: diagZeroCenter.lookAtTarget,
              };
            })()
          `,
          awaitPromise: true,
          returnByValue: true,
        });

        const r = testRes.result.value;
        console.log('    Computed contentCenter:', r.contentCenter);
        console.log('    Pan with content centering:', r.panWithContent);
        console.log('    Pan after resetView():', r.panAfterReset);
        console.log('    Pan after zoom percentage click:', r.panAfterZoomTextClick);
        console.log('    Pan with centerOnContent = false:', r.zeroCenterPan);
        console.log('    measureImageCenter with centerOnContent = false (cx, cy):', r.zeroCenterImageCenter);

        const contentPanOk = Math.abs(r.panWithContent.panTX - r.panAfterReset.panTX) < 0.05 &&
                             Math.abs(r.panWithContent.panTX - r.panAfterZoomTextClick.panTX) < 0.05;
        const zeroCenterOk = Math.abs(r.zeroCenterPan.panTX) < 0.01 && Math.abs(r.zeroCenterPan.panTY) < 0.01 &&
                             Math.abs(r.zeroCenterImageCenter.cx) < 0.001 && Math.abs(r.zeroCenterImageCenter.cy) < 0.001;

        console.log(`    [Reset and Zoom Button Return to Centred State]: ${contentPanOk ? 'PASSED' : 'FAILED'}`);
        console.log(`    [CenterOnContent False Centers at (0, 0)]: ${zeroCenterOk ? 'PASSED' : 'FAILED'}`);

        if (!contentPanOk || !zeroCenterOk) allPassed = false;
      }

      // 3. Check Permanent ?debug Crosshair
      const crosshairCheck = await send('Runtime.evaluate', {
        expression: `
          (() => {
            const overlayCanvas = document.getElementById('overlay-canvas');
            const ctx = overlayCanvas.getContext('2d');
            const w = overlayCanvas.width;
            const h = overlayCanvas.height;
            // The overlay renderer has drawn the debug crosshair at canvas center
            // Check pixels around center (w/2, h/2)
            const cx = Math.floor(w / 2);
            const cy = Math.floor(h / 2);
            // Read 50x50 pixel block around center
            const imgData = ctx.getImageData(Math.max(0, cx - 25), Math.max(0, cy - 25), 50, 50);
            let nonZeroPixels = 0;
            for (let i = 3; i < imgData.data.length; i += 4) {
              if (imgData.data[i] > 20) nonZeroPixels++;
            }
            return {
              canvasDimensions: { width: w, height: h },
              center: { cx, cy },
              nonZeroPixelsAroundCenter: nonZeroPixels,
            };
          })()
        `,
        returnByValue: true,
      });

      console.log('\n  --- Permanent ?debug Crosshair on Overlay Canvas ---');
      console.log('  Crosshair Pixel Check:', crosshairCheck.result.value);
      const crosshairOk = crosshairCheck.result.value.nonZeroPixelsAroundCenter > 10;
      console.log(`  [Permanent Debug Crosshair Rendered at Canvas Centre]: ${crosshairOk ? 'PASSED' : 'FAILED'}`);
      if (!crosshairOk) allPassed = false;

      // 4. Check Settings Drawer Toggle "Centre on subject"
      const settingsDrawerCheck = await send('Runtime.evaluate', {
        expression: `
          (() => {
            const toggle = document.getElementById('toggle-center-on-content');
            const label = document.querySelector('label[for="toggle-center-on-content"]');
            return {
              toggleExists: !!toggle,
              toggleChecked: toggle ? toggle.checked : false,
              labelFound: label ? label.textContent : null,
            };
          })()
        `,
        returnByValue: true,
      });

      console.log('  Settings Drawer "Centre on subject" Toggle:', settingsDrawerCheck.result.value);
      const toggleOk = settingsDrawerCheck.result.value.toggleExists &&
                       settingsDrawerCheck.result.value.labelFound === 'Centre on subject';
      console.log(`  [Settings Toggle 'Centre on subject' Present]: ${toggleOk ? 'PASSED' : 'FAILED'}`);
      if (!toggleOk) allPassed = false;

      ws.close();
    } catch (e) {
      console.error('Error during verification:', e);
      allPassed = false;
    } finally {
      chromeProc.kill();
    }
  }

  server.close();
  console.log(`\n================================================================`);
  console.log(`FINAL RESULT: ${allPassed ? 'ALL VERIFICATIONS PASSED 🎉' : 'FAILURES DETECTED'}`);
  console.log(`================================================================`);
}

runVerification().catch(console.error);
