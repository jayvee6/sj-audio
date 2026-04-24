# SJAudio

Cross-browser web audio capture + analysis library for music visualization.

Four source adapters — `<audio>`/`<video>` element, microphone, tab/system audio, file upload — plus a unified `createAudioEngine` orchestrator with graceful fallback when a browser doesn't support a given source (notably Safari + Firefox, which silently drop audio from `getDisplayMedia`).

Ships as ESM + CJS + UMD. Drop-in via `<script>` tag → `window.SJAudio`. No npm publish — distributed via GitHub tag + jsdelivr CDN.

## Status

v0.0.1 — scaffolding. See [chunked plan](../../.claude/plans/can-we-build-our-mossy-barto.md).

## Install (planned — chunk 24)

```html
<script src="https://cdn.jsdelivr.net/gh/joeyvillarreal/sj-audio@v0.1.0/dist/sj-audio.umd.js"></script>
<script>
  const engine = SJAudio.createAudioEngine({ mediaElement: document.querySelector('audio') });
  engine.start();
  engine.onFrame(frame => { /* drive viz */ });
</script>
```

## License

MIT
