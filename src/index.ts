/**
 * SJAudio — cross-browser web audio capture + analysis library for music viz.
 *
 * Source adapters (mediaElement, microphone, displayMedia, file, device,
 * nativeBridge) plus a unified `createAudioEngine` orchestrator with graceful
 * fallback. `listAudioInputDevices` / `detectActiveAudioInput` power a
 * served-site, zero-install device picker. Ships as ESM + CJS + UMD (global:
 * `window.SJAudio`).
 */

export const version = '0.3.0';

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
export { createDeviceSource } from './sources/createDeviceSource.js';
export type { DeviceSourceOptions } from './sources/createDeviceSource.js';
export {
  listAudioInputDevices,
  onDeviceChange,
} from './sources/listAudioInputDevices.js';
export type { AudioInputDevice } from './sources/listAudioInputDevices.js';
export {
  probeAudioInputLevels,
  detectActiveAudioInput,
} from './sources/probeAudioInputs.js';
export type {
  AudioInputLevel,
  ProbeOptions,
} from './sources/probeAudioInputs.js';
export { createNativeBridgeSource } from './sources/createNativeBridgeSource.js';
export type { NativeBridgeSourceOptions } from './sources/createNativeBridgeSource.js';
export { detectCapabilities } from './engine/detectCapabilities.js';
export { createAudioEngine } from './engine/createAudioEngine.js';
