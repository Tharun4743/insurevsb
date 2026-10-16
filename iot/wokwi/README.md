# INSURE Virtual ESP32 IoT Telematics Simulator (Wokwi)

## Overview
This folder contains the complete virtual IoT telematics simulation project for **INSURE**. It runs on an ESP32 microcontroller inside the **Wokwi** simulation environment without requiring physical hardware or paid cloud IoT brokers.

> **IMPORTANT NOTICE: ALL DATA IS EXPLICITLY SYNTHETIC**  
> All sensor readings (GPS, speed, acceleration, impact g-force, helmet state, and alcohol sensor levels) are generated programmatically for testing, demonstration, and algorithm verification. No real vehicle or physical sensor is used.

---

## 1. Simulated Vehicles & Devices
| Vehicle ID | Device ID | Vehicle Type | Default Coordinates |
| :--- | :--- | :--- | :--- |
| `INSURE-BIKE-001` | `ESP32-DEV-001` | Two-Wheeler / Electric Bike | Bangalore Tech Corridor (12.9716° N, 77.5946° E) |
| `INSURE-BIKE-002` | `ESP32-DEV-002` | Two-Wheeler / Commuter Bike | Bangalore Tech Corridor (12.9720° N, 77.5952° E) |

---

## 2. Virtual Hardware Wiring (`diagram.json`)
| Component | ESP32 GPIO Pin | Description |
| :--- | :--- | :--- |
| **Pushbutton (Red)** | `GPIO 18` | Instant Impact / Collision Trigger (Active LOW with internal pullup) |
| **Slide Switch** | `GPIO 19` | Helmet Detection Sensor (LOW = Helmet Detected, HIGH = Missing Helmet) |
| **Green LED** | `GPIO 22` | Heartbeat & Active Telemetry Transmission |
| **Red LED** | `GPIO 23` | Collision Warning & Critical Safety Alert |
| **Virtual WiFi** | Built-in NAT | Connects to `Wokwi-GUEST` automatically |

---

## 3. Four Configurable Driving Scenarios

### Scenario A — Safe Driving (`'A'`)
- **Speed:** Moderate (30–42 km/h).
- **Acceleration:** Smooth (0.2–0.8 m/s²).
- **Impact Sensor:** Normal nominal road vibration (~1.0g).
- **Helmet Status:** Detected (Safe).
- **Alcohol Sensor:** 0.00 ppm.
- **Outcome:** Normal telemetry recorded; safe driving score preserved.

### Scenario B — Risky Driving (`'B'`)
- **Speed:** Excessive / Overspeeding (85–115 km/h).
- **Acceleration:** Aggressive acceleration / harsh braking (> 4.0 m/s²).
- **Helmet Status:** Missing / Not Detected.
- **Alcohol Sensor:** Elevated (0.38 ppm).
- **Outcome:** Telemetry flagged as high risk; safety score lowers proportionally; no automatic claim triggered.

### Scenario C — Possible Collision Alert (`'C'` or Pushbutton)
- **Impact Sensor:** Sudden severe impact spike (7.4g).
- **Acceleration:** Severe deceleration (-18.5 m/s²).
- **Speed:** Sudden drop to 0 km/h.
- **Ignition:** Switched to OFF.
- **Outcome:** Possible collision event recorded; triggers a **provisional incident alert** in INSURE review dashboard; **fault status defaults to unknown** pending investigation.

### Scenario D — Two-Vehicle Correlated Incident (`'D'`)
- Dispatches correlated collision telemetry for **both** `INSURE-BIKE-001` and `INSURE-BIKE-002` at the same junction.
- Preserves distinct `eventId`, `sequenceNumber`, and `deviceId` for each vehicle.
- **Outcome:** Both vehicles receive provisional incident records without assuming fault on either party.

---

## 4. How to Run in Wokwi

### Option A: Wokwi Web Simulator (Zero Installation)
1. Go to [https://wokwi.com/projects/new/esp32](https://wokwi.com/projects/new/esp32).
2. Copy the contents of `sketch.ino` into the code editor.
3. Switch to the `diagram.json` tab in Wokwi and paste the contents of `diagram.json`.
4. Click the **Play (Start Simulation)** button.
5. Open the **Serial Monitor** at the bottom of the Wokwi window (115200 baud).

### Option B: VS Code with Wokwi Extension
1. Install the official **Wokwi Simulator** extension in VS Code.
2. Open this repository folder.
3. Open `iot/wokwi/diagram.json` and press `F1` -> `Wokwi: Start Simulator`.

---

## 5. Controlling the Simulation via Serial Monitor

Click inside the Serial Monitor and type any of these keys:
- `A` : Switch to **Scenario A** (Safe Driving)
- `B` : Switch to **Scenario B** (Risky Driving)
- `C` : Trigger **Scenario C** (Possible Collision Alert)
- `D` : Trigger **Scenario D** (Two-Vehicle Correlated Incident)
- `1` : Select `INSURE-BIKE-001` as the active vehicle
- `2` : Select `INSURE-BIKE-002` as the active vehicle
- `S` : Transmit one telemetry reading immediately
- `H` : Display the command menu

---

## 6. Connecting to Deployed Backend

In `sketch.ino`:
```cpp
char backendUrl[160] = "https://YOUR-ACTUAL-RENDER-HOST.onrender.com/api/iot/telemetry";
const char* DEVICE_KEY = "demo-wokwi-virtual-key-dev-only-2026";
```

> **SECURITY NOTE ON SIMULATOR CREDENTIALS:**  
> The key above is an isolated DEMO KEY intended strictly for public Wokwi simulation testing.  
> Never use this key for real telematics devices or production environments.  
> To generate a secure production secret, run:  
> `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`  
> and set `IOT_INGEST_API_KEY` in your Render backend environment variables.
