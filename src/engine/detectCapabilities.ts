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
import { isLikelyChromium } from '../sources/createDisplayMediaSource.js';

export function detectCapabilities(): Capabilities {
  const hasAudioContext =
    typeof AudioContext !== 'undefined' ||
    (typeof globalThis !== 'undefined' &&
      typeof (globalThis as { webkitAudioContext?: unknown }).webkitAudioContext !==
        'undefined');

  const hasMediaDevices =
    typeof navigator !== 'undefined' && !!navigator.mediaDevices;

  const hasGetUserMedia =
    hasMediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function';

  const hasGetDisplayMedia =
    hasMediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function';

  const hasBlobArrayBuffer =
    typeof Blob !== 'undefined' &&
    typeof Blob.prototype.arrayBuffer === 'function';

  return {
    mediaElement: hasAudioContext && typeof HTMLMediaElement !== 'undefined',
    microphone: hasAudioContext && hasGetUserMedia,
    // API must exist AND browser must actually deliver an audio track.
    displayMedia: hasAudioContext && hasGetDisplayMedia && isLikelyChromium(),
    file: hasAudioContext && hasBlobArrayBuffer,
  };
}
