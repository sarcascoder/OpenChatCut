# Changelog

All notable changes to OpenChatCut are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases use [Semantic Versioning](https://semver.org/).

## [0.2.9] - 2026-08-20

### Added

- Desktop native inference now records CPU/GPU capabilities and selects CoreML/Metal, DirectML, CUDA, WebGPU, or CPU per supported workload; Linux packages now include the native inference workers and ONNX Runtime.

### Fixed

- Desktop imports again create durable managed media copies, keeping preview, normalization, and server-side export reachable after the original file moves or a removable volume is disconnected.
- Media processing now applies software encoder thread limits to output encoders, keeps CFR compatibility normalization for large VFR sources, routes probes through the shared low-priority launcher, and releases settled multipart metadata queues.
- The Agent run inspector refreshes its sidecar when opened, so the newest run, tool result, and context metrics appear immediately without reloading the editor.

## [0.2.8] - 2026-08-20

### Added

- Atlas Cloud text-to-music and Sonilo video-to-music/video-to-SFX providers are available from settings and native Agent tools, including asynchronous job recovery and license sidecars.
- The Agent now surfaces missing creative capabilities with an in-editor settings entry and returns actionable diagnostics for unavailable editing tools.

### Fixed

- Windows H.264 export now probes and uses NVIDIA NVENC, Intel Quick Sync, or AMD AMF when available, preserves automatic libx264 fallback, and avoids hardware-frame/CPU-filter conflicts during frame-rate conversion.
- External MCP registration now keeps a stable token and fallback port across desktop restarts, including first-launch race handling and per-profile isolation.
- Sonilo source matching, streamed uploads, response parsing, and persisted sound jobs were hardened so large inputs and interrupted sessions recover predictably.

## [0.2.7] - 2026-08-17

### Added

- Marking mode: while playing, the playhead follows the audible media element's own clock (with audio output-latency compensation), so beat markers stay locked to the sound even when the main thread stalls (#90).

### Fixed

- Server-run drafts failed with 'could not be persisted' after a tab switch or browser restart — the run capability was stored in sessionStorage (per-tab, wiped on close). It now persists in localStorage, and the draft error message carries the actual reason (403 capability lost / 404 run gone).

## [0.2.6] - 2026-08-17

### Added

- Transition badges on the timeline gain a right-click menu: five duration presets (0.2/0.3/0.5/1/2s) and remove-transition, without hunting through clip effect lists (#88).
- Renderer GL backend now resolves per platform: angle (Metal/D3D) on macOS/Windows, angle-egl on Linux, with CC_RENDER_GL override for diagnosis. GPU compositing benchmarked ~2.2x faster than software.

### Fixed

- Snapshot model ids (qwen3.7-plus-2026-05-26 style) now resolve to their base catalog entry, and the unknown-model fallback is grounded in the catalog (context 409,600 / output 65,536) with an in-editor estimate hint — no more 'request is too large' for catalog misses.
- project-store.verify redirects USERPROFILE on Windows so the check uses its temp root (#89).

## [0.2.5] - 2026-08-17

### Added

- User-adjustable UI scale (80%–150%) in Settings → Interface, with Ctrl/Cmd + Plus/Minus/0 zoom shortcuts persisted to the keystore; composes with the automatic shrink-to-fit window scaling (#85).
- End-to-end CI coverage for agent local-path import: whitelist containment, tool schema, browser gate, and a real main-process import chain (fingerprint, copy, probe, dedupe) run on every release (#84).

### Fixed

- Editor bridge heartbeat dropped offline (connected:false) when the desktop window was minimized or covered — Electron background throttling now disabled on both editor windows, verified at runtime in the platform smoke tests (#86).
- UI consistency pass: off-scale corner radii unified to the 0/2/4/6 scale, stray hardcoded colors (#f77, #e5866a, #a63d38) moved to --cc-* tokens so skins stay consistent.

## [0.2.4] - 2026-08-16

### Added

- Media-pool transcription: per-card transcribe button with live status badges, batch transcription from the asset menu, and an auto-transcribe-on-ingest policy (off / local engine / all engines) that protects cloud budgets by default.
- Transcript reader in the media pool: read the full transcript with timestamped paragraphs, copy full text, and step across every transcribed asset — in-page floating panel on web, independent draggable desktop window in the Electron build.
- Document attachments: drag md/txt/srt/csv into the composer, lazy-load docx (mammoth) and pdf (pdfjs-dist) parsing (#84).
- Local-path media import for the agent: import_asset / import_folder tools gated by the AGENT_IMPORT_ROOTS whitelist (#84).
- hf-cdn.sufy.com as a high-speed model download fallback source.
- User-selectable project storage location with safe media relocation; isolated development profiles stay isolated, and active SQLite stores are explicitly kept in place until snapshot-based relocation is available.
- followup answers and run timing persist across reloads; server-run output flushes every 2s so reloads keep it.

### Fixed

- Rotation-coded portrait footage (iPhone-style) was recognized as 16:9; the probe now honors rotation side-data/tags and reports the displayed aspect.
- FCPXML exports now include pathurl with native UTF-8 paths so DaVinci Resolve relinks Chinese-named media (#27).
- Server-run capability overrides are applied on the agent run path (#81).
- Shared-store fallback degrades safely when remote bootstrap fails; editor leases refresh during long polls (#63/#70/#71).
- Pool card control buttons (favorite / menu / transcribe) were swallowed by the card click-capture — clicks now reach them.

## [0.2.3] - 2026-08-14

### Added

- download_media and push_asset accept unlimited URL batches (the previous 4-URL cap forced the model to split calls; the server handles one URL per request and has no batch limit).
- Server runs now surface model reasoning in the chat Thinking Process block: native reasoning streams and inline <think>/<thinking> content forward as thinking-delta events, accumulate into the assistant message, and survive reloads.
- Long tool execution reports live progress on the chat status line (local ASR model load/download, cloud transcription polling status and elapsed wait).

### Fixed

- AI SDK chunk/step timers abort with a TimeoutError DOMException that was classified as non-retryable; transient provider stalls now retry automatically instead of failing the whole run after a silent 120s wait.
- A model calling a tool it used earlier in the conversation no longer fails with "Tool is not active for this request": canonical-but-inactive tools are admitted at execution time (activation is a token optimization, not a security boundary).
- Missing-audio-track errors now spell out the exact edit_track create call instead of the ambiguous "call edit_track action=list", which models misread as track tools being unavailable.
- The chat status line showed "writing arguments…" during tool execution (the server never streams argument deltas); it now shows "running…" or the live progress note.

## [0.2.2] - 2026-08-13

### Added

- Server-side execution is now the only Agent run path: the browser-side model loop is removed, Codex turns and vision image attachments flow through the server, and chat, runtime sidecar, drafts, settlements and proposals persist server-side through a single-writer ledger that survives refreshes and service restarts.
- The Agent loop no longer caps tool turns: the model decides when the task is done. Long runs are protected by transient-LLM-error retries (rate limit, timeout, 5xx, transport), parallel execution of read-only tools behind an exclusive barrier for mutating tools, pressure-driven context compaction with an automatic retry on context-window overflow, recovery closers for interrupted tool calls, and a rolling event window so long runs never die on the event cap.
- External MCP sessions now close durability and security gaps found by full-tool e2e testing: handoff-token upload admission, registry revision adoption after settlement, owner-gone session cleanup, same-window revision rebinding, and strict external session control tools.
- Desktop native ASR inference auto-enables in the Electron shell (opt-out), browser transcription defaults to the base tier, and cross-origin isolation enables threaded wasm in the browser.
- Text-only models now strip image attachments before the request instead of failing, and the output token budget follows the selected model.

### Changed

- Consecutive same-source clips share one decoder instance, reducing video instance count and playback contention on long split runs.
- The run inspector no longer repeats the model reply or the raw server event stream; it surfaces diagnostics only.
- The 60-minute music/audio analysis duration cap is removed.

### Fixed

- Left-edge trim on source-free clips could clamp at the preceding clip; left extension now works again (issue #75).
- CAS contention, settle races and server-restart recovery paths hardened across project documents and the agent runtime ledger; project-store writes no longer surface transient conflicts.
- Full-repo scan findings fixed across persistence, editor, UI, audio and ASR; usage panel metrics, follow-up questions and oversized tool results now work on the server-run path; YOLO approval mode reaches the server draft context.
- BytePlus ModelArk catalog entries completed and model size labels corrected to real download totals.

## [0.2.1] - 2026-08-11

### Added

- Added opt-in server-side execution for the built-in Agent on API models. A capability-bound local server now owns the model loop while the active editor continues to execute tools through the existing `EditorCommands` boundary; runs survive page refreshes and local service restarts, and the existing browser execution path remains the default.
- Added durable server-run events, ordered SSE replay, reconnect recovery, browser tool claim/result handoff, cancellation, proposal continuation, run inspection, and portable recovery metadata without granting the server direct timeline authority.
- Added a one-click `news-rough-cut` workflow that analyzes the selected news footage before editing, chooses duration from the available information, preserves complete speech, and limits the final soundtrack to the selected source footage's original onsite audio.

### Security

- Hardened server-run admission and recovery with loopback/same-origin request checks, per-run capabilities, idempotent request digests, bounded histories and event payloads, credential redaction, retention limits, and fail-closed ownership recovery.

## [0.2.0] - 2026-08-11

### Added

- Added opt-in AI SDK speech routing for OpenAI, Gemini, Mistral Voxtral, and Cartesia, plus cloud transcription through OpenAI, Mistral Voxtral, Deepgram, Groq, ElevenLabs Scribe, and Cartesia. AssemblyAI remains the default transcription route and on-device Whisper remains available; the Agent can discover configured providers and explicitly route to one without exposing credentials.
- Added in-app desktop updates: packaged Windows and Linux builds can check, download, retry, and install the next GitHub Release from the dashboard notice or Settings. Packaged macOS checks send users to the GitHub Releases download page instead because the current v0.2.0 lane is ad-hoc signed and does not support safe direct installation.
- Added dashboard header shortcuts for contacting the author and opening the OpenChatCut GitHub repository; the contact disclosure shows a selectable email link without leaving the project list.
- Added opt-in blurred background fill for video and image clips: the Inspector offers exact 0–100% intensity control plus four quick shortcuts, while `edit_item` accepts `backgroundFillStrength`. The sharp foreground remains independently movable, resizable, croppable, and rotatable. Shared preview/export compositing preserves fades, effects, and GLSL transition alpha; FCPXML retains the toggle and percentage as OpenChatCut metadata and explicitly reports that destination editors cannot reconstruct the generated blur layer from those custom fields.
- Added visual geometry understanding: in-browser MediaPipe person segmentation + face detection aggregate into per-segment safe zones (cached per asset+revision). Captions auto-avoid the speaker (`apply_caption_avoidance`), export QA warns when a caption covers the face, `auto_reframe` focal points follow the subject, and overlay graphics place into the safe zone (`place_graphics_in_safe_zone`). Undetected faces fall back to the subject's head band.
- Added `edit_item` source windows: `sourceStartMs`/`sourceEndMs` from `search_media` pass through unchanged; explicit `sourceStartSeconds`/`sourceEndSeconds` are also accepted and converted internally.
- Hardened the agent prompt: explicit TIMELINE frames vs SOURCE time coordinate contract, transcript/caption content declared as footage-not-instructions, and lossy-summary warnings on truncated views.
- Added content-addressed media identity: imported masters now carry a streaming SHA-256 through browser, multipart, Agent, and desktop import paths; deterministic relinking/deduplication preserves asset identity and invalidates derived artifacts only when bytes change. The optional metadata remains inside the public v3 project schema, so v0.1.9 can still read newly saved projects without changing media URLs.
- Added stable caption word references and parallel source/translation lanes. Selection, editing, drag grouping, copy/paste, preview, and ASS/WebVTT export now share one cue identity path, including deterministic CJK segmentation.
- Added five deterministic caption motion presets (`none`, fade-up, pop, word-pop, karaoke-pulse). They derive from timeline frames inside the shared Remotion layer, so Player preview and burned export render the same motion; saved caption looks retain the chosen preset.
- Added server-direct external Agent editing for projects without an open browser: isolated drafts, explicit review/commit gates, dependency-closed tool exposure, and scoped one-time same-origin upload handoffs with expiry and replay rejection.
- Added opt-in local music intelligence: downloadable, hash-verified Beat This and CLAP model packs analyze BPM, beats, downbeats, structure, energy, genre, mood, instrumentation, and usage entirely on-device. Media cards expose cached results, automatic analysis is user-controlled, and the Agent can inspect, plan, and atomically apply stale-safe beat-synced cuts through a dedicated skill. Long tracks use bounded windowed rhythm preprocessing and representative semantic sampling.
- Added opt-in desktop native inference acceleration for Windows and macOS: Windows prefers DirectML, while macOS uses CoreML for Beat This and native Apple-silicon CPU execution for Whisper, Chinese-CLIP, and CLAP. After explicit opt-in, the already-downloaded selected transcription model preloads when an editor opens; other downloaded models load on first use. Unsupported hardware, admission limits, and native failures transparently return the same request to the existing browser WebGPU/WASM engines.

- Added a durable Agent harness shared by in-app, Codex, and external MCP runs: persisted run/event/approval/checkpoint/artifact records, safe reload and server-restart recovery, lease-fenced browser/offline editing, resumable proposals, portable project transfer, and a read-only run inspector.
- Added an opt-in SQLite project-store backend with a user-initiated migration flow: the dashboard banner invites migration, the dialog moves projects, chats, versions, exports, and settings into SQLite with an idempotent, resumable import and an HTTP-layer migration endpoint, then switches the runtime atomically. JSON-file paths stay untouched in SQLite mode.
- Added self-healing editor session credentials: after a reload the editor re-establishes a valid project-store session without manual sign-in, cross-port deletion stays consistent, and sessionless startups remain read-only.
- Added platform-aware native inference routing on desktop: DirectML / CoreML / Apple-silicon workers are chosen per platform and transparently fall back to the browser engines.
- Added desktop development state isolation and watchable media folders.

### Changed

- Reduced Agent token use with request-scoped tool schemas, one-shot `ToolSearch` expansion, bounded tool-result/history compaction, provider prompt-cache hints, and an in-chat system/tool/history/cache usage breakdown.
- Upgraded the on-device Base transcription tier to the timestamp-capable Whisper export and gave transcription tools a dedicated five-minute execution window while preserving the 30-second default for unrelated Agent tools.
- Self-hosted Geist + Geist Mono as the UI typeface, removing the network font dependency.
- Made semantic-index sampling configurable per media import.

### Fixed

- Preserved follow-up message order in agent chats and reduced generation/persistence latency by cutting agent-chat hydration network round-trips.
- Kept newly saved projects on the public v3 schema for v0.1.9 compatibility, stopped read-only opens from rewriting projects or version snapshots, and made opt-in SQLite migration single-owner, transactional, resumable, and profile-aware.
- Hardened Agent cost and upload boundaries: an explicit cloud transcription provider always uses the paid-operation approval gate, upload receipts remain retryable until the asset edit commits, and upload finalization no longer starts transcription implicitly.
- Made watched-folder import ownership durable across renderer loss, isolated stale watcher generations, and made native ASR cancellation terminate the active worker immediately so media is not deleted or background inference left running.
- Preserved authored clip slots during relink, blocked any partially materialized blob export before job creation, and retained completed browser exports when a destination handle must be reselected.
- Made isolated development startup reuse only the exact Remotion-compatible cached headless-shell binary, avoiding browser downloads without accepting stale or mismatched executables.

## [0.1.9] - 2026-08-06

### Added

- Added a Skills tab to the library panel: creative workflows + installed custom skills with search, compact cards, edit (name/summary/body) and two-step delete for custom skills.
- Added `install_skill`: the Agent can install a complete GitHub skill repo (SKILL.md + references/scripts/assets/examples) into `~/.openchatcut/skills/<slug>/`, with GitHub API rate-limit fallback to a shallow git clone and `GITHUB_TOKEN` support.
- Skills now load in FULL on use: `load_skill` returns every file under the skill directory (no truncation), and custom skills get an auto-detected dependency check — foreign services (Codex image gen, ElevenLabs, …) are mapped onto configured local capabilities; missing ones are surfaced to the user with Settings guidance.
- Added local skill script execution (`run_skill_script`): whitelisted binaries (bash/node/python/ffmpeg/…) run inside the installed skill directory on the local machine — the equivalent of omp's skill-directory terminal, narrowed for safety.
- Added vision bypass: when the main model is not multimodal, images are described by a separate configured vision model before being passed to the agent; full vision model catalog and file-part vision input.
- Added system-proxy support for server-side fetch (undici global ProxyAgent) plus an HTTPS CONNECT tunnel for the LLM proxy — external APIs honor the user's local proxy (Clash, etc.).
- Added preview-source control: preview proxies are no longer auto-generated by default; the preview source switches between original / proxy / auto.
- Added official vendor icons (Xiaomi MiMo, Mureka, Fish Audio, StepFun) and MCP workflow prompts, approvalMode auto sessions, YOLO fully-automatic mode (paid tools skip confirmation), and the full internal tool surface exposed to external MCP agents (confirm-gated).

### Fixed

- Preview no longer flashes the UNFILTERED source frame when seeking clips with WebGL effects (Black & White Film etc.) — the effect canvas stays visible across seeks.
- Fixed text clips not showing / half-screen video display with transform keyframes (non-uniform scale axes resolve correctly in preview overlay and render).
- Preview playback stops at the end instead of looping; out-of-memory export failures (MCP-driven, e.g. hermes) are humanized with a raised render heap.
- Browser cookies are never forwarded to upstream providers (agent chat 431/400 errors on accumulated localhost cookies).
- Clips without an audio track no longer fail transcription; find_highlights reports friendly errors; export preflight names the failing media sources.

### Performance

- Hardware-accelerated decoding on every video path; constant-quality proxy encoding; semantic model warm-up.
- Local Whisper models now warm in the background after opening a project on both web and desktop, and immediately after a model download or provider switch; only the selected downloaded model is loaded, so warm-up never triggers an implicit download.

## [0.1.8] - 2026-08-06

### Added

- Added a user-visible custom-skill directory mirroring `~/.codex/skills` / `~/.claude/skills`: `~/.openchatcut/skills/<slug>/SKILL.md` (Windows `%USERPROFILE%\.openchatcut\skills\...`). `manage_skill create` installs there, hand-dropped SKILL.md files are discovered automatically, and the bundled *skill-creator* workflow guides skill authoring.
- Added slash-command skill selection in the agent chat: `/skill:<slug>` or `/<name>` opens a filtering picker, Tab/Enter activates the creative mode without touching the composer text, and the active workflow shows as a dismissible chip above the input.
- Added Agent redo (`redo_last_change`), named version history (`manage_versions` list/save/restore/delete), media-pool operations (favorite, delete with reference confirmation, relink), auto-grade analyze/apply, and track reorder — closing long-standing editor command gaps.
- Routed OpenAI text-to-image through the AI SDK `generateImage` (plain generation path), with gpt options mapped to provider metadata; the edits path keeps its multipart implementation.
- Added StepFun and BytePlus ModelArk Agent LLM providers (BytePlus fronts DeepSeek, GLM, and Doubao-Seed models behind one Ark-compatible endpoint with a swappable model id), plus WaveSpeed and BytePlus Seedream image generation, BytePlus Seedance video generation (sharing the seedance2/Volcengine task API and reference limits), and Inworld, Fish Audio, and Speechify text-to-speech providers — each with settings-panel configuration and connection testing.
- Added first-class ChatGPT subscription sign-in for the built-in Agent through the official Codex CLI, including isolated credential storage, browser/device-code OAuth, account and model discovery, model-specific reasoning-effort selection, model switching, and dynamic OpenChatCut tool calling. Claude Code subscriptions remain available through the existing local MCP connection without exposing Claude OAuth credentials.
- Added first-class Ollama and LM Studio Agent providers with configurable local endpoints, optional API keys, model discovery, and explicit model activation.
- Added validated 4K video export across browser and server render paths, producing a 2160-pixel short edge (`3840×2160` for 16:9 projects) with matching bitrate and quality-check expectations.
- Added professional timeline workflows: slip and rate-stretch modes, insert/overwrite placement, atomic multi-clip Inspector edits, nested sequences, source timecode, sync-lock groups, and persistent multicam range switching.
- Added durable generation and export jobs with refresh recovery, exact-first reruns, provider/reference preflight, editor-level background export state, cancellation, and structured terminal failures.
- Added scene-aware visual and spoken media search, source-versioned semantic artifacts, cached VAD evidence, immutable voice-isolation artifacts, and resumable AssemblyAI jobs.
- Added a model-aware Agent context meter and automatic semantic conversation compaction: older complete turns are reduced through bounded factual checkpoints near each model's reserve, recent turns and Codex tool evidence stay available, model switches keep the conversation, custom/local context limits are configurable, and API/Codex usage replaces estimates when providers report it.
- Added a versioned Agent model-capability catalog sourced from `models.dev`, exact per-model overrides, and settings visibility for context/input/output limits, tool calling, image input, and reasoning support across API and Codex backends; resolved values stay visible, and provider maximum-input ceilings are enforced for both main and summary requests.

### Changed
- Upgraded the AI SDK to 7.0.52: Anthropic prompt-cache TTL extended to 1h via provider options, SDK-native timeouts on every LLM call site (30s first chunk / 2min step / 30s tool, 60–90s caps on generateText), and the build chain now passes `tsc -b` strict checks.
- Selecting a creative workflow (slash command or picker) now only activates it — the composer text is never overwritten, and the active skill is shown as a chip; media asset cards are draggable from anywhere, not just the thumbnail.
- Unified selectable creative workflows and bundled Agent skills around `SKILL.md` + `load_skill` progressive disclosure. External MCP clients can now load guidance without an edit session, and selected workflow bodies no longer occupy the cached system prompt.
- Unified timeline geometry around playback-rate-aware source-time/source-window helpers, with one transition-reconciliation pass shared by move, retime, split, trim, ripple, and overwrite operations.
- Made selected effect and transition previews use the same deterministic GL frame, progress, uniform, aspect, and color pipeline as export, with explicit fallback states when full parity is unavailable.

- Virtualized large resource, media-pool, and timeline surfaces; thumbnails and media previews now activate only near the viewport or on hover, while timeline pointer work is frame-coalesced and magnetic snap points are cached for each gesture.
- Moved semantic duplicate detection into the existing worker with transferable typed vectors, and deferred Agent providers, tool executors, Google fonts, and the template compiler until their feature is used.
- Bounded rebuildable browser/server caches and multipart sessions, added source-versioned preview derivatives and a cancellable preview-proxy queue, and kept user source media outside automatic eviction.
- Made editor panel geometry viewport-relative so browser zoom and window resizing preserve user-adjusted proportions, with compact container-driven layouts for dense controls.
- Reorganized the inspector into contextual Basic, Video, Audio, and Animation tabs; moved secondary media and timeline actions into compact menus, and made the asset action menu available from right-click.
- Added deduplicated, retention-bounded automatic project versions after idle edits, at five-minute intervals, and before Agent-applied changes; manual named versions remain unbounded by automatic retention.
- Added Auto, smaller-file, recommended, high-quality, and bounded custom video-bitrate controls across browser and server export paths.
- Clarified that inspector controls affect the selected timeline clip rather than its source media, and improved property hierarchy, numeric-field affordances, and keyframe-control states.
- Refined the export workbench with aligned parameter rows, restrained selected states, clearer format/codec language, and an output summary covering codec, dimensions, frame rate, bitrate, and filename.
- Unified the Library panel tabs and nested-sequence list with compact typography, a restrained selection indicator, flat rows, and tabular duration metadata.
- Capped the Agent change-log dialog height and made its entry list independently scrollable with a fixed header and a scoped, visible scrollbar.

### Fixed
- Fixed agent skill deletion removing the kv entry but leaving the SKILL.md mirror (id-vs-slug mismatch); the mirror now deletes by slug. Also fixed dragging assets into subfolders (whole card draggable), the slash menu not scrolling with keyboard selection, and a white-screen crash on opening projects caused by a temporal-dead-zone reference.
- Corrected new provider defaults and probes against official API docs: Fish Audio's default model is now a valid catalog id (`s2.1-pro` instead of the unrecognized `speech-1.6`, which silently fell back), StepFun's default model is now the documented `step-3.7-flash`, and the Inworld connection probe uses the current Voice API (`/voices/v1/voices`) instead of the retired `/tts/v1/voices` path.
- Made server exports feed video effects from frame-accurate decoded media frames before running the WebGL pass, including midpoint-aligned seeks for fractional-rate footage such as 30000/1001, preventing stale, repeated, offset, or black frames after AI-applied color grading and other clip effects.
- Prevented off-playhead selected effects and transitions from reporting perpetual shader loading; real transient media waits now appear only after 160 ms, while durable fallback errors remain immediate.
- Preserved each clip's WebGL effects through transitions and removed per-frame fallback switching; the effect-aware timeline composition now remains visible while exact transition sources warm up.

- Prevented API and Codex Agents from claiming an edit succeeded after a tool returned or threw an unresolved failure; failed result envelopes now stay explicit, same-tool retries can recover, and uncorrected completion text is replaced with the real failure.
- Exported valid FCPXML 1.10 media representations with immutable original filenames and desktop source paths beside internal working copies, while removing absolute paths from portable project packages.
- Removed the default 10 GiB application-layer upload cap and stopped automatically optimizing compatible media solely for file size, dimensions, or bitrate; explicit upload limits and opt-in optimization remain available.
- Routed Electron local-media imports through a native filesystem bridge, so files larger than the HTTP body limit are copied directly into managed storage without buffering the entire source in the renderer.
- Fixed the Codex model selector disappearing after reopening Settings by keeping its picker mounted and automatically refreshing the signed-in account's model catalog.
- Blocked Agent submission until the configured model catalog is hydrated, and retried one transient gateway/network failure only before any model output is emitted.
- Added BOM/CRLF-tolerant SRT import into independent named caption tracks, and streamed local ASR media from the server to AssemblyAI through a same-origin, JSON-only route without browser-side multi-gigabyte `Blob` materialization.
- Made editor panel dividers keyboard-focusable and arrow-key resizable while preserving compact responsive timeline controls without overlap.
- Moved rendered frame files out of Chat Completions tool-result text and into native vision messages across OpenAI and compatible providers, preventing base64 payloads from exhausting the model context window during multi-step Agent edits; compatible models that reject visual input retry once with bounded text-only metadata.
- Aligned server-export media materialization with the renderer-visible timeline closure, isolated the browser editor bridge behind a process-local credential, and bounded generated-result header and idle-body waits so stalled providers remain recoverable.
- Made browser/server export cancellation reach the encoder, renderer, and destination writer while preserving an already committed success; restored jobs now terminalize safely and use registered cleanup policies instead of unlinking untrusted result paths.
- Made linked audio/video overwrite and split operations atomic, preserved transitions outside punched holes, validated transitions as unique binary seams, and corrected edited-transcript audio slip coordinates.
- Hardened asynchronous voice isolation, multicam sync, generation, and media-derivative commits with live project/item/source revision checks and durable semantic operation IDs.
- Made project-package publication transactional across browser and server storage, rejected HTML media fallbacks and cross-frame-rate nested sequences before export, and isolated a single MCP call cancellation from unrelated bridge calls.
- Restored cloud-only upload media from R2 before export, serialized concurrent hydrations, rejected HTML/non-media responses, and routed all remote probes through DNS/IP/redirect-pinned public fetches to block SSRF and rebinding.
- Made ASR jobs unique by asset/revision/generation, prevented progressive import callbacks from double-submitting paid transcription, and kept stale transcripts reviewable without letting them drive playback, export, search, or edits.
- Corrected rational source-timecode conversion, playback-rate-aware multicam sync, and GL transition endpoint sampling; multicam now rejects mixed rates atomically and transition progress deterministically reaches both 0 and 1.
- Hardened project-index writes, MCP runtime hydration, durable open-job retention, and multi-result generation checkpoints so metadata cannot be lost, old bridges cannot overwrite new state, resumable work is never evicted, and partial Seedance/Mureka outputs cannot be published as complete.

- Fixed Chromium export destination selection by using the save-file picker for single-file exports, reserving the directory picker for multi-file bundles, and invalidating stale file handles when the output filename changes.
- Serialized project saves through immutable snapshots, added close/switch flush barriers, and blocked destructive navigation after persistence failures.
- Rejected stale derived-media commits after relink, bound semantic/blob/ASR/generation outputs to source revisions, and staged project-package publication so failed imports never expose half-written projects.
- Bound MCP sessions to project/editor revisions, canceled queued and in-flight calls on timeout or transport close, and pruned expired sessions before request dispatch.
- Preserved the committed revision across deferred React state updates so external MCP clients can observe `applied`, and rejected every cross-transport tool call carrying another client's `editSessionId`.
- Added browser and server export-media preflight so missing media, invalid blob/local references, and nested-sequence errors fail before queueing or rendering.
- Fixed preview stalls at transition boundaries by preserving the incoming media element after the transition completes instead of remounting and re-seeking it.
- Balanced fixed-size resource-grid columns across the available panel width instead of leaving a large unused strip at the right edge.
- Standardized timeline toolbar control spacing on a shared four-pixel rhythm while preserving clear separation between editing-tool groups.
- Replaced duplicate two-line timeline track badges and names with one compact highlighted label: “V1” / “C1”.
- Rounded variable-speed values for display and matched presets with a tolerance, preventing IEEE-754 noise such as `1.0000000000000004×` from leaking into clip context menus.
- Serialized concurrent version mutations, retried failed automatic captures without dropping newer queued snapshots, and required a successful pre-change snapshot plus revision check before internal Agent edits are applied.
- Preserved requested bitrates during VP8/H.264 FPS retiming, including software-encoder fallback.
- Kept compact media menus inside the viewport at narrow panel widths and completed keyboard focus, dismissal, and inspector-tab semantics for the reorganized controls.

## [0.1.7] - 2026-07-29

### Added

- Added community resource packages with category-specific previews, creator and license metadata, review-ready exports, and install URLs shared by the website and editor.
- Added Extension Center discovery synced with the public resource catalog, plus URL/file installation and local enable, disable, and uninstall management.
- Added reusable resource export from the media pool so locally imported or Agent-generated assets can be packaged for contribution.
- Added first-run configuration guidance, direct media placement onto a chosen video track, contextual clip review comments, and expanded Agent review workflows.

### Changed

- Streamlined the resource library and Extension Center layouts, removed duplicate sample content, and documented the contribution and installation workflow in both READMEs.
- Added Ko-fi and Afdian sponsorship links to the project documentation.

### Fixed

- Installed URL packages now appear immediately in the Installed tab and remain manageable after reload.
- Fixed timeline drag feedback so the playhead guide remains visible while moving captions, video clips, and other timeline items.

## [0.1.6] - 2026-07-27

### Added

- Added an `undo_last_change` agent tool, so "undo that" works in chat. It restores the project state from before the last applied change as a normal proposed edit, meaning the user still confirms it and the revert itself stays undoable.
- Added per-track gap reporting to `read_project`, allowing the agent to find empty ranges without reconstructing them from every clip.
- Added precise Inspector controls with direct numeric entry, drag scrubbing, keyboard adjustment, and one-click resets while preserving keyframe-aware editing.

### Changed

- Editing tools now report what actually changed on the timeline instead of a bare success, so the agent no longer has to re-read the whole project after every edit. Ripple moves collapse into rules (`track / fromFrame / by / count`) rather than listing every displaced clip, with created tracks, removed ids, and a re-read hint when a change is too large to enumerate.
- Frame contact sheets now prefer moments where the picture actually changes, filling the rest with even sampling, so a locked-off shot no longer returns a grid of near-identical frames.
- Unified editor panel spacing, controls, typography, and state styling across the shell, library, media pool, preview, chat, timeline, and Inspector.
- Kept the volatile timeline snapshot out of the cached Agent prompt prefix, improving prompt-cache reuse without changing project context.

### Fixed

- Fixed FCPXML export writing unusable media paths: `/media/uploads/<name>` was emitted verbatim as `file:///media/uploads/<name>`, pointing at the filesystem root, so every clip imported into DaVinci Resolve or Final Cut was offline. Assets now resolve against the real media directory (honoring `MEDIA_DIR`) with per-segment URL encoding, so non-ASCII and spaced filenames relink correctly.
- Fixed FCPXML export flattening transcript-edited audio into one contiguous clip: deleted words came back in the NLE and the material after them was lost. Audio clips now export one clip per kept segment, sharing the same `keptSegments` source of truth as playback. Video clips keep playing continuously through word deletions, so they stay a single clip.
- Fixed Agent generation, progress, aborted-turn history, and media inspection paths so partial replies survive cancellation, image references retain their real MIME type, and frame extraction failures are surfaced and recovered consistently.
- Fixed generated-result downloads by retrying transient failures and retaining the remote URL when local persistence still fails.
- Fixed editor persistence and media lifecycle edge cases: pending autosaves now flush when leaving, and cleanup no longer deletes uploads still referenced by a project.
- Fixed invalid timeline state by healing out-of-range fades and keyframes on load, and by keeping edits within clip duration, source media, and cut boundaries.
- Fixed slider drags creating excessive undo steps and exposed keyframe controls only where the selected item supports them.
- Fixed semantic media search returning duplicate or weak matches by deduplicating results per asset and applying a relevance floor.

## [0.1.5] - 2026-07-27

### Fixed

- Fixed Gemini rejecting agent tool calls with 400 "missing a thought_signature in functionCall parts": thought signatures captured from responses were stored under one provider key but replayed from another, so multi-step tool loops always failed on the second request. Signatures now round-trip end to end (verified against the live Gemini API).
- Fixed tool schemas using numeric enums (sample rate, bitrate, channels, fps) being rejected by the native Gemini API; the allowed values now live in field descriptions with unchanged integer typing for every provider.
- Fixed the legacy single-provider config migration grafting the old generic Base URL onto whichever provider is currently selected: providers with any of their own configuration are no longer touched, so switching providers can no longer silently reroute requests to an old relay.

### Changed

- Switched Gemini, Kimi, Qwen, DeepSeek, and Mistral to their official AI SDK provider packages (`@ai-sdk/google`, `@ai-sdk/moonshotai`, `@ai-sdk/alibaba`, `@ai-sdk/deepseek`, `@ai-sdk/mistral`). Gemini now speaks the native API (`x-goog-api-key`, model-scoped paths) with thought signatures handled by the official provider; a custom Gemini Base URL must now point at a native API root (…/v1beta), not an OpenAI-compatible one. Providers without an official package (GLM, MiniMax, Xiaomi, OpenRouter) stay on `@ai-sdk/openai-compatible`.

### Added

- Added an `apply_layout` agent tool that arranges clips into named layouts — split screen, thirds, grid-4, picture-in-picture, and full-frame reset — computing non-stretching cover crops per slot in one undoable step, backed by a new crop primitive on clip transforms.
- Added a `remove_silence` agent tool that removes dead air on-device — a speech-relative level gate with breathing-room padding that never cuts music beds — ripple-closing gaps per track in one undo step, with a dry-run preview.
- Added an in-app external MCP connection guide on the dashboard and editor top bar, showing the live endpoint with copy-ready setup for Claude Code, Codex, Cursor, and Claude Desktop.
- Added an `inspect_color` agent tool that measures a frame by the numbers — luma black/white points, clipping percentages, warm-cool and green-magenta balance per luma band, saturation, and a 12-bin hue histogram — so the agent grades against measurements instead of eyeballing screenshots.
- Added a `detect_beats` agent tool with an on-device DSP beat tracker (no model download): bpm, confidence-gated beats and 4/4 downbeats in source seconds, timeline-frame mapping through clip trim and speed, and optional one-step beat/downbeat markers for music-synced cuts.
- Added a colorist-grade GLSL effect suite: three-way color wheels (lift/gamma/gain), levels (per-channel in/out points + gamma), highlights/shadows recovery, clarity (local-contrast unsharp), and an HSL qualifier (hue-ring secondary with hue shift / saturation / luma controls).
- Added volume keyframes for audio and video clips: the pen tool draws a 0–200% volume envelope directly on audio clips (drag points, right-click to delete), the inspector volume slider gains a keyframe rail, and `edit_item` accepts a `volume` keyframe channel — keyframes split, retime, and persist like every other channel.
- Added a `change_cam` agent tool for multicam switching: within a time range it keeps the target angle and removes the overlapping segments of the other listed angles (split at the bounds, no ripple, one undoable batch), warning when the target does not cover the whole range.

## [0.1.4] - 2026-07-26

### Added

- Added Xiaomi MiMo as a built-in OpenAI-compatible Agent provider.
- Added a Linux x64 AppImage desktop build to the release pipeline.

### Fixed

- The collapsed thinking block now also recognizes inline `<think>` tags streamed by DeepSeek, MiniMax, GLM, Qwen, MiMo, and relays, in addition to `<thinking>`, uniformly across all providers.
- The desktop app now falls back to a random port when 5199 is taken instead of failing to launch; external MCP clients should use the origin from the startup log in that case.
- Dragging a caption cue now clamps against its lane neighbors instead of overlapping them, and a cue dragged into a gap smaller than its own duration snaps back to its original position.

## [0.1.3] - 2026-07-23

### Added

- Added independent caption tracks, multiple caption tracks per sequence, manual caption creation, and track-type selection when creating a track.
- Added direct caption editing in the preview and timeline, including dragging a caption style onto the preview, moving captions, and trimming both edges.
- Added a PR-style Rate Stretch tool that preserves the source range while changing clip duration and playback speed.
- Added model-aware Agent parameters and provider validation for image, video, music, sound, and voice generation, including expanded MiniMax and Mureka support.
- Added OpenRouter as a built-in OpenAI-compatible Agent provider.

### Changed

- Moved standalone caption styling and manual editing into the dedicated Captions workspace, with a direct “Caption styles” entry from Transcript.
- Improved local transcription source recovery by falling back to IndexedDB media and the original clip when extracted audio is unavailable.
- Added Ctrl/Command + mouse-wheel zoom to the motion-tracking target picker.

### Fixed

- Fixed `promptOptimizer` being sent to non-MiniMax image models; it is now emitted only for MiniMax `image-01`.
- Fixed Agent thinking content rendering raw Markdown instead of formatted, collapsible content.
- Fixed motion-tracking previews opening on a black first frame for affected videos.
- Fixed imprecise floating-point playback-speed labels and clarified exiting Rate Stretch mode.

## [0.1.2] - 2026-07-21

### Added

- Added WebCodecs-accelerated browser video export with live progress, cancellation, and automatic fallback to the compatible server renderer.
- Added multi-provider stock search across Pexels, Pixabay, Unsplash, and Freesound with media type, orientation, category, platform, deduplication, and partial-result handling.
- Added richer Agent editing controls for track-scoped scripts and captions, timeline frame and marker targeting, exact template placement, voice-isolation attachment, and structured follow-up widgets.
- Added reusable Motion Graphic exports as ProRes 4444 MOV files alongside FCPXML references, plus design-style thumbnails and scenario metadata.
- Added real-time export progress with processed/total frame counts and estimated time remaining.
- Added hardware-aware local H.264 encoding with VideoToolbox on macOS, NVENC on supported Windows render paths, FFmpeg hardware-encoder probing, and automatic software fallback.
- Added tracked domain-level checks for desktop, server, Agent tools, editor, captions, persistence, shaders, and export behavior.

### Changed

- Exact template placement now scales playback rate, fades, keyframes, zoom animation, and transitions together so retimed templates preserve their original visual rhythm.
- Caption sources now keep a stable explicit order, while repeated Agent proposal operations are compacted only when their arguments truly match.
- Made Remotion render concurrency CPU- and memory-aware, and added a configurable global heavy-export queue to avoid resource contention.
- Normalized variable-frame-rate media before Remotion playback and preserved H.264 bitrate ceilings across hardware and software normalization paths.

### Fixed

- Restricted rich-widget media previews to trusted same-origin, blob, and safe data URLs to prevent unintended external or local-network requests.
- Fixed silence markers being attached to the wrong segment, Motion Graphic render-cache collisions across durations, and FCPXML references diverging from downloaded MOV filenames.
- Fixed automatic export QA bypassing verification when browser rendering succeeded by routing QA-enabled exports through the verifiable server artifact path.
- Fixed concurrent exports overcommitting local CPU and memory while queued jobs now remain discoverable until they actually start.
- Fixed failed or timed-out export, frame-rate conversion, and media-normalization jobs leaving partial temporary files behind.

## [0.1.1] - 2026-07-21

### Added

- Added configurable built-in Agent providers for Anthropic, OpenAI, Gemini, Kimi, Qwen, GLM, DeepSeek, MiniMax, Mistral, and custom OpenAI-compatible APIs.
- Added provider-specific API key, Base URL, model configuration, connection checks, and model discovery.
- Added multi-provider runtime architecture diagrams and a Discord community link.

### Changed

- Migrated the built-in Agent runtime to the Vercel AI SDK provider abstraction.
- Restricted the desktop release workflow to manual execution and reduced its token permissions.

## [0.1.0] - 2026-07-20

### Added

- Initial public release of the local-first, agent-native OpenChatCut video editor.
- Added editable multitrack projects, media management, transcript-driven editing, preview, effects, transitions, motion graphics, LUTs, and production exports.
- Added built-in Agent tools and MCP access for Codex and Claude Code.
- Added Electron desktop packaging for macOS, Windows, and Linux.

[0.2.1]: https://github.com/0xsline/OpenChatCut/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/0xsline/OpenChatCut/compare/v0.1.9...v0.2.0
[0.1.9]: https://github.com/0xsline/OpenChatCut/compare/v0.1.8...v0.1.9
[0.1.8]: https://github.com/0xsline/OpenChatCut/compare/v0.1.7...v0.1.8
[0.1.7]: https://github.com/0xsline/OpenChatCut/compare/v0.1.6...v0.1.7
[0.1.6]: https://github.com/0xsline/OpenChatCut/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/0xsline/OpenChatCut/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/0xsline/OpenChatCut/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/0xsline/OpenChatCut/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/0xsline/OpenChatCut/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/0xsline/OpenChatCut/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/0xsline/OpenChatCut/releases/tag/v0.1.0
