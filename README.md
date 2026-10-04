# Desert Ant video pipeline

Independent integration by Shubin123. [Live Pages demo](https://shubin123.github.io/desert-ant-video-pipeline/).

Choose a video or load the supplied 1b/2b example. Run Voz → Ear → Uhm → Align → Clips → Clear sequentially, inspect the per-step audit, review the editable frame timeline, record/import voice-over into silent slots, and export H.264/AAC MP4 locally. All 18 individual model demos are linked.

The published worked edits use the newer `1b.mp4` and `2b.mp4`, not the older lecture files: 120 and 45 seconds respectively, unchanged narration speed, portrait/landscape preserved. Example transcripts were generated with MLX Whisper tiny and are explicitly labeled, not represented as Desert Ant results. Curated edits are editorial work, not claimed automatic Clips output. Run the on-device pipeline to generate new results.

## Failover

Every failure is logged. Clips failure can call the real official Laya Space or a user-configured compatible `/v1/systemone` endpoint, with explicit text-sharing consent. Laya answers are validated against offered choices; confidence below .65 requires review. No fabricated inference: Laya cannot transcribe, enhance audio, generate narration, align words, recognize faces, or encode video. Missing transcription requires imported timestamped words. Failed Align preserves existing timestamps; Uhm preserves speech; Clear preserves original audio. If Laya is unavailable, sentence selection is labeled deterministic and requires review. Unsupported browser encoders require the local FFmpeg renderer or an external editor.

The browser exporter preserves speed, validates source bounds, and requires exactly 1,350 or 3,600 frames. Source videos are never modified. Original NotebookLM watermarks are retained. Public samples were published at the user's request. Microphone recordings remain local; downloaded project JSON does not embed recordings.

## Architecture

The page is a single-page app built from small ES modules. `site/pipeline/graph.js` declares every stage, its dependencies and its fallback; `engine.js` runs stages in dependency order, one model at a time; `steps.js` holds each stage's work and the inputs it needs; `words.js` validates timestamps and repairs Align output. `site/ui/` renders the same live status as a **Grid** of stage cards or a **Graph** of the dependency chain, with Laya drawn as a dashed failover branch. Routes are hash-based: `#/grid`, `#/graph`, and `#/graph/clips` opens one stage. To add a stage, add a node to the graph and a step with the same id.

Every stage is clickable. From its panel you can **Run stage** (only that model), **Run up to here** (the stage and everything it depends on) or **Run from here** (the stage and everything after it, through export). A stage whose inputs are missing says which stage to run first; nothing is invented. Laya normally runs only after a Clips failure, but runs when you choose it directly.

Stage cards and the four workflow panels can be dragged into any order (touch: use the ⠿ grip), or moved with Alt + arrow keys. The order is remembered in this browser; **Reset layout** restores it.

Align refines each word separately, so neighbouring words can cross. Rather than discarding the whole result, the pipeline keeps every refined word that stays in order and reverts only the conflicting ones (the one that drifted further) to the Voz timing, and logs how many were kept.

## Run locally

`python3 -m http.server 8080 --directory site`, then visit localhost:8080. Browser models require CDN/Hugging Face access and substantial RAM. Models are isolated in short-lived same-origin iframe realms. No model weights or credentials are committed. SDK anonymous usage telemetry may be sent without input/output content.

## Local export fallback

Download timeline + audit JSON and run `python3 tools/render.py pipeline-project.json /path/to/source.mp4 /path/to/output.mp4`. Requires FFmpeg. Uses original-speed narration, silent holds, and exact 30fps frame counts. This fallback does not embed browser-recorded voice-over or Clear-enhanced samples; import original recordings in your editor. It refuses overwrite.

## Verification and limits

See [verification.json](site/verification.json) and automated tests in `tests/`. Individual model checks: 14 browser inference passes, Title through local Mac engine, and three honest access/integration checks (Eye, Face, Who), not inference passes. Headless Chrome blocks GitHub Pages → loopback Title access under Local Network Access; local Title site works.

## Tests

`npm install`, then:

| Command | Type | What it checks |
|---|---|---|
| `npm test` | unit | timelines, Laya safety, stage graph order/layout/selection, engine subsets and input checks, reorder, Align repair (randomized) |
| `npm run test:integration` | integration | real stage modules + engine + planner with stubbed models: healthy run, Clips→Laya failover, double failure, all models offline, no invented speech, graph runs, export guard, cancellation |
| `npm run test:smoke` | smoke | app boots without errors, every local link/module/model runtime loads, every CDN dependency in the runner import map responds. `PIPELINE_URL=… ` targets the deployed site |
| `npm run test:ui` | e2e | every stage clickable in both views, Run stage / up to here / from here with models blocked, missing-input messages, cancel, drag and keyboard reorder, persistence, reset, blocked storage, phone layout |
| `npm run test:browser` | e2e | grid/graph routing and deep links, real hosted Laya decision, frame-exact 45 s browser MP4 |
| `npm run test:voice` | e2e | 120 s portrait export, oversized recording rejected, tone splice then silence |
| `npm run test:failover` | e2e | all six model downloads blocked; every stage recovers, real Laya selects |
| `npm run test:stages` | real models | each model started on its own from the graph must complete real inference, then Timeline and Export |
| `FULL_PIPELINE=1 npm run test:browser` | real models | the whole pipeline on the supplied 2b material |
| `npm run test:all` | all | every suite with a summary table; `FULL=1` adds the two real-model suites |

Browser suites need system Google Chrome; export suites need FFmpeg. Injected failures are labeled test faults, not model inference passes. Suites write auditable JSON reports to `site/` and other output to the ignored `test-output/`.

The exact browser exporter performs a final encoded-packet remux to remove AAC tail padding without changing the video frame count. Both local worked edits also pass complete decode, silent-slot, and silent-companion picture-identity checks.

Laya is a separate upstream model by Convai Innovations / Nandha Kishor M (Apache-2.0). It is not a Desert Ant product. Cloud Laya sends excerpt text only, never the video/audio. External service uptime/rate limits are outside this project's control.

## Attribution

Models, SDK, and adapted Uhm/Align/Clips pipelines © 2026 Desert Ant Labs B.V. under Desert Ant Labs Source-Available License v1.0. See [ATTRIBUTION.md](ATTRIBUTION.md) and [LICENSE.md](LICENSE.md). Not endorsed by Desert Ant Labs.
