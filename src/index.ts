/**
 * SJAudio — cross-browser web audio capture + analysis library for music viz.
 *
 * Four source adapters (mediaElement, microphone, displayMedia, file) plus a
 * unified `createAudioEngine` orchestrator with graceful fallback. Ships as
 * ESM + CJS + UMD (global: `window.SJAudio`).
 */

export const version = '0.1.0';

export type {
  AudioFrame,
  Capabilities,
  AudioSource,
  AudioSourceKind,
  AudioSourceUnavailableReason,
  FrameListener,
  Unsubscribe,
  AnalyzerOptions,
  AudioEngine,
  AudioEngineOptions,
} from './types.js';

export { AudioSourceUnavailableError } from './types.js';

export { createMediaElementSource } from './sources/createMediaElementSource.js';
export { createMicrophoneSource } from './sources/createMicrophoneSource.js';
export {
  createDisplayMediaSource,
  isLikelyChromium,
} from './sources/createDisplayMediaSource.js';
export { createFileSource } from './sources/createFileSource.js';
export { createNativeBridgeSource } from './sources/createNativeBridgeSource.js';
export type { NativeBridgeSourceOptions } from './sources/createNativeBridgeSource.js';
export { detectCapabilities } from './engine/detectCapabilities.js';
export { createAudioEngine } from './engine/createAudioEngine.js';
