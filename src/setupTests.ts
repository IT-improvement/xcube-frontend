// React Router 7 needs TextEncoder/TextDecoder, which the CRA jsdom environment does not provide.
import { TextDecoder, TextEncoder } from 'util';

Object.assign(globalThis, { TextEncoder, TextDecoder });
