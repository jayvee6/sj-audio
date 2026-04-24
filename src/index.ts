/**
 * SJAudio — cross-browser web audio capture + analysis library for music viz.
 *
 * Four source adapters (mediaElement, microphone, displayMedia, file) plus a
 * unified `createAudioEngine` orchestrator with graceful fallback. Ships as
 * ESM + CJS + UMD (global: `window.SJAudio`).
 */

export const version = '0.0.1';

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
