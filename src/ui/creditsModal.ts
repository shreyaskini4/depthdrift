/**
 * Credits & Open-Source Licenses Modal for Drift
 * Comprehensive attribution, license details, and upstream repository links.
 */

import { ICONS } from './icons';

export interface CreditsModalOptions {
  onClose: () => void;
}

interface ComponentCredit {
  id: string;
  name: string;
  license: string;
  author: string;
  url: string;
  description: string;
  licenseText: string;
}

const CREDITS_DATA: ComponentCredit[] = [
  {
    id: 'depth-anything',
    name: 'Depth Anything V2 Small',
    license: 'Apache License 2.0',
    author: 'Lihe Yang, Bingyi Kang, Zilong Huang, Xiaogang Xu, Jiashi Feng, Hengshuang Zhao (HKU & ByteDance)',
    url: 'https://github.com/DepthAnything/Depth-Anything-V2',
    description: 'Highly accurate client-side monocular depth estimation neural network, quantized for browser execution.',
    licenseText: `Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.`,
  },
  {
    id: 'onnxruntime-web',
    name: 'ONNX Runtime Web',
    license: 'MIT License',
    author: 'Microsoft Corporation',
    url: 'https://github.com/microsoft/onnxruntime',
    description: 'Cross-platform, high-performance scoring engine for ML models running via WebAssembly and WebGPU.',
    licenseText: `MIT License

Copyright (c) Microsoft Corporation. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`,
  },
  {
    id: 'threejs',
    name: 'Three.js',
    license: 'MIT License',
    author: 'Ricardo Cabello (mrdoob) and the Three.js Authors',
    url: 'https://github.com/mrdoob/three.js',
    description: 'JavaScript 3D library used for WebGL particle batching, perspective projection, and buffer management.',
    licenseText: `The MIT License

Copyright © 2010-2025 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.`,
  },
  {
    id: 'manrope',
    name: 'Manrope Typography',
    license: 'SIL Open Font License 1.1 (OFL-1.1)',
    author: 'Mikhail Sharanda',
    url: 'https://github.com/sharanda/manrope',
    description: 'Open-source modern geometric sans-serif typeface used for interface labels, controls, and readouts.',
    licenseText: `SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007

Copyright (c) 2018-2021, Mikhail Sharanda and Mirtha Charoenkit.

Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the conditions of the OFL.`,
  },
  {
    id: 'noto-serif-tc',
    name: 'Noto Serif TC Typography',
    license: 'SIL Open Font License 1.1 (OFL-1.1)',
    author: 'Google LLC',
    url: 'https://fonts.google.com/specimen/Noto+Serif+TC',
    description: 'Refined editorial serif typeface chosen for the Drift title treatment and atmospheric headings.',
    licenseText: `SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007

Copyright 2014-2021 Adobe Systems Incorporated (http://www.adobe.com/), with Reserved Font Name 'Source'.
Copyright 2021 Google LLC.

Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the conditions of the OFL.`,
  },
];

export class CreditsModal {
  private container: HTMLElement;
  private backdrop: HTMLElement;
  private options: CreditsModalOptions;
  private isOpen: boolean = false;

  constructor(parent: HTMLElement, options: CreditsModalOptions) {
    this.options = options;

    this.backdrop = document.createElement('div');
    this.backdrop.className = 'credits-backdrop';
    this.backdrop.addEventListener('click', () => this.close());

    this.container = document.createElement('div');
    this.container.className = 'credits-modal-panel glassmorphic-panel';
    this.container.setAttribute('role', 'dialog');
    this.container.setAttribute('aria-modal', 'true');
    this.container.setAttribute('aria-label', 'Open-Source Credits and Licenses');

    this.render();
    parent.appendChild(this.backdrop);
    parent.appendChild(this.container);
  }

  public open(): void {
    this.isOpen = true;
    this.backdrop.classList.add('active');
    this.container.classList.add('open');
  }

  public close(): void {
    this.isOpen = false;
    this.backdrop.classList.remove('active');
    this.container.classList.remove('open');
    this.options.onClose();
  }

  public toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  public getIsOpen(): boolean {
    return this.isOpen;
  }

  public render(): void {
    this.container.innerHTML = `
      <div class="credits-header">
        <div class="credits-title-group">
          <h2 class="credits-title">Credits & Open-Source Licenses</h2>
          <span class="credits-subtitle">Open-source software powering Drift</span>
        </div>
        <button class="credits-close-btn" aria-label="Close Credits (Esc)" title="Close Credits (Esc)">
          ${ICONS.close}
        </button>
      </div>

      <div class="credits-body">
        <p class="credits-intro">
          Drift is built entirely on open-source web technologies and state-of-the-art vision models. All image processing and neural network depth inference run 100% locally in your browser.
        </p>

        <div class="credits-list">
          ${CREDITS_DATA.map((item) => `
            <div class="credit-card" id="credit-${item.id}">
              <div class="credit-card-header">
                <div class="credit-card-titles">
                  <div class="credit-name-row">
                    <span class="credit-name">${item.name}</span>
                    <span class="credit-license-badge">${item.license}</span>
                  </div>
                  <span class="credit-author">${item.author}</span>
                </div>
                <a href="${item.url}" target="_blank" rel="noopener noreferrer" class="credit-link" aria-label="Visit ${item.name} repository">
                  ${ICONS.externalLink}
                </a>
              </div>

              <p class="credit-description">${item.description}</p>

              <details class="credit-license-accordion">
                <summary class="license-summary">View Full License</summary>
                <pre class="license-pre"><code>${item.licenseText}</code></pre>
              </details>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    this.container.querySelector('.credits-close-btn')?.addEventListener('click', () => {
      this.close();
    });
  }
}
