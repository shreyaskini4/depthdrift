/**
 * Procedural Demo Art Generator for Drift
 * Creates high-aesthetic procedural demo images so users can test immediately
 * without needing local files.
 */

export interface DemoArtPreset {
  id: string;
  name: string;
  description: string;
  generate: () => Promise<File>;
}

/**
 * Helper to convert an offscreen HTMLCanvasElement to a File object.
 */
async function canvasToFile(canvas: HTMLCanvasElement, filename: string): Promise<File> {
  return new Promise<File>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error(`Failed to convert canvas to blob for ${filename}`));
          return;
        }
        const file = new File([blob], filename, { type: 'image/png' });
        resolve(file);
      },
      'image/png',
      0.95
    );
  });
}

/**
 * 1. Astral Nebula: Cosmic spiral and dense stardust cluster with deep purple, magenta, and cyan hues.
 */
async function generateAstralNebula(): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  // Deep interstellar space
  const bg = ctx.createRadialGradient(512, 512, 50, 512, 512, 700);
  bg.addColorStop(0, '#100c24');
  bg.addColorStop(0.5, '#070514');
  bg.addColorStop(1, '#020108');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1024, 1024);

  // Swirling gas clouds
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < 60; i++) {
    const angle = (i / 60) * Math.PI * 4;
    const r = 80 + i * 7.5;
    const cx = 512 + Math.cos(angle) * r + (Math.sin(i * 1.7) * 40);
    const cy = 512 + Math.sin(angle) * r + (Math.cos(i * 1.3) * 40);
    const radius = 90 + Math.sin(i * 0.5) * 40;

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    if (i % 3 === 0) {
      grad.addColorStop(0, 'rgba(100, 210, 255, 0.45)');
      grad.addColorStop(0.5, 'rgba(60, 120, 240, 0.2)');
    } else if (i % 3 === 1) {
      grad.addColorStop(0, 'rgba(236, 72, 153, 0.4)');
      grad.addColorStop(0.5, 'rgba(168, 85, 247, 0.18)');
    } else {
      grad.addColorStop(0, 'rgba(255, 214, 10, 0.35)');
      grad.addColorStop(0.5, 'rgba(249, 115, 22, 0.15)');
    }
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Brilliant core
  const core = ctx.createRadialGradient(512, 512, 0, 512, 512, 180);
  core.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
  core.addColorStop(0.2, 'rgba(192, 232, 255, 0.7)');
  core.addColorStop(0.6, 'rgba(120, 80, 240, 0.25)');
  core.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(512, 512, 180, 0, Math.PI * 2);
  ctx.fill();

  // Fine stardust sparkles
  ctx.fillStyle = '#ffffff';
  for (let s = 0; s < 350; s++) {
    const sx = Math.random() * 1024;
    const sy = Math.random() * 1024;
    const sz = Math.random() * 2.2 + 0.4;
    const alpha = Math.random() * 0.8 + 0.2;
    ctx.globalAlpha = alpha;
    ctx.fillRect(sx, sy, sz, sz);
  }
  ctx.globalAlpha = 1.0;

  return canvasToFile(canvas, 'astral-nebula.png');
}

/**
 * 2. Topographic Mountain: Multi-tiered topographic contour mountain with glowing crest.
 */
async function generateTopographicMountain(): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  // Dark twilight gradient
  const bg = ctx.createLinearGradient(0, 0, 0, 1024);
  bg.addColorStop(0, '#060a14');
  bg.addColorStop(0.6, '#0b162c');
  bg.addColorStop(1, '#081020');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1024, 1024);

  // Glowing solar crest at center horizon
  const sunGrad = ctx.createRadialGradient(512, 420, 10, 512, 420, 320);
  sunGrad.addColorStop(0, 'rgba(255, 214, 10, 0.85)');
  sunGrad.addColorStop(0.4, 'rgba(245, 120, 40, 0.4)');
  sunGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = sunGrad;
  ctx.beginPath();
  ctx.arc(512, 420, 320, 0, Math.PI * 2);
  ctx.fill();

  // Multi-tier geometric mountain silhouettes
  const layers = [
    { yBase: 780, peakH: 340, color: '#13284c', stroke: '#38bdf8', count: 18 },
    { yBase: 840, peakH: 260, color: '#0d1f3c', stroke: '#2dd4bf', count: 14 },
    { yBase: 920, peakH: 180, color: '#071328', stroke: '#06b6d4', count: 10 },
  ];

  for (const layer of layers) {
    ctx.fillStyle = layer.color;
    ctx.strokeStyle = layer.stroke;
    ctx.lineWidth = 2.0;

    ctx.beginPath();
    ctx.moveTo(0, 1024);
    ctx.lineTo(0, layer.yBase);

    for (let x = 0; x <= 1024; x += 16) {
      const nx = (x - 512) / 380;
      const gaussian = Math.exp(-nx * nx);
      const jagged = Math.sin(x * 0.03) * 25 + Math.sin(x * 0.08) * 12;
      const y = layer.yBase - gaussian * layer.peakH + jagged;
      ctx.lineTo(x, y);
    }

    ctx.lineTo(1024, 1024);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Topographic contour rings
    for (let c = 1; c <= 4; c++) {
      ctx.beginPath();
      ctx.strokeStyle = `rgba(100, 210, 255, ${0.15 - c * 0.02})`;
      ctx.lineWidth = 1.0;
      for (let x = 60; x <= 960; x += 24) {
        const nx = (x - 512) / 380;
        const gaussian = Math.exp(-nx * nx);
        const y = layer.yBase - gaussian * (layer.peakH - c * 45) + (Math.sin(x * 0.04) * 10);
        if (x === 60) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  return canvasToFile(canvas, 'topographic-peak.png');
}

/**
 * 3. Fluid Chroma: Iridescent dynamic fluid ribbons and flowing chromatic currents.
 */
async function generateFluidChroma(): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  // Deep obsidian canvas
  ctx.fillStyle = '#06070a';
  ctx.fillRect(0, 0, 1024, 1024);

  // Flowing ribbon passes
  ctx.globalCompositeOperation = 'screen';
  const ribbons = 12;

  for (let r = 0; r < ribbons; r++) {
    const t = r / ribbons;
    ctx.beginPath();

    const startY = 200 + t * 620;
    ctx.moveTo(0, startY);

    for (let x = 0; x <= 1024; x += 20) {
      const wave1 = Math.sin(x * 0.005 + t * 4) * 120;
      const wave2 = Math.cos(x * 0.012 - t * 3) * 60;
      const wave3 = Math.sin(x * 0.002 + t * 2) * 80;
      const y = startY + wave1 + wave2 + wave3;
      ctx.lineTo(x, y);
    }

    const grad = ctx.createLinearGradient(0, startY, 1024, startY + 100);
    grad.addColorStop(0, `hsla(${200 + t * 120}, 90%, 65%, 0.4)`);
    grad.addColorStop(0.5, `hsla(${280 + t * 80}, 95%, 60%, 0.5)`);
    grad.addColorStop(1, `hsla(${30 + t * 90}, 90%, 55%, 0.4)`);

    ctx.strokeStyle = grad;
    ctx.lineWidth = 14 + (1 - t) * 18;
    ctx.stroke();
  }

  // Central radiant focal aura
  const aura = ctx.createRadialGradient(512, 512, 30, 512, 512, 350);
  aura.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
  aura.addColorStop(0.3, 'rgba(100, 210, 255, 0.25)');
  aura.addColorStop(0.7, 'rgba(168, 85, 247, 0.15)');
  aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(512, 512, 350, 0, Math.PI * 2);
  ctx.fill();

  return canvasToFile(canvas, 'fluid-chroma.png');
}

export const DEMO_PRESETS: DemoArtPreset[] = [
  {
    id: 'nebula',
    name: 'Astral Nebula',
    description: 'Deep cosmic stardust and swirling galactic core',
    generate: generateAstralNebula,
  },
  {
    id: 'mountain',
    name: 'Topographic Peak',
    description: 'Geometric mountain ridges with twilight solar crest',
    generate: generateTopographicMountain,
  },
  {
    id: 'chroma',
    name: 'Fluid Chroma',
    description: 'Iridescent kinetic ribbons and flowing wave currents',
    generate: generateFluidChroma,
  },
];

/**
 * Generate all demo files at once.
 */
export async function generateAllDemoArt(): Promise<File[]> {
  const files: File[] = [];
  for (const preset of DEMO_PRESETS) {
    const file = await preset.generate();
    files.push(file);
  }
  return files;
}
