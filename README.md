# INSURE — InsurTech & IoT Telematics Insurance Pricing Platform

> **Smarter Driving. Fairer Insurance.**  
> A privacy-first, production-ready behavioural insurance pricing platform that combines consented real-world vehicle telematics and approved IoT measurements with insurer-approved risk factors, explainable scoring, Brevo SMTP authentication, and role-based access control.

---

## 📌 Problem Statement

Create an insurance pricing platform that uses consented real-world behaviour data, such as vehicle telematics or approved IoT measurements, to inform premiums alongside insurer-approved risk factors.

---

## ⚠️ Problems Faced & Challenges

1. **Static Legacy Pricing vs. Actual Usage:**  
   Traditional actuarial pricing models rely on static demographic aggregates (age, postal code, vehicle category) and fail to capture real differences in actual driving behavior, time-of-day exposure, and vehicle usage.

2. **Noisy and Incomplete Behavioural Data:**  
   Real-world IoT and device sensors produce noise, corrupted telemetry packets, GPS drift, temporary signal dropouts, and accelerometer spikes. Penalizing sensor flaws as reckless driving erodes trust and produces discriminatory premiums.

3. **Privacy Concerns & Continuous Surveillance:**  
   Continuous tracking creates severe privacy exposure. Drivers must retain sovereign consent controls over their telemetry, with strict data minimization principles ensuring that raw coordinates are discarded and only aggregate safety indicators are processed.

4. **Black-Box Pricing & Customer Distrust:**  
   Opaque machine learning or arbitrary dynamic pricing changes create confusion and regulatory non-compliance. Without explainable factor-level pricing breakdowns and human review channels, customers lose faith in behavioural insurance models.

---

## 💡 Suggested Approach & Solution

INSURE provides an end-to-end deterministic actuarial and telemetry architecture:

1. **Defensive Device Data Validation:**  
   Every batch of telemetry readings undergoes strict 9-rule defensive validation. Impossible speeds, clock backward jumps, missing sequences, or sensor glitches are classified as data quality defects and safely quarantined without penalizing the driver.

2. **Exposure-Normalized Usage Measures:**  
   Telemetry indicators are normalized per 100 km of driving exposure, evaluating harsh deceleration (>0.4g), rapid acceleration, speed compliance (>80 km/h), and night-time driving (23:00–04:00).

3. **Transparent & Validated Pricing Rules:**  
   A deterministic, explainable actuarial formula combines insurer-approved base rates with transparent behavioral discounts/surcharges (capped at 40%) and separate accident claim history adjustments:
   $$\text{Final Premium} = \text{Base Premium} \times (1 + \Delta_{\text{behaviour}} + \Delta_{\text{claims}})$$

4. **Data Minimization & Sovereign Privacy Controls:**  
   Users explicitly grant or withdraw telematics processing consent at any time via a dedicated consent portal. Telematics ingestion halts immediately if consent is withdrawn.

5. **Human-in-the-Loop Review & Dispute Pipeline:**  
   Unusual sensor cases, ambiguous events, and customer disputes (e.g., emergency obstacle avoidance) are routed directly to the **Pricing & Compliance Officer** queue for binding human audit and adjudication.

6. **Automated Algorithmic Fairness Monitoring:**  
   Continuous fairness tracking across risk cohorts ensures that penalties correlate strictly with driving risk rather than socio-demographic indicators or data quality artifacts.

---

## 🏗️ Detailed Architecture & How INSURE Achieves This

### 1. System Architecture & Data Flow

```mermaid
graph TD
    subgraph IoTLayer ["Virtual IoT Telematics Layer (Tab 1)"]
        Wokwi["Wokwi ESP32 Circuit<br/>(URL: 478002558874029057)"]
        MPU["MPU6050 Accelerometer<br/>(I2C: GPIO 21 / 22)"]
        Switch["Helmet Sensor Switch<br/>(GPIO 19)"]
        Pot["Alcohol Potentiometer<br/>(ADC: GPIO 34)"]
        Btn["Collision Pushbutton<br/>(GPIO 18)"]
        Buzzer["Collision Siren Buzzer<br/>(GPIO 27)"]
        LEDs["Green (25) & Red (26) LEDs"]

        MPU --> Wokwi
        Switch --> Wokwi
        Pot --> Wokwi
        Btn --> Wokwi
        Wokwi --> Buzzer
        Wokwi --> LEDs
    end

    subgraph IngestionGateway ["Express Ingestion Gateway (/api/iot)"]
        AuthMid["Device Auth Middleware<br/>(X-Device-Key Verification)"]
        RateLimiter["Rate Limiter<br/>(120 req/min per IP)"]
        Dedupe["In-Memory Deduplication<br/>(LRU Event ID Cache)"]
        ZodVal["Zod Schema Validator<br/>(Speed 0-300, Accel ±30 m/s²)"]

        Wokwi -->|HTTPS POST /api/iot/telemetry| AuthMid
        AuthMid --> RateLimiter
        RateLimiter --> Dedupe
        Dedupe --> ZodVal
    end

    subgraph StorageLayer ["Durable Persistence Layer (Supabase PostgreSQL)"]
        T_Readings[("telemetry_readings<br/>(Time, Speed, Accel, Helmet, Alcohol)")]
        T_Trips[("trips<br/>(Reading count, Started, Ended)")]
        T_Metrics[("trip_metrics<br/>(Distance, Avg Speed, Harsh counts)")]
        T_Assessments[("risk_assessments<br/>(Safety Score 0-100, Tier)")]
        T_Quotes[("quotes<br/>(Base ₹2,000, Adj %, Final Estimate)")]
        T_Accidents[("accident_records<br/>(Provisional Claims, Fault: UNKNOWN)")]
        T_Audit[("audit_logs<br/>(Immutable Governance Audit Trail)")]

        ZodVal --> T_Readings
        ZodVal --> T_Trips
    end

    subgraph ActuarialEngine ["Deterministic Actuarial & Scoring Engine"]
        FeatureExtractor["Feature Extraction<br/>(Braking, Speeding, Usage)"]
        ScoringService["Scoring Engine (v2.1)<br/>Safety Score = 100 - Risk Score"]
        PricingService["Pricing Engine (v2.1)<br/>Base ₹2,000 | -10% Safe | +20% Risky"]
        CollisionClassifier["Collision Classifier<br/>(Impact >= 5.0g / Decel <= -12 m/s²)"]

        T_Readings --> FeatureExtractor
        FeatureExtractor --> ScoringService
        ScoringService --> PricingService
        PricingService --> T_Assessments
        PricingService --> T_Quotes
        ZodVal --> CollisionClassifier
        CollisionClassifier --> T_Accidents
    end

    subgraph PresentationLayer ["INSURE Dashboard (Tab 2)"]
        Type1_UI["TYPE 1: Live Hardware Telemetry<br/>• MPU6050 Accel (m/s²)<br/>• Helmet Switch Pin 19<br/>• Alcohol Potentiometer ppm<br/>• Speed & Bangalore GPS Tracker"]
        Type2_UI["TYPE 2: Actuarial Insurance Calculations<br/>• Safety Score (0-100)<br/>• Dynamic Premium (₹1,800 - ₹2,400)<br/>• Provisional Collision Alerts (Fault: UNKNOWN)<br/>• Customer Pricing Dispute System"]

        T_Readings -.->|Polling GET /api/iot/telemetry/latest| Type1_UI
        T_Quotes -.->|Polling GET /api/iot/telemetry/latest| Type2_UI
        T_Assessments -.->|Polling GET /api/iot/telemetry/latest| Type2_UI
        T_Accidents -.->|Polling GET /api/iot/alerts| Type2_UI
    end
```

---

### 2. End-to-End Sequence Diagram (Telemetry, Scoring, and Dispute Workflow)

```mermaid
sequenceDiagram
    autonumber
    actor Driver as Driver / Evaluator (Tab 1: Wokwi)
    participant HW as Virtual ESP32 Hardware
    participant API as Ingestion Gateway (/api/iot)
    participant Engine as Actuarial Scoring Engine
    participant DB as PostgreSQL Database
    participant Dashboard as INSURE Dashboard (Tab 2)
    actor Officer as Compliance Officer (/compliance)

    Note over Driver,HW: Step 1: Telematics & Sensor Interaction
    Driver->>HW: Flip Helmet Switch / Adjust Alcohol Potentiometer / Press Collision Button
    HW->>HW: Sample MPU6050 (I2C) & Potentiometer ADC (GPIO 34)
    HW->>API: HTTPS POST /api/iot/telemetry (Payload + X-Device-Key)

    Note over API,DB: Step 2: Validation, Deduplication & Storage
    API->>API: Verify X-Device-Key (Constant-time SHA-256)
    API->>API: Deduplicate eventId & validate physical ranges
    API->>DB: INSERT into telemetry_readings & update trip

    alt Sensor indicates Impact >= 5.0g (Scenario C)
        API->>DB: INSERT into accident_records (Fault: strictly UNKNOWN, Status: PROVISIONAL)
        API->>DB: INSERT into audit_logs (IOT_COLLISION_ALERT_CREATED)
    end

    Note over Engine,DB: Step 3: Actuarial Scoring (when readings >= 5)
    Engine->>DB: Extract trip features & compute Safety Score (0-100)
    Engine->>DB: Calculate Quote (Base ₹2,000 + Behaviour Discount/Surcharge)
    Engine->>DB: INSERT / UPDATE risk_assessments & quotes

    Note over Dashboard,DB: Step 4: Live Dashboard Polling & UI Render
    Dashboard->>API: GET /api/iot/telemetry/latest?vehicleId=INSURE-BIKE-001
    API->>DB: Query latest reading, assessment, and quote
    API-->>Dashboard: Return JSON payload
    Dashboard-->>Driver: Update Speedometer, Accel, Helmet State, Alcohol ppm & Safety Score

    Note over Dashboard,Officer: Step 5: Customer Dispute & Human Review
    Driver->>Dashboard: Submit Dispute ("Emergency braking for sudden pedestrian")
    Dashboard->>API: POST /api/quotes/:id/dispute
    API->>DB: INSERT into pricing_disputes & audit_logs
    Officer->>DB: Review case in /compliance portal
    Officer->>DB: Adjudicate dispute & adjust quote with binding audit log
```

---

### 3. Virtual Hardware Pin Mapping (`diagram.json`)

The virtual circuit is hosted and interactive at:  
👉 **[https://wokwi.com/projects/478002558874029057](https://wokwi.com/projects/478002558874029057)**

```mermaid
graph LR
    ESP["ESP32 DevKit V1<br/>(Wokwi Microcontroller)"]

    MPU["MPU6050 Accelerometer/Gyro<br/>VCC: 3V3 | GND: GND<br/>SDA: GPIO 21 | SCL: GPIO 22"]
    Switch["Slide Switch (Helmet Latch)<br/>Pin 1: GPIO 19 | Pin 2: GND<br/>INPUT_PULLUP (LOW=ON / HIGH=OFF)"]
    Pot["Rotary Potentiometer (Alcohol)<br/>VCC: 3V3 | GND: GND | SIG: GPIO 34<br/>ADC1_CH6 (0-4095 ADC -> 0-0.80 ppm)"]
    Btn["Pushbutton (Collision Trigger)<br/>Pin 1: GPIO 18 | Pin 2: GND<br/>INPUT_PULLUP (Active LOW)"]
    GreenLED["Green LED (Normal / Heartbeat)<br/>Anode: GPIO 25 (via 220Ω) | Cathode: GND"]
    RedLED["Red LED (Collision Status Alert)<br/>Anode: GPIO 26 (via 220Ω) | Cathode: GND"]
    Buzzer["Piezo Buzzer (Collision Siren)<br/>Pin 1 (+): GPIO 27 | Pin 2 (-): GND"]

    MPU --- ESP
    Switch --- ESP
    Pot --- ESP
    Btn --- ESP
    ESP --- GreenLED
    ESP --- RedLED
    ESP --- Buzzer
```

---

## 📊 Dual-Tier Dashboard Architecture (The "2 Types")

The dashboard provides two complementary views in real time:

### Type 1: Live Virtual Circuit Hardware Data
- **MPU6050 6-DOF Accelerometer:** Captures real-time acceleration (m/s²) and impact vibrations ($g$).
- **Optical Helmet Latch Switch:** Reads actual logic level of `GPIO 19` (Green badge `ON` vs Red badge `NOT DETECTED`).
- **Simulated Breath Alcohol Potentiometer:** Reads analog voltage on `GPIO 34` (0–4095 raw ADC mapped to 0.00–0.80 ppm).
- **Collision Pushbutton:** Live `GPIO 18` trigger sensing severe impact ($>5.0g$).
- **Speed & GPS Tracking:** Bangalore Tech Corridor Expressway route progress (12.9716° N, 77.5946° E).

### Type 2: Scenario-Based Actuarial Insurance Calculations
- **Safety Score Gauge (0–100):** Evaluated against standard actuarial tiers:
  - **Tier 1 (Safe Driver, Score 80–100):** Moderate speed, helmet worn, smooth braking $\to$ **10% Discount (₹1,800/yr)**.
  - **Tier 2 (Standard Risk, Score 50–79.99):** Normal commute $\to$ **0% Adjustment (₹2,000/yr)**.
  - **Tier 3 (Elevated Risk, Score < 50):** Overspeeding, missing helmet, elevated alcohol $\to$ **+20% Surcharge (₹2,400/yr)**.
- **Fair Actuarial Pricing Principles:**
  1. **Statutory Decoupling:** Insurance claims settlement is strictly independent of telematics risk scores. Risk scores cannot reduce legitimate insurance payouts.
  2. **Insufficient Data Protection:** Trips under 1.0 km or missing sensor packets default safely to baseline pricing (₹2,000) with 0% penalty.
  3. **Neutral Collision Handling:** Impact spikes ($>5g$) create **provisional alerts with `Fault Status: UNKNOWN`**. Sensor readings alone never prove driver fault.

---

## 👥 Three Dedicated Role Portals (RBAC)

| Role | Provisioned Account | Route | Core Responsibilities |
|---|---|---|---|
| **Customer / Policyholder** | `tharunkumark4743@gmail.com` | `/` | Manage consent, view trips, inspect factor-level quotes, submit pricing disputes |
| **Insurance Admin / Owner** | `tharunkumark42007@gmail.com` | `/admin` | Portfolio metrics, loss ratios, customer account lifecycle, publish pricing rules |
| **Pricing & Compliance Officer** | `vsbecitc2428@gmail.com` | `/compliance` | Audit algorithmic fairness, review telematics warnings, adjudicate customer disputes |

*Default password for initial provisioned accounts: `123456`*

---

## 🛠️ Technology Stack

- **Firmware / Hardware Simulation:** Wokwi ESP32 DevKit V1, Wire/I²C MPU6050, WiFiClientSecure, HTTPClient, Arduino C++.
- **Backend API:** Node.js, Express, TypeScript, Zod, JWT RBAC, Bcrypt, Rate Limiting, Nodemailer / Brevo SMTP.
- **Database:** Supabase PostgreSQL with pooled connection retry resilience and deterministic idempotency.
- **Frontend Dashboard:** React 18, Vite, TypeScript, Tailwind CSS, Lucide Icons, Recharts.
- **Testing:** Jest, Supertest, 100% passing automated test suite (23 of 23 IoT telematics tests).

---

## 🚀 Two-Tab Virtual Demonstration Setup (For Judges)

Open your browser with two side-by-side tabs:

| Tab 1: Virtual Hardware (Wokwi) | Tab 2: Live Insurance Dashboard |
| :--- | :--- |
| **URL:** [https://wokwi.com/projects/478002558874029057](https://wokwi.com/projects/478002558874029057) | **URL:** [https://insurevsb.vercel.app/simulator](https://insurevsb.vercel.app/simulator) |
| Click **Play (Start Simulation)** | Sign In with demo account |

### Demonstration Sequence:
1. **Normal Commute:** Green heartbeat LED blinks on ESP32 $\to$ Tab 2 shows pulsing **`Live Stream Active`**, speed ~36 km/h, Helmet ON, Safety Score ~92, Premium ₹1,800.
2. **Interactive Switch:** Flip the Helmet switch in Wokwi $\to$ Tab 2 helmet badge changes to **`NOT DETECTED`**.
3. **Interactive Potentiometer:** Rotate alcohol knob in Wokwi $\to$ Tab 2 alcohol gauge updates dynamically in ppm.
4. **Trigger Collision:** Click the Red Pushbutton in Wokwi $\to$ Red LED illuminates, buzzer siren sounds, and Tab 2 displays a **`PROVISIONAL COLLISION ALERT`** with **`Fault: UNKNOWN`**.
5. **Two-Vehicle Collision:** Type `D` in Wokwi Serial Monitor $\to$ correlated events created for both `INSURE-BIKE-001` and `INSURE-BIKE-002` with neutral fault status.
6. **Reset:** Type `R` in Wokwi Serial Monitor $\to$ buzzer silences, alarm clears, and system returns to normal safe commute.

---

## 🧪 Local Execution Commands

### Start Backend Locally:
```bash
cd backend
npm install
npm run dev
```

### Start Frontend Locally:
```bash
cd frontend
npm install
npm run dev
```

### Run Automated IoT Test Suite:
```bash
cd backend
npm test -- tests/iot_telematics.test.ts
```
*(All 23 tests pass against remote Supabase PostgreSQL).*

---

## ⚡ Fast 1-Click Access & Live Simulation

- **1-Click Role Login:** The Sign-In screen at `/login` provides 1-click instant login cards loading the live provisioned accounts directly from remote Supabase PostgreSQL (`tharunkumark42007@gmail.com`, `vsbecitc2428@gmail.com`, `tharunkumark4743@gmail.com`).
- **Live Drive Streamer:** The **Virtual ESP32 Telematics Live Monitor** tab features a live telematics streamer that injects real dynamic sensor packets directly into Supabase PostgreSQL for Safe, Risky, and Collision scenarios.
- **Active UI Utilities:** Includes functional **Export Custom Report (CSV download)**, **Dark/Light Theme toggle**, and **Interactive Notifications Center**.

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.
Copyright (c) 2026 Tharun Kumar & INSURE Contributors.

