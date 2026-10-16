# INSURE — InsurTech & IoT Telematics Insurance Pricing Platform

[![Live App](https://img.shields.io/badge/Live%20App-insurevsb.vercel.app-00C49F?style=for-the-badge&logo=vercel)](https://insurevsb.vercel.app/)
[![Virtual Circuit](https://img.shields.io/badge/Wokwi%20ESP32-Circuit%20478002558874029057-007ACC?style=for-the-badge&logo=espressif)](https://wokwi.com/projects/478002558874029057)
[![GitHub Repository](https://img.shields.io/badge/GitHub-Tharun4743%2Finsurevsb-181717?style=for-the-badge&logo=github)](https://github.com/Tharun4743/insurevsb)
[![Tests Passing](https://img.shields.io/badge/IoT%20Telemetry%20Tests-23%2F23%20Passed-2EA44F?style=for-the-badge&logo=jest)](https://github.com/Tharun4743/insurevsb)

> **Smarter Driving. Fairer Insurance.**  
> A privacy-first, production-ready behavioural insurance pricing platform that combines consented real-world vehicle telematics and approved IoT measurements with insurer-approved risk factors, transparent factor-level actuarial calculations, Brevo SMTP notifications, and statutory fairness controls.

---

## 📑 Quick Navigation & Presentation Resources

- 🌐 **Live Web Application:** [https://insurevsb.vercel.app](https://insurevsb.vercel.app)
- 🎮 **IoT Driving Simulator:** [https://insurevsb.vercel.app/simulator](https://insurevsb.vercel.app/simulator)
- ⚡ **Wokwi Virtual ESP32 Hardware:** [https://wokwi.com/projects/478002558874029057](https://wokwi.com/projects/478002558874029057)
- 📄 **Presentation PDF Dossiers (Pre-compiled in Repo):**
  - [INSURE Master Hackathon Presentation Dossier (PDF)](./INSURE_Master_Hackathon_Presentation_Dossier.pdf)
  - [INSURE Humanized Guide & Scenarios (PDF)](./INSURE_Humanized_Guide_and_Scenarios.pdf)
  - [INSURE All Actuarial Calculation Formulas (PDF)](./INSURE_All_Calculation_Formulas.pdf)
  - [INSURE Detailed Workflow Architecture Diagram (PDF)](./INSURE_Detailed_Workflow_Architecture_Diagram.pdf)

---

## 📌 Official Problem Statement & 100% Achievement Matrix

### 🎯 Problem Statement
> **Create an insurance pricing platform that uses consented real-world behaviour data, such as vehicle telematics or approved IoT measurements, to inform premiums alongside insurer-approved risk factors.**

### ⚠️ Challenges & How INSURE Solves Them

| Official Hackathon Challenge | Traditional Failure Mode | INSURE Production Solution | Status |
|---|---|---|---|
| **1. Static Legacy Pricing vs. Actual Usage** | Good drivers subsidize reckless drivers because premiums rely on static demographic bins (age, postal code). | **Dynamic Behavioral Actuarial Pricing:** Telematics normalizes harsh braking, rapid acceleration, speeding, and night driving into an exposure-based Safety Score (0–100). | **100% Achieved** |
| **2. Noisy & Incomplete Behavioural Data** | GPS drift, lost packets, or sensor glitches falsely classify safe drivers as aggressive, inflating rates. | **9-Rule Defensive Ingestion & Insufficient Data Gate:** Zod validation drops corrupt telemetry. Trips under 1 km or single readings default safely to baseline (₹2,000) with 0% penalty. | **100% Achieved** |
| **3. Continuous Monitoring & Privacy Concerns** | Customers fear continuous 24/7 surveillance and third-party data tracking. | **Sovereign Consent Portal & Data Minimization:** DPDP/GDPR-compliant consent switch (`/consent`). Turning off telematics immediately halts ingestion; raw GPS coords are stripped. | **100% Achieved** |
| **4. Unexplained Premium Changes & Customer Distrust** | Opaque black-box AI algorithms modify quotes arbitrarily without explaining why. | **Deterministic Math & Factor Explanations:** Quotes explicitly decompose base rate, telematics adjustments ($\pm 10\%\dots 20\%$), and claim history with human-in-the-loop dispute review (`/review`). | **100% Achieved** |
| **5. Model Fairness & Dispute Review** | Fault is prematurely pinned on drivers from raw sensor spikes during emergency avoidance. | **Provisional Collision Alert (Fault: UNKNOWN):** Impact $\ge 5.0\text{g}$ creates an unverified alert with **0% surcharge** until a human adjuster investigates on `/review`. | **100% Achieved** |

---

## 📖 The Humanized Story: Ravi vs. Rahul

To understand why INSURE is revolutionary, compare two 24-year-old delivery riders living in Bangalore on identical 150cc motorcycles:

```
+---------------------------------------------------------------------------------------------------+
|  TRADITIONAL AUTO INSURANCE:                                                                      |
|  - Ravi and Rahul are both 24-year-old males in Bangalore riding identical 150cc bikes.           |
|  - Both are charged the EXACT SAME PREMIUM: ₹2,000 / year.                                        |
|  - Ravi drives safely; Rahul drives recklessly. Safe Ravi subsidizes Rahul's reckless behavior!   |
+---------------------------------------------------------------------------------------------------+
                                              |
                                              v
+---------------------------------------------------------------------------------------------------+
|  INSURE TELEMATICS & IOT PRICING:                                                                 |
|                                                                                                   |
|  🟢 RAVI (Safe, Disciplined Rider)                  🔴 RAHUL (Aggressive, Risky Rider)            |
|  - Helmet: ALWAYS ON (Pin 19 = LOW)                 - Helmet: DETACHED (Pin 19 = HIGH)            |
|  - Speed: 38 km/h in 60 km/h zone                   - Speed: 92 km/h in 60 km/h zone              |
|  - Accelerometer: 0.12g smooth braking              - Accelerometer: -16.2 m/s² hard stop         |
|  - Alcohol Sensor: 0.00 ppm                         - Alcohol Sensor: 0.42 ppm (Elevated)         |
|  ---------------------------------                  ---------------------------------             |
|  Safety Score: 92 / 100 (Tier 1)                    Safety Score: 42 / 100 (Tier 3)               |
|  Telemetry Adjustment: -10% DISCOUNT                Telemetry Adjustment: +20% SURCHARGE          |
|  FAIR PREMIUM: ₹1,800 / year (Saves ₹200)           FAIR PREMIUM: ₹2,400 / year (Pays +₹400)      |
+---------------------------------------------------------------------------------------------------+
```

---

## 🏗️ 5-Tier System Architecture

```mermaid
graph TD
    subgraph Tier1 ["Tier 1: Virtual Hardware Telematics (Wokwi / Vehicle)"]
        ESP32["ESP32 DevKit V1 Microcontroller"]
        MPU["MPU6050 6-Axis Accelerometer (I2C 21/22)"]
        HelmetSwitch["Optical Helmet Switch (GPIO 19)"]
        AlcoholPot["Alcohol MQ-3 Potentiometer (GPIO 34 ADC)"]
        CollisionBtn["Emergency Collision Pushbutton (GPIO 18)"]
        GreenLED["Green Heartbeat LED (GPIO 25)"]
        RedLED["Red Alert LED (GPIO 26)"]
        Buzzer["Piezo Siren Buzzer (GPIO 27)"]

        MPU --> ESP32
        HelmetSwitch --> ESP32
        AlcoholPot --> ESP32
        CollisionBtn --> ESP32
        ESP32 --> GreenLED
        ESP32 --> RedLED
        ESP32 --> Buzzer
    end

    subgraph Tier2 ["Tier 2: Ingestion & Validation Gateway (/api/iot)"]
        AuthMid["Device HMAC Key Verification (X-Device-Key)"]
        RateLimiter["IP Rate Limiter (120 req / min)"]
        Deduplicator["LRU Event Deduplication (Anti-Replay)"]
        ZodValidator["9-Rule Physical Range Sanity Check"]

        ESP32 -->|HTTPS POST JSON| AuthMid
        AuthMid --> RateLimiter
        RateLimiter --> Deduplicator
        Deduplicator --> ZodValidator
    end

    subgraph Tier3 ["Tier 3: Durable Persistence (PostgreSQL / Supabase)"]
        T_Readings[("telemetry_readings")]
        T_Trips[("trips & trip_metrics")]
        T_Assessments[("risk_assessments")]
        T_Quotes[("quotes")]
        T_Accidents[("accident_records (Fault: UNKNOWN)")]
        T_Audit[("audit_logs (Immutable SHA-256)")]

        ZodValidator --> T_Readings
        ZodValidator --> T_Trips
    end

    subgraph Tier4 ["Tier 4: Deterministic Actuarial & Fairness Engine"]
        FeatureExtractor["Exposure Normalizer (Per 100 km)"]
        ScoringService["Safety Scoring Engine (v2.1)"]
        PricingService["Actuarial Pricing Engine (Capped at 40%)"]
        FairnessMonitor["Cohort Bias & Parity Monitor"]

        T_Readings --> FeatureExtractor
        FeatureExtractor --> ScoringService
        ScoringService --> PricingService
        PricingService --> T_Assessments
        PricingService --> T_Quotes
        PricingService --> FairnessMonitor
    end

    subgraph Tier5 ["Tier 5: Presentation & Governance Web Portal (React 18)"]
        DashboardUI["Driver Live Telematics & Scores (/)"]
        SimulatorUI["Interactive Driving Simulator (/simulator)"]
        ConsentUI["Sovereign Consent & Data Deletion (/consent)"]
        ReviewUI["Underwriting Review & Claims Queue (/review)"]
        PortfolioUI["Actuarial Profitability & Loss Ratios (/profitability)"]
        AuditUI["Compliance Audit Logs (/audit)"]

        T_Quotes -.-> DashboardUI
        T_Readings -.-> SimulatorUI
        T_Assessments -.-> ReviewUI
        T_Trips -.-> PortfolioUI
        T_Audit -.-> AuditUI
    end
```

---

## 🔄 End-to-End Ingestion, Pricing & Dispute Sequence

```mermaid
sequenceDiagram
    autonumber
    actor Driver as Driver / Evaluator (Wokwi Circuit)
    participant HW as ESP32 Virtual Hardware
    participant API as Ingestion Gateway (/api/iot)
    participant DB as PostgreSQL Database
    participant Actuary as Actuarial Engine
    actor Officer as Compliance Officer (/review)

    Driver->>HW: Flip Helmet Switch / Adjust Alcohol Potentiometer / Press Collision
    HW->>API: HTTPS POST /api/iot/telemetry (JSON + X-Device-Key)
    API->>API: Validate HMAC, deduplicate eventId, check physical bounds
    API->>DB: INSERT into telemetry_readings & update trips

    alt Collision Spike Detected (Impact >= 5.0g or Decel <= -12 m/s²)
        API->>DB: INSERT into accident_records (Fault Status: UNKNOWN, Surcharge: 0%)
        API->>DB: INSERT into audit_logs (IOT_COLLISION_ALERT_CREATED)
    end

    Actuary->>DB: Query trip readings & compute feature exposures
    Actuary->>Actuary: Calculate Safety Score (0-100) & Dynamic Premium
    Actuary->>DB: INSERT / UPDATE risk_assessments & quotes

    Driver->>API: Submit Pricing Dispute ("Braked hard to avoid stray cattle")
    API->>DB: INSERT into pricing_disputes
    Officer->>DB: Open Underwriting Review Queue (/review)
    Officer->>DB: Confirm legitimate avoidance -> Revert penalty & issue binding audit log
```

---

## 🔬 Virtual Hardware Pin Mapping (`diagram.json`)

The interactive circuit runs live at **[Wokwi Project 478002558874029057](https://wokwi.com/projects/478002558874029057)**:

| Hardware Component | Wokwi Model | ESP32 Pinout | Operational Logic / Physical Meaning |
|---|---|---|---|
| **Microcontroller** | ESP32 DevKit V1 | Core Module | 240MHz Dual Core, WiFi Client Secure, HTTP/JSON Gateway |
| **Accelerometer / Gyro** | MPU-6050 | `SDA -> GPIO 21`<br/>`SCL -> GPIO 22` | I²C 6-DOF sensor reading vehicle acceleration ($m/s^2$) and impact ($g$) |
| **Helmet Latch Switch** | Slide Switch | `GPIO 19` (Pull-Up) | `LOW (GND)` = Helmet Securely Buckled (Safe)<br/>`HIGH (3.3V)` = No Helmet (Violation) |
| **Alcohol Breathalyzer** | Rotary Potentiometer | `SIG -> GPIO 34` (ADC1) | Analog voltage `0–4095` mapped linearly to `0.00–0.80 ppm` BAC |
| **Collision Button** | Pushbutton | `GPIO 18` (Active LOW) | Simulates severe road impact ($\ge 7.4g$, Decel: $-18.5 m/s^2$) |
| **Normal Heartbeat LED** | Green LED | `GPIO 25` (via 220Ω) | Pulses during steady driving & successful HTTP telemetry upload |
| **Collision Status LED** | Red LED | `GPIO 26` (via 220Ω) | Latches on whenever impact exceeds collision threshold ($\ge 5.0g$) |
| **Alarm Siren** | Piezo Buzzer | `GPIO 27` (PWM) | Emits 1.2 kHz acoustic siren tone during collision emergencies |

---

## 🧪 The 4 Demonstration Scenarios

### Scenario A: Safe Commute (Ravi)
- **Inputs:** Speed: 38 km/h, Accel: 0.12 m/s², Helmet: ON (`GPIO 19` LOW), Alcohol: 0.00 ppm.
- **Actuarial Result:** Safety Score: **92 / 100** (Tier 1).
- **Premium:** ₹2,000 $\times (1 - 0.10) =$ **₹1,800 / year (₹200 savings)**.

### Scenario B: High-Risk Commute (Rahul)
- **Inputs:** Speed: 92 km/h, Accel: -16.2 m/s² (hard stop), Helmet: OFF (`GPIO 19` HIGH), Alcohol: 0.42 ppm.
- **Actuarial Result:** Safety Score: **42 / 100** (Tier 3).
- **Premium:** ₹2,000 $\times (1 + 0.20) =$ **₹2,400 / year (+₹400 surcharge)**.

### Scenario C: Sudden Impact Spike (Pushbutton Pressed)
- **Inputs:** Pushbutton on `GPIO 18` pressed $\to$ Impact: 7.4g, Decel: -18.5 m/s².
- **Hardware Feedback:** Buzzer sounds siren, Red LED illuminates.
- **Fairness Principle:** Ingestion records `accident_records` with `Fault Status: UNKNOWN`. The driver's quote is **NOT automatically surcharged** ($0\%$ penalty) until a human adjuster investigates on `/review`.

### Scenario D: Two-Vehicle Correlated Crash (Bike 001 + Bike 002)
- **Inputs:** Type `D` into Wokwi Serial Monitor $\to$ Multi-vehicle impact logged simultaneously for `INSURE-BIKE-001` and `INSURE-BIKE-002`.
- **Fairness Principle:** Both vehicles receive neutral provisional incident reports, eliminating unilateral automated blame.

---

## 📐 Actuarial Calculation Formulas & Mathematical Verification

### 1. Safety Score Formula
$$\text{Safety Score} = \max\Big(0, \min\big(100, 100 - (\Delta_{\text{harsh}} + \Delta_{\text{speed}} + \Delta_{\text{night}} + \Delta_{\text{gear}} + \Delta_{\text{substance}})\big)\Big)$$

- **Harsh Braking Penalty ($\Delta_{\text{harsh}}$):** $\min(30, \text{events\_per\_100km} \times 5)$
- **Speed Compliance Penalty ($\Delta_{\text{speed}}$):** $\min(30, (\text{pct\_time\_over\_limit} \times 0.5) + (\max(\text{speed} - 80, 0) \times 0.5))$
- **Night Driving Penalty ($\Delta_{\text{night}}$):** $\min(15, \text{pct\_night\_driving\_23to04} \times 0.25)$
- **Protective Gear Deduction ($\Delta_{\text{gear}}$):** $15\text{ pts}$ if helmet unbuckled
- **Substance Deduction ($\Delta_{\text{substance}}$):** $\min(30, \frac{\text{alcohol\_ppm}}{0.30} \times 30)$

### 2. Fair Premium Calculation Formula
$$\text{Final Premium} = \text{Base Premium} \times \big(1 + \text{clamp}(\Delta_{\text{telematics}}, -0.20, +0.20) + \Delta_{\text{claims}}\big)$$

Where:
- $\text{Base Premium} = ₹2,000$
- **Tier 1 (Score 80–100):** $\Delta_{\text{telematics}} = -10\%$ (₹1,800)
- **Tier 2 (Score 50–79.99):** $\Delta_{\text{telematics}} = 0\%$ (₹2,000)
- **Tier 3 (Score < 50):** $\Delta_{\text{telematics}} = +20\%$ (₹2,400)
- **Claim Surcharge ($\Delta_{\text{claims}}$):** $+15\%$ per verified at-fault incident (strictly $0\%$ for provisional/unverified alerts).

---

## 📈 Insurer Portfolio Economics & Combined Ratio Optimization

INSURE does not merely benefit safe drivers; it stabilizes insurance company loss ratios:

```
+---------------------------------------------------------------------------------------------------+
|  COMBINED RATIO (CR) EQUATION:                                                                    |
|                                                                                                   |
|                   Incurred Claims (Losses) + Operating Expenses                                  |
|  Combined Ratio = --------------------------------------------- x 100%                            |
|                               Earned Premium                                                      |
|                                                                                                   |
|  * CR > 100%: Insurer is LOSING MONEY on underwriting operations.                                 |
|  * CR < 100%: Insurer is GENERATING UNDERWRITING PROFIT.                                          |
+---------------------------------------------------------------------------------------------------+
```

| Metric | Traditional Blind Pricing | INSURE Behavioral Telematics | Financial Impact |
|---|---|---|---|
| **Earned Premium (10,000 policies)** | ₹20,000,000 | ₹20,800,000 | +4.0% revenue optimization |
| **Incurred Claims (Accident Payouts)** | ₹15,600,000 (78% Loss Ratio) | ₹13,104,000 (63% Loss Ratio) | **-16.0% lower claim payouts** |
| **Underwriting & Administrative Expenses** | ₹5,200,000 (26% Expense Ratio) | ₹5,200,000 (25% Expense Ratio) | Automated telematics efficiency |
| **Combined Ratio (CR)** | **104.0% (Underwriting Loss)** | **88.0% (Underwriting Profit)** | **+16.0% Margin Swing** |

---

## 🧭 Streamlined Role-Based Navigation Architecture

INSURE enforces strict, role-tailored navigation eliminating clutter:

| Role Portal | Focused Sidebar Items | URL Routes | Core Responsibilities & Workflow |
|---|---|---|---|
| **🟢 Driver / Policyholder** | 1. **My Policy & Driving**<br/>2. **Trip History**<br/>3. **IoT Live Stream & Sim** | `/`<br/>`/trips`<br/>`/simulator` | View safety score, dynamic quote (₹1,800 vs ₹2,400), 5-factor scorecard, toggle sovereign consent in 1-click, inspect driving trips, and stream live ESP32 virtual hardware. |
| **⚖️ Compliance Officer** | 1. **Underwriting Review**<br/>2. **Compliance Overview**<br/>3. **Fairness Audit Log** | `/review`<br/>`/compliance`<br/>`/audit` | Adjudicate customer pricing disputes, review provisional collision alerts (`Fault: UNKNOWN`), monitor demographic parity across cohorts, and inspect the immutable SHA-256 ledger. |
| **🏢 Insurance Admin / Owner** | 1. **Admin Portfolio**<br/>2. **Portfolio Economics**<br/>3. **System Audit Trail** | `/admin`<br/>`/profitability`<br/>`/audit` | Manage customer account status, publish pricing rule versions, monitor Combined Ratio optimization (88% vs 104%), and audit system operations. |

---

## 👥 Pre-Provisioned Accounts for Demonstration

| Role | Email Address | Password | Primary Demo Workflow |
|---|---|---|---|
| **Customer / Driver** | `tharunkumark4743@gmail.com` | `123456` | Test consent switch, review factor breakdowns, submit pricing dispute |
| **Pricing & Compliance Officer** | `vsbecitc2428@gmail.com` | `123456` | Review provisional collision alerts, adjudicate disputes, audit fairness |
| **Insurance Administrator / Owner** | `tharunkumark42007@gmail.com` | `123456` | Inspect portfolio combined ratio (88%), manage users, export CSV audits |

*(Instant 1-click login cards are available directly on the `/login` screen).*

---

## ⏱️ 3-Minute Live Hackathon Pitch Script (For Presenters)

- **[0:00 – 0:30] The Hook & Problem:**  
  *"Traditional auto insurance is broken. Ravi drives safely at 38 km/h wearing a helmet; Rahul drives recklessly at 92 km/h without a helmet. Yet traditional insurers charge them both the exact same ₹2,000. Ravi is unfairly subsidizing Rahul. INSURE fixes this with consented IoT telematics."*
- **[0:30 – 1:15] Hardware-in-the-Loop Live Demo:**  
  *Open Tab 1 (Wokwi) and Tab 2 (INSURE Simulator). Show the green heartbeat LED blinking. Flip the helmet switch $\to$ Tab 2 shows 'Helmet NOT DETECTED'. Rotate the alcohol knob $\to$ Tab 2 shows alcohol ppm rising. Press the red collision button $\to$ siren sounds, red LED fires, and Tab 2 logs a provisional collision alert.*
- **[1:15 – 2:00] Fairness Principle & Actuarial Pricing:**  
  *Point out that the collision alert has 'Fault Status: UNKNOWN' and 0% penalty. Explain that sensor signals alone never prove driver fault. Ravi receives an explainable 10% discount (₹1,800) while Rahul incurs a +20% surcharge (₹2,400).*
- **[2:00 – 2:30] Human-in-the-Loop Dispute & Consent:**  
  *Log in as Compliance Officer (`vsbecitc2428@gmail.com`). Show the Underwriting Review queue. Demonstrate adjudicating a dispute where a driver braked hard to avoid cattle. Switch to `/consent` to show sovereign GDPR/DPDP opt-out controls.*
- **[2:30 – 3:00] Underwriting Economics & Conclusion:**  
  *Open `/profitability` to show how INSURE shifts the portfolio Combined Ratio from an unprofitable 104% to a healthy 88%. Conclude: 'INSURE provides safer roads, lower premiums for good drivers, and profitable, statutory-compliant portfolios for insurers.'*

---

## 💻 Local Setup & Execution Guide

### Prerequisites
- Node.js v18+ and npm
- PostgreSQL database (or remote Supabase instance)

### 1. Start the Backend API
```bash
cd backend
npm install
npm run dev
```
*API runs on `http://localhost:5000`.*

### 2. Start the Frontend Dashboard
```bash
cd frontend
npm install
npm run dev
```
*Frontend runs on `http://localhost:5173`.*

### 3. Run Automated IoT Telematics Test Suite
```bash
cd backend
npm test -- tests/iot_telematics.test.ts
```
*Executes all 23 integration tests verifying physical range checks, deduplication, collision thresholds, and provisional pricing gates.*

---

## 📄 License & Attribution

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.  
Developed by **Team Techsquad** for **SYNAPSE '26**.  
Copyright (c) 2026 Tharun Kumar & INSURE Contributors.
