import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const target = () => ({
  addEventListener() {},
  removeEventListener() {},
  classList: { add() {}, remove() {}, toggle() {} },
  setAttribute() {},
  querySelector() { return null; },
  querySelectorAll() { return []; },
  style: {},
  contains() { return false; },
});

test("landing route starts the optional scene download with the landing component", async () => {
  const source = await readFile(new URL("../src/main.tsx", import.meta.url), "utf8");
  assert.match(
    source,
    /const Landing = lazy\(\(\) => \{\s*void import\("@\/landing\/scene"\)\.catch\(\(\) => \{\}\)\s*return import\("@\/landing\/Landing"\)\s*\}\)/,
  );
});

test("leaving the landing route completes scene cleanup", async () => {
  const originalWarn = console.warn;
  const originalError = console.error;
  const original = new Map(
    ["window", "document", "ResizeObserver"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  const listeners = target();
  const canvasContext = {
    createImageData(width, height) { return { data: new Uint8ClampedArray(width * height * 4) }; },
    putImageData() {},
  };
  const canvas = { ...target(), getContext(type) {
    if (type !== "2d") throw new Error("WebGL unavailable in cleanup test");
    return canvasContext;
  } };
  const documentMock = {
    ...listeners,
    hidden: false,
    fonts: { ready: Promise.resolve() },
    createElement() { return canvas; },
  };
  const windowMock = {
    ...listeners,
    matchMedia() { return { matches: true, addEventListener() {}, removeEventListener() {} }; },
    setTimeout,
    clearTimeout,
  };
  globalThis.window = windowMock;
  globalThis.document = documentMock;
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  console.warn = () => {};
  console.error = () => {};

  try {
    const { mountLanding } = await import("../src/landing/scene.ts");
    const hero = { ...target(), clientWidth: 800, clientHeight: 600, getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600 }; } };
    const elements = new Map([
      ["#hero", hero],
      ["#tube-scene", canvas],
      ["#topbar", target()],
      ["#menu-toggle", target()],
      ["#site-menu", target()],
      ["#menu-announcement", { textContent: "" }],
    ]);
    const root = {
      querySelector(selector) { return elements.get(selector) ?? null; },
      querySelectorAll() { return []; },
      classList: { add() {}, remove() {} },
    };

    const cleanup = mountLanding(root, { animateIntro: false });
    assert.doesNotThrow(cleanup);
  } finally {
    console.warn = originalWarn;
    console.error = originalError;
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
