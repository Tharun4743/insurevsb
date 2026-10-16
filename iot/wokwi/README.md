   # INSURE Virtual ESP32 IoT Telematics Simulator (Wokwi)

## Overview
This folder contains the complete virtual IoT telematics simulation project for **INSURE**. It runs on an ESP32 microcontroller inside the **Wokwi** simulation environment without requiring physical hardware or paid cloud IoT brokers.

> **IMPORTANT NOTICE: ALL DATA IS EXPLICITLY SYNTHETIC**  
> All sensor readings (MPU6050 accelerometer, potentiometer alcohol level, helmet latch switch, speed, and GPS) are simulated or generated programmatically for testing, demonstration, and fair actuarial algorithm verification. No real vehicle, living rider, or physical chemical sensor is used.

---

## 1. Simulated Vehicles & Devices
| Vehicle ID | Device ID | Vehicle Type | Default Coordinates |
| :--- | :--- | :--- | :--- |
| `INSURE-BIKE-001` | `ESP32-DEV-001` | Two-Wheeler / Electric Bike | Bangalore Tech Corridor (12.971600° N, 77.594600° E) |
| `INSURE-BIKE-002` | `ESP32-DEV-002` | Two-Wheeler / Commuter Bike | Bangalore Tech Corridor (12.972000° N, 77.595200° E) |

---

## 2. Complete Virtual Hardware Wiring (`diagram.json`)

| Component | ESP32 Connection | Pin Mode | Functional Purpose |
| :--- | :--- | :--- | :--- |
| **MPU6050 VCC** | `3V3` | Power | 3.3V power supply |
| **MPU6050 GND** | `GND` | Ground | System Ground |
| **MPU6050 SDA** | `GPIO 21` | I²C Data | 6-DOF Accelerometer I²C Data line |
| **MPU6050 SCL** | `GPIO 22` | I²C Clock | 6-DOF Accelerometer I²C Clock line |
| **Pushbutton (Red)** | `GPIO 18` and `GND` | `INPUT_PULLUP` | Instant Collision Impact trigger (Active LOW) |
| **Slide Switch** | `GPIO 19` and `GND` | `INPUT_PULLUP` | Helmet Latch Sensor (LOW = Safe/Detected, HIGH = Missing) |
| **Potentiometer VCC** | `3V3` | Analog Reference | High rail for voltage divider |
| **Potentiometer GND** | `GND` | Ground | Low rail for voltage divider |
| **Potentiometer SIG** | `GPIO 34` | `INPUT` (ADC1_CH6) | Simulated breath alcohol reading (0–4095 ADC -> 0.00–0.80 ppm) |
| **Green LED Anode** | `GPIO 25` via 220Ω resistor | `OUTPUT` | Normal connected status / Telemetry heartbeat |
| **Green LED Cathode** | `GND` | Ground | Return |
| **Red LED Anode** | `GPIO 26` via 220Ω resistor | `OUTPUT` | Collision alert / Critical safety warning |
| **Red LED Cathode** | `GND` | Ground | Return |
| **Piezo Buzzer (+)** | `GPIO 27` | `OUTPUT` | Acoustic collision warning siren |
| **Piezo Buzzer (-)** | `GND` | Ground | Return |
| **Virtual WiFi** | Built-in NAT | Station | Connects to `Wokwi-GUEST` automatically |

---

## 3. Configurable Demonstration Scenarios

### Scenario A — Safe Commute (`'A'`)
- **Speed:** Moderate (30–42 km/h).
- **Helmet Status:** Detected (Safe).
- **MPU6050 Accel:** Smooth road vibration (~0.2–0.8 m/s²).
- **Potentiometer Alcohol:** Clear (0.00 ppm).
- **Visuals:** Green LED ON, Red LED OFF, Buzzer silent.
- **Outcome:** Normal telemetry recorded; safe driving score (~90–95) preserved.

### Scenario B — Risky Driving (`'B'`)
- **Speed:** Excessive / Overspeeding (~95–110 km/h).
- **Helmet Status:** Dynamically responds to Slide Switch.
- **Potentiometer Alcohol:** Dynamically responds to knob position (0.00–0.80 ppm).
- **MPU6050 Accel:** Active virtual motion readings captured.
- **Outcome:** Telemetry flagged as high risk; safety score lowers proportionally once >= 5 readings accumulate; no automatic claim triggered.

### Scenario C — Possible Collision Alert (`'C'` or Hardware Pushbutton)
- **Impact Sensor:** Sudden severe impact spike (7.42g).
- **Deceleration:** Extreme braking deceleration (-18.5 m/s²).
- **Speed:** Drops instantly to 0 km/h; Ignition switches to OFF.
- **Audio/Visual:** Red LED illuminates and Piezo Buzzer sounds warning beep.
- **Outcome:** Triggers a **provisional collision alert** in INSURE review dashboard; **fault status defaults to strictly UNKNOWN** pending human adjuster investigation.

### Scenario D — Two-Vehicle Correlated Crash (`'D'`)
- Dispatches correlated collision telemetry for **both** `INSURE-BIKE-001` and `INSURE-BIKE-002` at the same junction.
- Preserves distinct `eventId`, `sequenceNumber`, and `deviceId` for each vehicle.
- **Outcome:** Both vehicles receive provisional incident records without assuming fault on either party.

### Command R — Reset (`'R'`)
- Silences the active buzzer siren.
- Turns off the red collision LED and restores the green heartbeat LED.
- Returns scenario state to Safe Commute while preserving sequence-number monotonicity.

---

## 4. How to Open and Run in Wokwi (Browser Tab 1)

### Option A: Wokwi Web Simulator (Zero Installation — Recommended)
1. Open your browser and navigate to: **[https://wokwi.com/projects/new/esp32](https://wokwi.com/projects/new/esp32)**.
2. Select the **`diagram.json`** tab in Wokwi, select all, and paste the contents of `iot/wokwi/diagram.json`.
3. Select the **`sketch.ino`** tab, select all, and paste the contents of `iot/wokwi/sketch.ino`.
4. Click the green **Play (Start Simulation)** button at the top.
5. In the bottom pane, the **Serial Monitor** will start at 115200 baud:
   - Wi-Fi connects to `Wokwi-GUEST`.
   - The MPU6050 accelerometer initializes at address `0x68`.
   - Outgoing HTTPS POST telemetry requests will stream to the backend.

### Option B: VS Code with Wokwi Extension
1. Install the official **Wokwi Simulator** extension from the VS Code Marketplace.
2. Open this repository folder.
3. Open `iot/wokwi/diagram.json` and press `F1` -> `Wokwi: Start Simulator`.

---

## 5. Controlling the Simulation via Serial Monitor

Click inside the Serial Monitor terminal and type any of these keys:
- `A` : Switch to **Scenario A** (Safe Driving)
- `B` : Switch to **Scenario B** (Risky Driving)
- `C` : Trigger **Scenario C** (Possible Collision Alert)
- `D` : Trigger **Scenario D** (Two-Vehicle Correlated Crash)
- `R` : Reset siren and indicators to Safe operation
- `1` : Select `INSURE-BIKE-001` as active vehicle
- `2` : Select `INSURE-BIKE-002` as active vehicle
- `S` : Transmit one telemetry reading immediately
- `H` : Display the interactive command menu

---

## 6. Backend Connectivity Configuration

In `sketch.ino`:
```cpp
char backendUrl[160] = "https://insurevsb.vercel.app/api/iot/telemetry";
const char* DEVICE_KEY = "38252d8258310d9507b46252bb3dc360824a6c1e2e2e42ac2db8af64efcff95a";
```

### Local Testing vs Live Cloud Testing
- **Live Cloud Testing (Default):**  
  Wokwi in the cloud can reach the live deployed backend at `https://insurevsb.vercel.app/api/iot/telemetry` directly over the public internet.
- **Local Testing:**  
  Cloud Wokwi cannot directly reach your machine's `http://localhost:3001`. If testing with a local backend, expose port 3001 using a secure tunnel (such as `ngrok http 3001` or `localtunnel --port 3001`) and update `backendUrl` in `sketch.ino` to `https://<your-tunnel-subdomain>/api/iot/telemetry`.
