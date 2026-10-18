/**
 * Shared jsdom environment for the headless tests.
 *
 * jsdom does not implement canvas, matchMedia or ResizeObserver, so the missing pieces are
 * stubbed here. The stubs are deliberately inert - the tests assert on behaviour, not on
 * pixels.
 */
import { JSDOM } from 'jsdom';

const canvasContextStub = () => ({
  canvas: null,
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  shadowColor: '',
  shadowBlur: 0,
  font: '',
  globalAlpha: 1,
  clearRect() {},
  fillRect() {},
  strokeRect() {},
  beginPath() {},
  closePath() {},
  moveTo() {},
  lineTo() {},
  arc() {},
  ellipse() {},
  roundRect() {},
  bezierCurveTo() {},
  quadraticCurveTo() {},
  stroke() {},
  fill() {},
  clip() {},
  save() {},
  restore() {},
  translate() {},
  scale() {},
  rotate() {},
  setTransform() {},
  resetTransform() {},
  drawImage() {},
  fillText() {},
  strokeText() {},
  measureText() {
    return { width: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 };
  },
  createLinearGradient() {
    return { addColorStop() {} };
  },
  createRadialGradient() {
    return { addColorStop() {} };
  },
  createPattern() {
    return null;
  },
  getImageData() {
    return { data: new Uint8ClampedArray(4), width: 1, height: 1 };
  },
});

export function setupJsdom(html = '<!doctype html><html><body><div id="root"></div></body></html>') {
  const dom = new JSDOM(html, {
    url: 'http://localhost:8080/',
    pretendToBeVisual: true,
  });

  const { window } = dom;

  global.window = window;
  global.document = window.document;
  Object.defineProperty(global, 'navigator', {
    value: window.navigator,
    configurable: true,
    writable: true,
  });

  // jsdom classes the bundle expects to find on the global scope. Anything Node already
  // provides (URL, Blob, fetch, ...) is left alone so the platform is not degraded.
  const DOM_GLOBALS = [
    'Document',
    'DocumentFragment',
    'DOMParser',
    'XMLSerializer',
    'DOMRect',
    'DOMPoint',
    'DOMTokenList',
    'NodeList',
    'NodeFilter',
    'Text',
    'Range',
    'Selection',
    'Element',
    'Node',
    'Event',
    'EventTarget',
    'CustomEvent',
    'MouseEvent',
    'KeyboardEvent',
    'FocusEvent',
    'InputEvent',
    'PointerEvent',
    'WheelEvent',
    'DragEvent',
    'ClipboardEvent',
    'TouchEvent',
    'ErrorEvent',
    'MutationObserver',
    'IntersectionObserver',
    'PerformanceObserver',
    'ResizeObserver',
    'CSS',
    'Image',
    'ImageData',
    'Path2D',
    'FileReader',
    'FormData',
    'SVGElement',
    'SVGSVGElement',
    'HTMLElement',
    'HTMLCanvasElement',
    'HTMLInputElement',
    'HTMLButtonElement',
    'HTMLAnchorElement',
    'HTMLImageElement',
    'HTMLFormElement',
    'HTMLSelectElement',
    'HTMLTextAreaElement',
    'HTMLLabelElement',
    'HTMLSpanElement',
    'HTMLDivElement',
    'HTMLUListElement',
    'HTMLLIElement',
    'HTMLMediaElement',
    'HTMLAudioElement',
    'HTMLVideoElement',
    'HTMLIFrameElement',
    'HTMLTableElement',
    'HTMLTemplateElement',
  ];

  for (const name of DOM_GLOBALS) {
    if (name in global) continue;
    const value = window[name];
    if (value !== undefined) global[name] = value;
  }

  // Node ships its own Event classes. jsdom refuses events that are not instances of *its*
  // Event, so the DOM event classes always have to come from the window.
  for (const name of [
    'Event',
    'EventTarget',
    'CustomEvent',
    'MouseEvent',
    'KeyboardEvent',
    'FocusEvent',
    'InputEvent',
    'PointerEvent',
    'WheelEvent',
    'DragEvent',
    'ClipboardEvent',
    'TouchEvent',
    'ErrorEvent',
  ]) {
    if (window[name]) global[name] = window[name];
  }

  global.getComputedStyle = window.getComputedStyle.bind(window);
  if (typeof global.getSelection !== 'function') {
    global.getSelection = () => window.getSelection();
  }

  global.fetch = globalThis.fetch;
  global.Headers = globalThis.Headers;
  global.Request = globalThis.Request;
  global.Response = globalThis.Response;
  window.fetch = globalThis.fetch;

  global.requestAnimationFrame = (cb) => window.setTimeout(() => cb(Date.now()), 16);
  global.cancelAnimationFrame = (id) => window.clearTimeout(id);
  global.localStorage = window.localStorage;

  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  });
  global.matchMedia = window.matchMedia;

  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = ResizeObserverStub;
  global.ResizeObserver = ResizeObserverStub;

  // jsdom has no canvas backend - hand out an inert 2d context.
  window.HTMLCanvasElement.prototype.getContext = function getContext() {
    if (!this.__context) {
      const context = canvasContextStub();
      context.canvas = this;
      this.__context = context;
    }
    return this.__context;
  };

  return { dom, window };
}

/** Captures console.error and window errors so the tests can fail on them. */
export function captureErrors() {
  const errors = [];
  const originalError = console.error;

  console.error = (...args) => {
    errors.push(args.map((arg) => String(arg?.message ?? arg)).join(' '));
    originalError(...args);
  };

  return errors;
}
