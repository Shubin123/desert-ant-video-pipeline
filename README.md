# Desert Ant video pipeline

Independent integration by Shubin123. [Live Pages demo](https://shubin123.github.io/desert-ant-video-pipeline/).

Choose a video or load the supplied 1b/2b example. Run Voz → Ear → Uhm → Align → Clips → Clear sequentially, inspect the per-step audit, review the editable frame timeline, record/import voice-over into silent slots, and export H.264/AAC MP4 locally. All 18 individual model demos are linked.

The published worked edits use the newer `1b.mp4` and `2b.mp4`, not the older lecture files: 120 and 45 seconds respectively, unchanged narration speed, portrait/landscape preserved. Example transcripts were generated with MLX Whisper tiny and are explicitly labeled, not represented as Desert Ant results. Curated edits are editorial work, not claimed automatic Clips output. Run the on-device pipeline to generate new results.

## Failover

Every failure is logged. Clips failure can call the real official Laya Space or a user-configured compatible `/v1/systemone` endpoint, with explicit text-sharing consent. Laya answers are validated against offered choices; confidence below .65 requires review. No fabricated inference: Laya cannot transcribe, enhance audio, generate narration, align words, recognize faces, or encode video. Missing transcription requires imported timestamped words. Failed Align preserves existing timestamps; Uhm preserves speech; Clear preserves original audio. If Laya is unavailable, sentence selection is labeled deterministic and requires review. Unsupported browser encoders require the local FFmpeg renderer or an external editor.

The browser exporter preserves speed, validates source bounds, and requires exactly 1,350 or 3,600 frames. Source videos are never modified. Original NotebookLM watermarks are retained. Public samples were published at the user's request. Microphone recordings remain local; downloaded project JSON does not embed recordings.

## Run locally

`python3 -m http.server 8080 --directory site`, then visit localhost:8080. Browser models require CDN/Hugging Face access and substantial RAM. Models are isolated in short-lived same-origin iframe realms. No model weights or credentials are committed. SDK anonymous usage telemetry may be sent without input/output content.

## Local export fallback

Download timeline + audit JSON and run `python3 tools/render.py pipeline-project.json /path/to/source.mp4 /path/to/output.mp4`. Requires FFmpeg. Uses original-speed narration, silent holds, and exact 30fps frame counts. This fallback does not embed browser-recorded voice-over or Clear-enhanced samples; import original recordings in your editor. It refuses overwrite.

## Verification and limits

See [verification.json](site/verification.json) and automated tests in `tests/`. Individual model checks: 14 browser inference passes, Title through local Mac engine, and three honest access/integration checks (Eye, Face, Who), not inference passes. Headless Chrome blocks GitHub Pages → loopback Title access under Local Network Access; local Title site works.

`npm install && npm test` runs timeline/safety checks. With system Google Chrome and FFmpeg installed, `npm run test:browser` checks real hosted Laya decisions and a frame-exact browser MP4. `FULL_PIPELINE=1 npm run test:browser` also runs the original models on the supplied 2b material. `npm run test:voice` verifies 120-second portrait export, rejects a recording longer than its slot, and checks a two-second tone splice followed by silence. `npm run test:failover` deliberately blocks model-runtime downloads and verifies that all six failures recover, including real hosted Laya selection. Injected failures are labeled test faults, not model inference passes. These tests write auditable JSON reports and ignored local test-output artifacts.

The exact browser exporter performs a final encoded-packet remux to remove AAC tail padding without changing the video frame count. Both local worked edits also pass complete decode, silent-slot, and silent-companion picture-identity checks.

Laya is a separate upstream model by Convai Innovations / Nandha Kishor M (Apache-2.0). It is not a Desert Ant product. Cloud Laya sends excerpt text only, never the video/audio. External service uptime/rate limits are outside this project's control.

## Attribution

Models, SDK, and adapted Uhm/Align/Clips pipelines © 2026 Desert Ant Labs B.V. under Desert Ant Labs Source-Available License v1.0. See [ATTRIBUTION.md](ATTRIBUTION.md) and [LICENSE.md](LICENSE.md). Not endorsed by Desert Ant Labs.
