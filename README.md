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

## Workflows and the graph editor

The **Workflow** dropdown in the pipeline map chooses which stages run and what each runs after; every run (Analyze, and Run stage / up to here / from here) follows it. Built in: **Full pipeline**, **Transcript only** (Voz, Ear, Align), **Quick cut, no cleanup** (no Uhm or Clear), **Cut from an imported transcript** (no speech models), and **Audio cleanup only** (Clear).

Edit the workflow in the **Graph** view:
- **Connect:** drag from a stage's ● port onto another stage to make it run after it. The layout follows the new connection. Dragging near the graph's edge scrolls it.
- **Disconnect:** click a connection and press Delete, or click its ×. Keyboard: Tab to a connection, then Delete or Backspace.
- **Include or exclude:** use the stage's panel. Excluding a stage reconnects what ran after it to what it ran after. The same panel lists **Runs after** checkboxes for every other stage.

Loops, connections into Source and duplicates are refused with the reason; options that would loop are disabled. Below the editor, the workflow is checked live: a stage that nothing upstream gives a transcript (or a timeline) is flagged before you run, and optional inputs (Ear's language for Align, Clips for Laya, highlights for the Timeline) are noted. Excluded stages stay in place, dashed, so they can be included again.

An edit makes an unsaved draft (kept across reloads); **Save workflow** stores it by name in this browser, **Revert changes** returns to the saved version, and **Delete saved workflow** removes one. Built-ins cannot be overwritten or deleted, editing is locked during a run, and stored workflows are validated on load (unknown stages, bad edges and loops are dropped or rejected). The downloaded project JSON records the workflow it ran under. Workflows are declared in `site/pipeline/workflow.js`, with each stage's inputs and outputs in `site/pipeline/graph.js`.

## Demo projects

Panel 1 has a **Demo project** dropdown. Choosing a demo switches the whole app to a recorded run of this app, including the workflow it ran under: the source video, every stage's status in the grid and graph (with its history in the stage panel), the audit log, results, timeline and voice-over slots, and it opens the view the demo is about. Nothing is re-run on load; the audit says when it was recorded. Its conditions stay active, so **Run model pipeline** or a graph run repeats it live. Choosing a worked example or your own video clears them.

| Demo | Recorded run | Opens |
|---|---|---|
| Full pipeline, every model healthy | Analyze with all six real models, then frame-exact export | Grid |
| Transcript only workflow | Transcript only: Voz, Ear and Align, real models | Graph |
| Cut from an imported transcript | worked-example words straight to real Clips, then the timeline | Graph |
| Audio cleanup only workflow | Clear alone, real model | Graph · Clear |
| Clips fails → real Laya picks the excerpt | Clips marked failed; hosted Laya chose; other models real | Graph · Laya |
| Every model offline | every fallback in one run | Grid |
| Every model returns malformed output | validation rejects each contract break and the stage falls back | Grid |
| Voz fails → imported transcript | Voz alone from the graph; worked-example words used and flagged | Graph · Voz |
| Align returns crossing words | run up to Align; real Voz and Ear, then Align repair keeps ordered refinements | Graph · Align |
| Clear output rejected | Clear alone; wrong-rate audio rejected, original kept | Graph · Clear |
| Voz never answers → cancelled | Voz alone, then Cancel | Graph · Voz |

Injected faults replace only the named stage's model call, still pass through normal result validation, and are logged as injected, never as model inference. Demos are declared in `site/pipeline/demos.js`; recordings live in `site/demos/` and are made by `node tools/record-demos.mjs [id …]` (`--all` re-records everything; real-model demos download the models and take several minutes). Clear-enhanced audio is not stored in a recording; run Clear again before exporting to include it.

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
| `npm test` | unit | workflow rules (built-ins, connect/disconnect/include, input checks, 200 seeded edit sequences, untrusted storage); every demo recording is present, valid, honestly labelled and in its expected stage states; timelines and their exact boundaries, word validation, Laya endpoint allow-list, request shape, confidence range and hosted SSE parsing, status/router/graph layout, engine failure and abort semantics, reorder; seeded property checks that every valid transcript yields an exportable plan and that Align repair keeps only conflict-free refinements |
| `npm run test:integration` | integration | real stage modules + engine + planner with stubbed models: healthy run, Clips→Laya failover, double failure, all models offline, no invented speech, graph runs, export guard, cancellation, Ear language reaching Align, cancels never becoming fallbacks, Clips recovery, padded Voz word ends, Clear output checks |
| `npm run test:render` | integration | `tools/render.py` renders a planner timeline to exactly 1,350 frames with silent holds, refuses overwrite, and rejects every invalid plan the browser exporter rejects |
| `npm run test:smoke` | smoke | app boots without errors, every local link/module/model runtime loads, every CDN dependency in the runner import map responds. `PIPELINE_URL=… ` targets the deployed site |
| `npm run test:contracts` | e2e | every model runtime replaced by a stub: every demo project restores its recording into grid, graph, audit, results, timeline and route, and the no-download demos reproduce it live; healthy run order and payloads, 14 malformed or failing outputs rejected with fallback, hung model cancelled with its realm removed, edited timelines refused at export, voice-over reset and slot checks, corrupt saved layouts, unknown deep links |
| `npm run test:editor` | e2e | workflow dropdown reshapes graph and grid; real mouse drag-to-connect, loop/duplicate/source refusals, click + Delete, × and keyboard removal, include/exclude with bridging, runs-after checkboxes, live input checks, runs follow the workflow (stubbed models), save/update/revert/delete, drafts and saves survive reloads, locked during runs, untrusted storage, phone drag with edge auto-scroll |
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
