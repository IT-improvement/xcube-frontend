// React Router 7 needs TextEncoder/TextDecoder, which the CRA jsdom environment does not provide.
import { TextDecoder, TextEncoder } from 'util';

Object.assign(globalThis, { TextEncoder, TextDecoder });

// Screens follow the browser language (UR-53). jsdom reports "en-US", so pin a Korean browser here:
// existing tests assert Korean text. Language tests override these and clean up after themselves.
Object.defineProperty(window.navigator, 'language', { value: 'ko-KR', configurable: true });
Object.defineProperty(window.navigator, 'languages', { value: ['ko-KR', 'ko'], configurable: true });

afterEach(() => {
  try { localStorage.removeItem('xcube.lang'); } catch { /* storage unavailable */ }
});
