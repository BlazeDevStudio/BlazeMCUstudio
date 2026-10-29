# Blaze MCU Studio — Migration provenance and release gates

Date of staging: 2026-10-29

- Official destination: `BlazingSystems/BlazeMCUstudio`, branch `migration/blaze-mcu-studio-v047-20261029`.
- Existing original destination main: `cbb64a690919eea1f76c768edc93bd04c58e9f0f`, untouched by this migration.
- Original source: `BlazingSystems/BlazingSystems-Experiments/expiremental/Blaze-MCU-Studio/`.
- **Exact imported source SHA:** `bc9b6902f3cb1577d3b50c7d34fb3245daffd7ca`, from the still-open [Experiments draft PR #211](https://github.com/BlazingSystems/BlazingSystems-Experiments/pull/211). PR base was `main` during discovery; dependency and PR head must be rechecked at promotion.
- Source complete staging commit: `817c6a5532624cea81d89ca2929c9e991afcb7a1` (before new CI/manifest files).

## Source integrity

All 72 source tracked files and directory structure were relocated into the destination root. A Git tree comparison at the exact pinned revisions established **72/72 matching Git blob SHAs and file modes**, no missing, changed, or extra source files. The old repository's original history and PR discussions remain intact. This is a content-preserving cross-repository import, not a copy of original commit ancestry.

## CI provenance and safety

Original CI at `BlazingSystems-Experiments/.github/workflows/blaze-mcu-studio-preview.yml` was used as a basis for the dedicated root-oriented workflow `.github/workflows/mcu-studio-ci.yml`. The new workflow retains original Windows unit tests, Arduino Uno/Mega/Nano compilation, Windows EXE packaging and GUI runtime smoke, plus pinned ESP8266/ESP32 firmware compilation matrix. It includes root-aware path filters, pull-request and main push validation, cancellation of repeatable runs, and the source/original workload's read-only GitHub token. It does not publish a GitHub release or sign with production keys. **The original workflow remains in Experiments, unchanged.**

Do not equate static assertions or emulator/CI compilation with verified physical ESP hardware. Real flash/relay GPIO, boot pins, connected peripherals and low-memory desktop acceptance require separate evidence. No release is authorized by this migration.

## Migration advancement requirements

1. Verify independent destination CI on its **exact PR head**. Inspect every Windows/ESP matrix job, artifact checksum and installer policy; no partial green promotion.
2. Reconcile any subsequent commits to the original Experiments PR #211 while the source is still active.
3. Preserve original PR discussion, attribution, original code and documented limitations until the actual destination is fully accepted.
4. Owner reviews final branch strategy, original source deprecation, and physically tested compatibility before considering production release. No merges or deletion have been performed.

**State: SOURCE_STAGED; release status is NOT VERIFIED.**
