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

  global.HTMLElement = window.HTMLElement;
  global.HTMLCanvasElement = window.HTMLCanvasElement;
  global.Element = window.Element;
  global.Node = window.Node;
  global.Event = window.Event;
  global.CustomEvent = window.CustomEvent;
  global.MouseEvent = window.MouseEvent;
  global.KeyboardEvent = window.KeyboardEvent;
  global.getComputedStyle = window.getComputedStyle.bind(window);

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
