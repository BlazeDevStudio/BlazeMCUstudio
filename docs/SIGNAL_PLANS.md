# Explicit link signal maps — v0.4.11 preview

This development increment adds **user-entered and saved** GPIO signal numbers for an existing planned workspace relation. Select a relationship, use **Assign pins**, type per-endpoint signals, choose which side is the proposed I²C/SPI controller, then save. **Clear pins** removes only the signal selections. The reference-pin viewer remains separate; defaults are not automatically copied or reserved.

Mappings are stored in the workspace catalog as the link's optional `pins` object:

```json
{"orientation":"source-controller","source":{"tx":"17","rx":"16"},"target":{"tx":"1","rx":"3"}}
```

The persisted schema v1 remains backward compatible with pre-existing links without `pins`. Supported signal keys are strictly: UART TX/RX; I²C SDA/SCL; SPI SCK/MISO/MOSI/CS. Radio/custom protocols intentionally have **no** physical pins in this planner.

## Hard gates

- Both endpoint UUIDs are read from **saved, existing workspace membership**, never accepted from the UI as a new identity.
- Assignment records require *exact* role keys, format-checked raw GPIO numbers and a known controller orientation. No unknown attributes or partial records; corruption fails closed without modifying firmware source.
- Physical board profiles must be curated. Disallow reserved/flash GPIO, output on input-only pins, duplicate pins within an endpoint, active visual-code pin ownership and project peripheral reservations.
- Another saved link in the **same workspace** cannot claim the same GPIO on a shared project. No inferred shared-I²C bus is admitted without an explicit bus model.
- The Uno R3 fixed UART, I²C and SPI signal routes and ESP8266 UART pins are restricted to curated references. ESP32 arbitrary signal selections remain only GPIO numbers: multiplexing, route feasibility and carrier access still require verification.
- **5V Uno ↔ 3.3V ESP direct UART/I²C/SPI assignments are blocked**, not saved with an ambiguous "review" label. No level shifter is implied.
- Manual source pin use cannot be proven automatically and is disclosed as an uncertainty. Hardware acceptance, board-specific IO matrix, electrical levels and bus peripheral driver availability remain external.
- Save/clear operates on `_workspaces.json` only. Projects, firmware files, build settings and physical hardware are never modified.

## Acceptance

Node tests cover valid persistent mappings, no firmware mutation, cross-voltage rejection, active/peripheral GPIO collision, cross-link conflict, duplicate role and input-only GPIO, unknown/tampered schema, fixed pin restrictions and removal. Packaged Windows Electron smoke tests actual UI save/clear with ESP32↔ESP8266, negative mixed-voltage rejection with Uno↔ESP32, and existing board/firmware regressions.

**This is a plan, not a real wire.** `safeToWire` and `firmwareGenerated` remain false. Actual hardware communication firmware, physical logic analyzer/level-shift checks and tested serial/I²C/SPI adapters are future separate acceptance gates.
