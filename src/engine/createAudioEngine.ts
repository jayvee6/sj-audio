/**
 * The orchestrator — chains through source kinds in a user-supplied order,
 * using the first one that succeeds. Exposes the full `AudioSource` interface
 * (delegated to the active adapter) plus `activeKind` and `switchTo()`.
 *
 * Fallback chain default: `['displayMedia', 'microphone', 'file']` — tab audio
 * if available (Chromium desktop), otherwise mic, otherwise file upload.
 */

import type {
  AudioEngine,
  AudioEngineOptions,
  AudioFrame,
  AudioSource,
  AudioSourceKind,
  Capabilities,
  FrameListener,
  Unsubscribe,
} from '../types.js';
import { AudioSourceUnavailableError } from '../types.js';
import { createMediaElementSource } from '../sources/createMediaElementSource.js';
import { createMicrophoneSource } from '../sources/createMicrophoneSource.js';
import { createDisplayMediaSource } from '../sources/createDisplayMediaSource.js';
import { createFileSource } from '../sources/createFileSource.js';
import { detectCapabilities } from './detectCapabilities.js';

const DEFAULT_CHAIN: AudioSourceKind[] = ['displayMedia', 'microphone', 'file'];

export function createAudioEngine(opts: AudioEngineOptions = {}): AudioEngine {
  const baseChain = opts.fallbackChain ?? DEFAULT_CHAIN.slice();
  const chain = opts.preferredSource
    ? [opts.preferredSource, ...baseChain.filter((k) => k !== opts.preferredSource)]
    : baseChain;

  const capabilities = detectCapabilities();
  const listeners = new Set<FrameListener>();
  let active: AudioSource | null = null;
  let activeKind: AudioSourceKind | null = null;
  const viewport = { w: 0, h: 0 };
  // We wire every adapter's onFrame through a stable republisher so swapping
  // the active source doesn't force consumers to re-subscribe.
  let activeUnsub: Unsubscribe | null = null;

  const buildSource = (kind: AudioSourceKind): AudioSource => {
    switch (kind) {
      case 'mediaElement':
        if (!opts.mediaElement) {
          throw new AudioSourceUnavailableError(
            'mediaElement',
            'unsupported',
            'AudioEngineOptions.mediaElement was not provided',
          );
        }
        return createMediaElementSource(opts.mediaElement, opts.analyzer);
      case 'microphone':
        return createMicrophoneSource(opts.analyzer);
      case 'displayMedia':
        return createDisplayMediaSource(opts.analyzer);
      case 'file':
        if (!opts.file) {
          throw new AudioSourceUnavailableError(
            'file',
            'unsupported',
            'AudioEngineOptions.file was not provided',
          );
        }
        return createFileSource(opts.file, opts.analyzer);
    }
  };

  const attach = async (kind: AudioSourceKind): Promise<void> => {
    const src = buildSource(kind);
    src.setViewport(viewport.w, viewport.h);
    activeUnsub = src.onFrame((frame) => {
      for (const cb of listeners) {
        try {
          cb(frame);
        } catch {
          // isolate
        }
      }
    });
    await src.start();
    active = src;
    activeKind = kind;
  };

  const detach = (): void => {
    if (activeUnsub) {
      activeUnsub();
      activeUnsub = null;
    }
    if (active) {
      active.stop();
      active = null;
    }
    activeKind = null;
  };

  const start = async (): Promise<void> => {
    if (active) return;
    let lastErr: unknown = null;
    for (const kind of chain) {
      // Fast-skip: if static capability says false AND caller didn't force it
      // via preferredSource, skip. (Still try if explicitly preferred, so the
      // caller can see the real error.)
      if (!capabilities[kind] && opts.preferredSource !== kind) continue;
      // Fast-skip: mediaElement / file require a payload.
      if (kind === 'mediaElement' && !opts.mediaElement) continue;
      if (kind === 'file' && !opts.file) continue;
      try {
        await attach(kind);
        return;
      } catch (err) {
        lastErr = err;
        detach();
        // keep trying the next kind
      }
    }
    if (lastErr) throw lastErr;
    throw new AudioSourceUnavailableError(
      chain[0] ?? 'microphone',
      'unsupported',
      'No source in the fallback chain was available',
    );
  };

  const stop = (): void => {
    detach();
  };

  const switchTo = async (kind: AudioSourceKind): Promise<void> => {
    detach();
    await attach(kind);
  };

  const onFrame = (cb: FrameListener): Unsubscribe => {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  };

  const currentFrame = (): AudioFrame | null => active?.currentFrame() ?? null;

  const setViewport = (width: number, height: number): void => {
    viewport.w = width;
    viewport.h = height;
    active?.setViewport(width, height);
  };

  const engine: AudioEngine = {
    get kind() {
      return (activeKind ?? chain[0] ?? 'microphone') as AudioSourceKind;
    },
    get capabilities(): Capabilities {
      return capabilities;
    },
    get activeKind() {
      return activeKind;
    },
    start,
    stop,
    switchTo,
    onFrame,
    currentFrame,
    setViewport,
  };

  return engine;
}
