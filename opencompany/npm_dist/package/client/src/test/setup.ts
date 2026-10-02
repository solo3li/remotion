/**
 * Vitest setup - runs once before all tests.
 *
 * Stubs browser APIs that Node definitions / factories may touch when imported.
 */

import { vi } from 'vitest';

// React Flow uses ResizeObserver; jsdom doesn't ship one
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  // TS infers the assignment is fine now (target widened); kept only
  // for the historical note. No @ts-expect-error needed.
  globalThis.ResizeObserver = ResizeObserverStub;
}

// matchMedia shim for any antd component imported transitively
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// IntersectionObserver shim -- antd virtualised lists use it
if (typeof globalThis.IntersectionObserver === 'undefined') {
  class IntersectionObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
    root = null;
    rootMargin = '';
    scrollMargin = '';
    thresholds = [];
  }
  // TS infers the assignment is fine now (target widened); kept only
  // for the historical note. No @ts-expect-error needed.
  globalThis.IntersectionObserver = IntersectionObserverStub;
}

// Auto-cleanup React Testing Library between tests
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

afterEach(() => {
  cleanup();
});
