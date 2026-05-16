# SJAudio

Cross-browser web audio capture + analysis library for music visualization. Zero runtime dependencies. TypeScript. Ships as **ESM + CJS + UMD**.

Four source adapters with their own API:
- **`createMediaElementSource(el)`** — analyze an `<audio>` / `<video>` element
- **`createMicrophoneSource(opts?)`** — `getUserMedia` (works everywhere, iOS Safari is messy)
- **`createDisplayMediaSource(opts?)`** — tab / system audio (**Chromium desktop only**; Safari + Firefox silently ignore the audio flag)
- **`createFileSource(file)`** — drag-drop / picked `File` / `Blob`, analyze-only

And a unified orchestrator that picks the first one that works:
- **`createAudioEngine(opts)`** — `{ fallbackChain, preferredSource, mediaElement?, file?, analyzer? }` → full `AudioSource` + `switchTo(kind)` + `activeKind`.

Plus **`detectCapabilities()`** for synchronous, side-effect-free feature detection so your UI can show / hide the right buttons.

## Install

### Via CDN (recommended for `<script>`-style integration)

```html
<script src="https://cdn.jsdelivr.net/gh/jayvee6/sj-audio@v0.1.0/dist/sj-audio.umd.js"></script>
<script>
  const engine = SJAudio.createAudioEngine({
    mediaElement: document.querySelector('audio'),
  });
  await engine.start();                              // starts capture
  engine.onFrame((frame) => {
    /* drive your viz — see "AudioFrame" below */
  });
</script>
```

### Via ESM

```js
import { createAudioEngine } from 'https://cdn.jsdelivr.net/gh/jayvee6/sj-audio@v0.1.0/dist/sj-audio.esm.js';
```

## Per-source recipes

### Media element (universal)

```js
import { createMediaElementSource } from 'sj-audio';

const audio = document.querySelector('audio');
const source = createMediaElementSource(audio);
audio.addEventListener('play', () => source.start(), { once: true });
source.onFrame((f) => drawViz(f));
```

Cross-origin `src`? Set `audio.crossOrigin = 'anonymous'` **before** assigning `src`, and ensure the server sends `Access-Control-Allow-Origin`. Otherwise AnalyserNode reads silence (no error).

### Microphone (universal, iOS Safari quirky)

```js
import { createMicrophoneSource } from 'sj-audio';

const source = createMicrophoneSource();
document.querySelector('button').addEventListener('click', async () => {
  try {
    await source.start(); // must be in a user-gesture handler
  } catch (err) {
    if (err.reason === 'permission-denied') alert('Mic permission denied.');
  }
});
```

To pick a virtual-audio device (BlackHole, Loopback) for macOS system-audio capture:

```js
const devices = await navigator.mediaDevices.enumerateDevices();
const blackHole = devices.find((d) => d.kind === 'audioinput' && /BlackHole/i.test(d.label));
createMicrophoneSource({ constraints: { deviceId: blackHole.deviceId } });
```

### Display / tab audio (Chromium desktop only)

```js
import { createDisplayMediaSource, isLikelyChromium } from 'sj-audio';

if (!isLikelyChromium()) {
  showBanner('Tab-audio capture needs Chrome or Edge on desktop.');
}
const source = createDisplayMediaSource();
await source.start(); // picker appears; user ticks "Share tab audio"
```

### File upload (universal; analyze-only)

```js
import { createFileSource } from 'sj-audio';

fileInput.addEventListener('change', async () => {
  const source = createFileSource(fileInput.files[0]);
  source.onFrame(drawViz);
  await source.start(); // plays once through analyzer + speakers, then stops
});
```

Need play / pause / seek? Use an `<audio>` element with `createMediaElementSource` instead.

### Orchestrator with fallback chain

```js
import { createAudioEngine } from 'sj-audio';

const engine = createAudioEngine({
  fallbackChain: ['displayMedia', 'microphone', 'file'],
  // preferredSource: 'microphone', // overrides fallback order
  mediaElement: audio, // required if chain includes 'mediaElement'
  file: droppedFile,   // required if chain includes 'file'
});
await engine.start();       // tries in order, uses first that succeeds
console.log(engine.activeKind); // 'displayMedia' | 'microphone' | 'file' | 'mediaElement'
await engine.switchTo('microphone'); // swap at runtime, listeners persist
```

## AudioFrame

Every adapter (and the engine) emits frames of this shape:

```ts
interface AudioFrame {
  time: number;                   // seconds since start
  bass: number;                   // [0..1] band 0..3 averaged
  mid: number;                    // [0..1] band 3..14 averaged
  treble: number;                 // [0..1] band 14..32 averaged
  beatPulse: number;              // [0..1] exp-decay since last onset
  bpm: number;                    // rolling median, 0 before lock
  isBeatNow: boolean;             // true on the frame an onset fired
  bassHistory: Float32Array;      // length 16, age=0 is current
  magnitudes: Float32Array;       // length 32, mel-scale, AGC'd
  magnitudesSmooth: Float32Array; // length 32, EMA (attack 10ms, release 120ms)
  waveform: Float32Array;         // length 256, time-domain [-1..1]
  valence: number;                // 0.5 default; overridable via setMood
  energy: number;                 // 0.5 default
  danceability: number;           // 0.5 default
  tempoBPM: number;               // 0 default; override wins over internal bpm
  width: number;                  // caller-set via setViewport(w, h)
  height: number;
}
```

Typed-array buffers are **stable references** — `frame.magnitudes` is the same `Float32Array` every frame, mutated in place. Viz can cache the reference once.

## Error handling

```ts
class AudioSourceUnavailableError extends Error {
  kind:   'mediaElement' | 'microphone' | 'displayMedia' | 'file';
  reason: 'unsupported' | 'permission-denied' | 'no-audio-track' | 'decode-failed' | 'aborted';
}
```

Match on `.reason` in your UI to give users actionable messages.

## Browser support

| Browser            | mediaElement | microphone | displayMedia (tab audio) | file |
|--------------------|:------------:|:----------:|:------------------------:|:----:|
| Chrome desktop     | ✅           | ✅         | ✅                       | ✅   |
| Edge desktop       | ✅           | ✅         | ✅                       | ✅   |
| Safari desktop     | ✅           | ✅         | ❌ no audio track        | ✅ * |
| Firefox desktop    | ✅           | ✅         | ❌ audio flag ignored    | ✅   |
| Chrome mobile      | ✅           | ✅         | ❌                       | ✅   |
| Safari iOS         | ✅           | ⚠️ quirky  | ❌                       | ✅ * |

\* OGG Vorbis / Opus require Safari 18.4+ (April 2025). MP3 / AAC / WAV / FLAC universal.

Safari-specific quirks the library handles for you:
- `webkitAudioContext` legacy fallback
- AudioContext resume-on-user-gesture (touchstart / mousedown / keydown / click)
- iOS Safari: no `requestAnimationFrame` throttling workaround; the library falls back to setTimeout if rAF isn't available

What the library does **not** solve:
- iOS physical silent switch mutes all Web Audio output — no JS workaround exists.
- AudioContext sample rate lock on iOS (follows hardware, typically 48kHz). Library resamples nothing; analysis runs at whatever rate the context runs at.
- iOS Safari mic permission re-prompts on route changes (headphones plugged / unplugged).

## API reference (TypeScript)

```ts
import {
  // Source factories
  createMediaElementSource,
  createMicrophoneSource,
  createDisplayMediaSource,
  createFileSource,
  // Orchestrator
  createAudioEngine,
  // Detection
  detectCapabilities,
  isLikelyChromium,
  // Errors + types
  AudioSourceUnavailableError,
  type AudioFrame,
  type AudioSource,
  type AudioEngine,
  type AnalyzerOptions,
  type Capabilities,
} from 'sj-audio';
```

All factories accept `AnalyzerOptions`:

```ts
interface AnalyzerOptions {
  fftSize?: 1024 | 2048 | 4096;  // default 2048
  bands?: number;                 // default 32
  waveformSize?: number;          // default 256
  attackMs?: number;              // smoothing attack,  default 10ms
  releaseMs?: number;             // smoothing release, default 120ms
  mood?: Partial<Pick<AudioFrame, 'valence' | 'energy' | 'danceability' | 'tempoBPM'>>;
}
```

## Architecture

```
AudioContext (singleton)
        │
        ▼
AnalyserNode  ─────────►  AnalyzerReader (fftSize 2048, smoothing 0.8)
                                 │
                                 ▼                              in-place,
                         FramePipeline  ──►  AudioFrame  ─►  zero-alloc
                                 │                              per tick
                         ┌───────┼───────┬──────┬─────────┐
                         ▼       ▼       ▼      ▼         ▼
                    melBands   gate    agc   smoother  buildFrame
                      (32)   (adapt) (peak)  (asym    (glue)
                                             EMA)
                                                       onset/bpm
                                                       waveform
```

Analysis constants (mel boundaries, AGC taus, onset σ threshold, BPM smoothing, etc.) were ported verbatim from musicplayer-viz so visualizations tuned against that engine render identically on SJAudio.

## Development

```bash
npm i
npm test          # vitest
npm run typecheck # tsc --noEmit
npm run build     # rollup → dist/{esm,cjs,umd}.js + index.d.ts
```

Examples: open `examples/*.html` with a local static server (CORS friendliness):

```bash
npx serve .
# then visit http://localhost:3000/examples/esm-mediaelement.html
```

## License

MIT — Joe Villarreal.
