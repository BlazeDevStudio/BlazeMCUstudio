# Board-specific pin and bus-role reference — v0.4.10 preview

This is a **read-only planning aid** for an existing workspace link. It resolves the saved firmware projects and uses the board FQBNs to display documented default signal pin numbers. It cannot declare wires connected, assign pins, establish voltage-safe circuits, alter the project source, or generate communication firmware.

The UI **Pin reference** button displays each endpoint's default signals. When selecting I²C or SPI, the source or target may be marked as the *proposed controller* for planning; the opposite endpoint is labeled *peripheral*. No implementation of the peripheral role or bus routing is implied. UART is shown as two peer TX/RX signals.

| Board selection (FQBN) | UART TX/RX | I²C SDA/SCL | SPI SCK/MISO/MOSI/CS | Logic |
|---|---|---|---|---|
| `arduino:avr:uno` | D1 / D0 | A4 / A5 | D13 / D12 / D11 / D10 | 5 V |
| `esp8266:esp8266:generic`, `nodemcuv2` | GPIO1 / GPIO3 | GPIO4 / GPIO5 | GPIO14 / GPIO12 / GPIO13 / GPIO15 | 3.3 V |
| `esp32:esp32:esp32` (classic) | GPIO1 / GPIO3 | GPIO21 / GPIO22 | GPIO18 / GPIO19 / GPIO23 / GPIO5 | 3.3 V |

References: [Arduino Uno R3 official board](https://docs.arduino.cc/hardware/uno-rev3/), [Espressif Arduino-ESP32 board pinout / test definitions](https://github.com/espressif/arduino-esp32/blob/master/.github/CI_README.md), [ESP8266 Arduino core reference](https://arduino-esp8266.readthedocs.io/en/latest/reference.html). These are default board/SoC pin *names*; they are not guarantees that every module or carrier breaks them out. No other board variants inherit them.

## Safety invariants

- Unknown board FQBNs do not inherit other chips' pinouts. Missing or trashed projects return BLOCKED.
- Cross-voltage Uno ↔ ESP direct wired signals remain **BLOCKED**, including after pins are displayed; no level converter is presumed.
- GPIO reserved for flash and GPIO used by active graph or flowchart logic, or claimed by existing peripherals, blocks the corresponding pin reference. It does not overwrite claims.
- Bootstrapping-sensitive GPIO and debug UART pins are disclosed. ESP8266 GPIO15 and ESP32 GPIO5 are examples of SPI CS defaults that can interfere with boot or require design review.
- I²C pull-up voltage, controller/peripheral support, shared ground, bus capacitance and addresses remain unverified; SPI peripheral firmware, CS direction, selected clock and modes remain unverified; UART USB/debug contention and TX/RX crossover remain unverified.
- Wireless and custom transports yield **no fictitious physical signal pins**.
- Status `review` means *no blocker from the limited checks*, **not** approved for wiring. Every response has `safeToWire:false` and `firmwareGenerated:false`.
- This stage never saves pin assignments to the firmware project, nor promises physical electrical safety or executable inter-device communication.

Next gates: reviewed carrier-specific pin connectors with real signal direction, optional staged allocation with source-linked usage conflicts, individually tested controller/peripheral Arduino firmware, and physical loopback/logic-level acceptance.
