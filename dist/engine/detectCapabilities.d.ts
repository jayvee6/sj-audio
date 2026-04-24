/**
 * Pure, synchronous feature detection — no side effects, no prompts, no
 * async work. Callers can use this to show/hide UI (e.g. "Capture Tab"
 * buttons) without performing any permission request.
 *
 * Note: `displayMedia` requires BOTH the API existing AND the browser being
 * Chromium desktop. On Safari/Firefox the API exists but silently drops the
 * audio flag — we surface that as `false` up-front.
 */
import type { Capabilities } from '../types.js';
export declare function detectCapabilities(): Capabilities;
//# sourceMappingURL=detectCapabilities.d.ts.map