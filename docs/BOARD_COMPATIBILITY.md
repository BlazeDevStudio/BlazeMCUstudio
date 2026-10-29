# Board-aware planned link compatibility (v0.4.9 preview)

The workspace's **Review compatibility** action analyzes the two **saved** firmware projects and their selected planning transport through `core/link-advisor.cjs`. Its output is advisory; it never configures physical connectors, reserves inter-device pins, changes firmware, compiles a network stack, flashes a board or authorizes wiring. No UI result means "safe to wire."

## Classification

- **BLOCKED**: known direct logic-level conflict (e.g. 5 V Uno R3 vs 3.3 V ESP32/ESP8266 on UART/I²C/SPI), unknown curated board profile, unavailable/corrupted project, unsupported onboard wireless assumption, cross-family ESP-NOW unverified interoperability, or an existing in-project peripheral/pin collision.
- **REVIEW REQUIRED**: both endpoints have curated board profiles with no *known* blocker for the chosen transport. It still requires physical pinout, device roles, voltage/power review, firmware/protocol design and hardware acceptance.
- **UNKNOWN**: a custom transport has no approved electrical/protocol model, even for otherwise reviewed boards.

The labels are **not** a certification, and "review" never implies an implementation exists.

| Selected relation | Software admission note |
|---|---|
| UART | Hardware serial port existence and availability, TX/RX direction, USB UART contention, GND and baud must be verified for both boards |
| I²C | Controller/peripheral roles, pin mapping, pull-up voltage rail, addresses, clock and bus capacitance remain unresolved |
| SPI | Controller/peripheral roles, separate CS, SPI mode, clock, bus topology and voltage remain unresolved |
| Wi-Fi | Curated onboard radio expectation only for existing ESP8266 and classic ESP32 targets; no external Uno adapter is inferred |
| ESP-NOW | Same-family ESP pair is review-only; ESP8266↔ESP32 is blocked until independent cross-family protocol and SDK testing |
| Custom | No protocol validation; explicitly unknown |

Known profile source links live in `core/board.cjs` (`sourceUrl` for each curated profile). The Uno R3 is treated as **5 V logic**, generic/NodeMCU ESP8266 and classic ESP32 as **3.3 V logic**. Other ESP variants are not automatically assigned classic ESP32 GPIO maps. Board-level declarations still omit carrier-specific breakout/flash/PSRAM and external shield wiring details.

## Evidence and negative controls

Unit tests exercise mismatched 5 V/3.3 V wiring, ESP same-voltage review-only paths, unsupported board variants, external-radio requirements, mixed-family ESP-NOW, custom/unknown paths, configured pin collisions, and manual code uncertainty. A separate test asserts that workspace assessment opens the *persisted project IDs* and blocks when a project has been trashed. The packaged Electron GUI smoke checks that a planned Uno↔ESP32 UART relation visibly reports a blocker, then removes that plan.

Next admission: user-selected *real* physical pins and connector roles with verified board/carrier-specific provenance, transport-level implementation with independent compiler tests, and physical integration acceptance. No automatic hardware rewiring or code generation is enabled in this stage.

## Pin reference display (v0.4.10)

[PIN_REFERENCES.md](PIN_REFERENCES.md) contains the limited board/default pin table, curated source links and independent controller/peripheral role caveats. A pin reference is never a wiring certificate or generated firmware.
