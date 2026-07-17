// The Stellar SDK expects a global `Buffer` in the browser. Import this module
// before the SDK so the polyfill is installed first.
import { Buffer } from "buffer";

if (typeof globalThis.Buffer === "undefined") {
  (globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
}
