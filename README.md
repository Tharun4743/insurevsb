# INSURE — InsurTech & IoT Telematics Insurance Pricing Platform

> **Smarter Driving. Fairer Insurance.**  
> A privacy-first, production-ready behavioural insurance pricing platform that combines consented real-world vehicle telematics and approved IoT measurements with insurer-approved risk factors, explainable scoring, Brevo SMTP authentication, and role-based access control.

---

## 📌 Problem Statement

Create an insurance pricing platform that uses consented real-world behaviour data, such as vehicle telematics or approved IoT measurements, to inform premiums alongside insurer-approved risk factors.

---

## ⚠️ Problem Faced & Challenges

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
   Every batch of telemetry readings undergoes strict 9-rule defensive validation. Impossible speeds, clock backwards jumps, missing sequences, or sensor glitches are classified as data quality defects and safely quarantined without penalizing the driver.

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

## 👥 Three Dedicated Role Portals (RBAC)

| Role | Provisioned Account | Route | Core Responsibilities |
|---|---|---|---|
| **Customer / Policyholder** | `tharunkumark4743@gmail.com` | `/` | Manage consent, view trips, inspect factor-level quotes, submit pricing disputes |
| **Insurance Admin / Owner** | `tharunkumark42007@gmail.com` | `/admin` | Portfolio metrics, loss ratios, customer account lifecycle, publish pricing rules |
| **Pricing & Compliance Officer** | `vsbecitc2428@gmail.com` | `/compliance` | Audit algorithmic fairness, review telematics warnings, adjudicate customer disputes |

*Default password for initial provisioned accounts: `123456`*

---

## 🛠️ Technology Stack & Architecture

- **Backend:** Node.js, Express, Zod (Defensive Schema Validation), JWT (RBAC Authentication), Bcrypt, Nodemailer / Brevo SMTP.
- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS, Lucide Icons, Recharts.
- **Database:** Supabase PostgreSQL (Remote Cloud Persistence with connection pooling, automatic retry, and zero static constants).
- **Email Service:** Brevo SMTP API with STARTTLS (port 587) and 6-digit SHA-256 hashed OTP verification.
- **Testing:** Jest & Supertest (7 automated test suites, 72 unit/integration/acceptance tests).

---

## 🚀 Single-Click Application Runner (`run.bat`)

INSURE includes a single-click Windows batch launcher with parenthetical safety and silent health polling:

```cmd
run.bat
```

What `run.bat` does automatically:
1. Verifies Node.js (v18+) and npm.
2. Auto-installs backend and frontend dependencies if missing.
3. Runs database schema migrations against remote Supabase (`npm run migrate`).
4. Provisions privileged and customer accounts in Supabase (`npm run seed:users`).
5. Launches Express Backend API on `http://localhost:3001`.
6. Launches Vite React Frontend on `http://localhost:5173`.
7. Opens `http://localhost:5173` in your default browser.

---

## 🧪 Test Verification

Run all automated test suites against Supabase PostgreSQL:
```bash
cd Insure/backend
npm test
```

### Test Coverage Highlights
- `tests/auth_and_roles.test.js`: Brevo SMTP OTP generation, cooldown, verification, password recovery, RBAC route guarding, and dispute resolution.
- `tests/fair_algorithm_acceptance.test.js`: Validates all 5 core driver acceptance scenarios (Safe Driver discount, Dangerous Driver surcharge, Accident separation, Insufficient Data protection).
- `tests/validation.test.js`: 9 defensive telemetry validation rules.
- `tests/scoring.test.js`: Deterministic 5-factor scoring engine.
- `tests/pricing.test.js`: Explainable actuarial formulas and risk adjustments.
- `tests/simulator.test.js`: End-to-end trip generation and Supabase persistence.
- `tests/profitability.test.js`: Portfolio growth and underwriting loss ratio simulation.

---

## 🔒 Security & Privacy Commitments

- **Zero Hardcoded Data:** All portfolio metrics, quotes, trips, dispute cases, and user accounts strictly process from Supabase PostgreSQL.
- **Enumeration Safe:** Auth and password recovery endpoints return generic timing-safe responses.
- **Single-Use Tokens:** OTPs and reset authorizations invalidate immediately upon first use.
- **Audit Logging:** Every administrative configuration change, dispute submission, and officer decision creates an immutable audit log record.


## 👨‍💻 Engineering Author

## ⚙️ Technical Approach & System Architecture

### 📐 High-Level Architectural Flowchart:
`mermaid
graph TD
    VehicleOBD["Consented IoT Telematics (OBD-II / CAN Stream)"] -->|Speed, Accel, Braking| EdgeAgent["Edge Telematics Pre-Processor"]
    EdgeAgent --> CloudAPI["INSURE Actuarial Ingestion Gateway"]
    CloudAPI --> BehavioralEngine["Behavioral Driving Safety Scorer"]
    BehavioralEngine --> ActuarialModel["Fair Risk Pricing & Dynamic Premium Adjuster"]
    ActuarialModel --> SmartContract["Transparent Policy Settlement & Ledger"]
    SmartContract --> InsuredApp["Driver Companion App (Gamified Safety Rewards)"]
`

---

<table border="0">
  <tr>
    <td width="120" align="center" valign="top">
      <img src="https://github.com/Tharun4743.png" width="100" style="border-radius: 4px;" alt="Tharunkumar K" />
    </td>
    <td>
      <h3>Tharunkumar K</h3>
      <p>
        <b>Full Stack Developer & AI Systems Engineer</b><br/>
        🎓 B.Tech in Information Technology — <a href="https://vsbec.com"><b>V.S.B. Engineering College, Karur</b></a> (Batch 2024–2028)<br/>
        🌟 Recognized for holding the <b>Best GitHub Profile & Top Student Developer</b> at V.S.B. Engineering College (VSBEC)<br/>
        🥇 <b>Winner — Code Thugs 2K26</b> • 🚀 <b>Smart India Hackathon (SIH)</b> Top 50 National Finalist
      </p>
      <p>
        <a href="https://tharunkumark4743.netlify.app/">🌐 Portfolio</a> •
        <a href="https://github.com/Tharun4743">🐙 GitHub (@Tharun4743)</a> •
        <a href="https://www.linkedin.com/in/tharunkumark4743">💼 LinkedIn</a> •
        <a href="https://leetcode.com/u/Tharunkumar__K/">🧩 LeetCode</a> •
        <a href="mailto:tharunkumark42007@gmail.com">📧 Email</a>
      </p>
    </td>
  </tr>
</table>


## License & Intellectual Property Notice

> [!CAUTION]
> ### PROPRIETARY & CONFIDENTIAL INTELLECTUAL PROPERTY - ALL RIGHTS RESERVED
>
> All rights reserved. This repository, its architecture, source code, workflows, models, and associated documentation are the exclusive intellectual property of **Tharunkumar K**.
>
> **STRICT NOTICE:** No individual, organization, institution, or commercial entity is permitted to use, copy, modify, distribute, reproduce, sublicense, reverse-engineer, deploy, or commercially exploit any portion of this project without express, prior written permission from **Tharunkumar K**.
>
> **Copyright 2026 Tharunkumar K. All Rights Reserved.**  
> See the [LICENSE](LICENSE) file for complete legal terms.
<!-- =========================================================================
   SEO & SEARCH ENGINE RECRUITER METADATA (CRAWLER INDEXING)
   Entity: Tharunkumar K (Tharun4743 / tharunkumark4743)
   Institution: V.S.B. Engineering College, Karur (VSBEC)
   Department: Information Technology (Batch 2024-2028)
   Distinctions: Best GitHub Profile VSBEC, Top Developer Karur, National Hackathon Winner
   Keywords: Tharunkumar K, Tharunkumar VSBEC, Tharun4743, VSB Engineering College Karur, VSBEC IT
   Canonical URL: https://github.com/Tharun4743/insurevsb
========================================================================= -->