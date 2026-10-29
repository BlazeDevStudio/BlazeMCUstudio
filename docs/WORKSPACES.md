# Multi-project workspace collections (v0.4.8 development preview)

A **project** remains exactly one independently buildable target, with its own FQBN, source, libraries, pins, and sketch export. A **workspace** is a persisted membership collection of up to 100 existing project IDs. Projects may belong to multiple collections; no firmware images are merged or cross-compiled.

Use the left **Workspace collection** selector. Create a workspace, open/create projects, then **Add current** or **Unlink current**. The sidebar filters membership; **All projects** never hides an otherwise valid project. Multiple project tabs are now restored across application restarts, including the active target and selected workspace collection; only the active tab is edited or compiled. Switching saves outstanding changes. The tab layout is separate from firmware and never triggers builds or uploads. Closing a tab never deletes its source. Deleting a workspace destroys only the collection, not its projects.

Catalog is stored separately as `_workspaces.json` alongside local project folders with atomic replacement. Membership IDs are validated and must exist when linked. Trashed projects remain referenced and appear in `missingIds`, so recovery restores membership without silently dropping relationships. Corrupt catalogs fail closed; the independent project store remains available.

Not implemented here: live communication routing, executable cross-device firmware, multi-project simultaneous compilation, project ZIP bundles, shared asset indexes, physical device integration. The current workspace editor does not merge projects into one `.ino` or sign/upload firmware.

## Desktop layout recovery (new incremental development)

The local `_desktop_session.json` under the project-store root records only up to 32 unique, validated project UUID tabs, the active UUID and an optional workspace UUID. Writes use atomic replacement; independent firmware files are untouched. On startup, missing, trashed or malformed projects are not reopened or recreated. A removed workspace becomes **All projects** without deleting its tabs. Invalid or corrupt session JSON blocks automatic restoration and logs a recovery warning; users can still open projects through the sidebar. Closing a tab or trashing a project persists the new layout. This is not a crash journal for unsaved source edits.

## Planned device relationships (v0.4.8 preview)

A workspace can now persist a list of **planned communication links** between two existing member projects, with the intended transport: UART, I²C, SPI, Wi-Fi, ESP-NOW or Custom. Use the sidebar Device Link Planner to select source/target, add a plan and remove it. Links appear alongside each workspace and survive restart. These records do **not** create a wire, allocate pins, validate voltage logic levels, build a protocol stack, or alter/generated firmware. The selected technology is a human design declaration; board capability, core installation, physical levels and sharing remain to be verified before implementation.

The `_workspaces.json` v1 format accepts an optional `links` array for compatibility with older catalogs. New workspaces include an empty array. Each link has a UUID and validated endpoint membership, transport, and timestamp. Duplicate directed transport pairs, self-links and unknown transport types are rejected. A project moved to recovery remains associated and the link is flagged unavailable until restoration. Explicitly removing a project from the workspace removes associated planning links but never the project's firmware. Deleting a workspace removes its relationships, not member projects. Corrupt or tampered links fail closed and cannot overwrite firmware files.

Next admission gate: compatibility-aware source/target role selection, voltage/IO mapping, actionable warnings, and actual transport firmware generation for individually verified boards.

## v0.4.9 compatibility review (non-electrical)

Each persisted plan has a **Review compatibility** action. The read-only assessment resolves saved firmware projects and reports BLOCKED, REVIEW REQUIRED or UNKNOWN. Mismatched direct signal logic levels between Uno 5 V and ESP 3.3 V are blocked; no board pair is declared wired/working. The original topology and firmware remain unchanged. See [BOARD_COMPATIBILITY.md](BOARD_COMPATIBILITY.md).

## Default signal references (v0.4.10)

The **Pin reference** action on each saved plan opens the endpoint projects and displays documented UART, I²C or SPI GPIO defaults, proposed bus-controller direction, active firmware/peripheral pin collisions and known boot/voltage blockers. These are transient display recommendations, not saved pin allocations. No carrier-specific wiring or firmware is generated. See [PIN_REFERENCES.md](PIN_REFERENCES.md).

## Explicit saved signal selection (v0.4.11)

The **Assign pins** action lets users save a role-specific GPIO mapping for an existing UART, I²C or SPI link, and **Clear pins** removes it. The saved record is independent of firmware and does not allocate an actual connection. Collision and voltage validation fail closed; board/carrier-specific electrical compatibility and real communication remain unverified. See [SIGNAL_PLANS.md](SIGNAL_PLANS.md).
