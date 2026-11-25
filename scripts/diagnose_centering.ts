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

async function runDiagnosis() {
  const testPort = 8765;
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

  const viewports = [
    { width: 1920, height: 917, name: '1920x917 (Wide Desktop)' },
    { width: 1366, height: 768, name: '1366x768 (Standard Laptop)' },
    { width: 390, height: 844, name: '390x844 (Mobile)' },
  ];

  console.log('Starting Diagnosis over Viewports...');

  for (const vp of viewports) {
    console.log(`\n======================================================`);
    console.log(`DIAGNOSTIC RUN FOR VIEWPORT: ${vp.name}`);
    console.log(`======================================================`);

    const cdpPort = 9450 + Math.floor(Math.random() * 100);
    const chromeProc = spawn(chromePath, [
      '--headless=new',
      `--remote-debugging-port=${cdpPort}`,
      '--no-sandbox',
      '--disable-gpu',
      `--window-size=${vp.width},${vp.height}`,
      `http://localhost:${testPort}/?debug`,
    ]);

    await new Promise((r) => setTimeout(r, 1500));

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

      await new Promise((r) => setTimeout(r, 500));

      // Dismiss title screen if visible
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

      await new Promise((r) => setTimeout(r, 300));

      // 1. Initial State Measurement
      const initialReport = await send('Runtime.evaluate', {
        expression: `
          (() => {
            const engine = window.driftEngine;
            const canvas = document.getElementById('particle-canvas');
            const rect = canvas.getBoundingClientRect();
            const diag = engine.getCenteringDiagnostics();
            return {
              viewport: { innerWidth: window.innerWidth, innerHeight: window.innerHeight },
              canvasRect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
              canvasCenter: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
              windowCenter: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
              canvasVsWindowOffset: {
                dx: (rect.left + rect.width / 2) - (window.innerWidth / 2),
                dy: (rect.top + rect.height / 2) - (window.innerHeight / 2)
              },
              engineDimensions: { width: diag.engineSize.width, height: diag.engineSize.height },
              rendererDomElementDividedByDpr: diag.rendererDomElementDividedByDpr,
              measureImageCenter: diag.imageCenter,
              cameraPosition: diag.cameraPosition,
              lookAtTarget: diag.lookAtTarget,
              pan: diag.pan,
              yaw: diag.yaw,
              pitch: diag.pitch,
              pointerState: diag.pointerState,
              pointerNormalized: {
                px: diag.pointerState.x / Math.max(1, diag.engineSize.width) - 0.5,
                py: diag.pointerState.y / Math.max(1, diag.engineSize.height) - 0.5
              }
            };
          })()
        `,
        returnByValue: true,
      });

      console.log('--- Initial Load Metrics (Default Surface): ---');
      console.log(JSON.stringify(initialReport.result.value, null, 2));

      // 2. Measure with 3 Different Images (wide, portrait, square)
      const imagesToTest = [
        { name: 'Wide (16:9, 1600x900)', width: 1600, height: 900 },
        { name: 'Portrait (9:16, 900x1600)', width: 900, height: 1600 },
        { name: 'Square (1:1, 1000x1000)', width: 1000, height: 1000 },
      ];

      for (const imgSpec of imagesToTest) {
        const imageResult = await send('Runtime.evaluate', {
          expression: `
            (async () => {
              const engine = window.driftEngine;
              const canvas = document.createElement('canvas');
              canvas.width = ${imgSpec.width};
              canvas.height = ${imgSpec.height};
              const ctx = canvas.getContext('2d');
              // Create an asymmetric gradient to test visual mass and subject center
              const grad = ctx.createLinearGradient(0, 0, ${imgSpec.width}, ${imgSpec.height});
              grad.addColorStop(0, '#ffffff');
              grad.addColorStop(0.3, '#ffaa00');
              grad.addColorStop(1, '#001133');
              ctx.fillStyle = grad;
              ctx.fillRect(0, 0, ${imgSpec.width}, ${imgSpec.height});

              const depthData = new Float32Array(${imgSpec.width} * ${imgSpec.height});
              for (let i = 0; i < depthData.length; i++) depthData[i] = 0.5;

              const depthResult = {
                width: ${imgSpec.width},
                height: ${imgSpec.height},
                data: depthData,
                provider: 'heuristic',
                source: 'heuristic'
              };

              engine.setImage(canvas, depthResult);

              // Wait 100ms for smooth transitions
              await new Promise(r => setTimeout(r, 120));

              const rect = document.getElementById('particle-canvas').getBoundingClientRect();
              const diag = engine.getCenteringDiagnostics();
              return {
                image: '${imgSpec.name}',
                aspect: ${imgSpec.width} / ${imgSpec.height},
                measureImageCenter: diag.imageCenter,
                cameraPosition: diag.cameraPosition,
                lookAtTarget: diag.lookAtTarget,
                pan: diag.pan,
                yaw: diag.yaw,
                pitch: diag.pitch,
              };
            })()
          `,
          awaitPromise: true,
          returnByValue: true,
        });

        console.log(`\n--- Metrics for ${imgSpec.name}: ---`);
        console.log(JSON.stringify(imageResult.result.value, null, 2));
      }

      ws.close();
    } catch (e) {
      console.error('Error during CDP diagnostics:', e);
    } finally {
      chromeProc.kill();
    }
  }

  server.close();
  console.log('\nDiagnosis complete.');
}

runDiagnosis().catch(console.error);
