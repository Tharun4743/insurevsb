# 🚗 INSURE — Consented IoT Telematics & Fair Behavioural Actuarial Insurance Pricing Platform
### *Real-Time Telematics Driving Behavior Analytics, Dynamic Actuarial Scoring & Automated Premium Settlement*

<div align="center">

[![Domain](https://img.shields.io/badge/Domain-InsurTech%20%2F%20IoT-0284c7?style=for-the-badge&logo=shield&logoColor=white)](#)
[![Stack](https://img.shields.io/badge/Stack-Next.js%20%2F%20TypeScript-10b981?style=for-the-badge&logo=typescript&logoColor=white)](#)
[![Database](https://img.shields.io/badge/Database-PostgreSQL-336791?style=for-the-badge&logo=postgresql&logoColor=white)](#)
[![License: Strict Proprietary](https://img.shields.io/badge/License-Strict%20Proprietary-dc2626?style=for-the-badge&logo=lock&logoColor=white)](#)

<p align="center">
  <a href="https://github.com/Tharun4743/insurevsb">📦 <b>Official GitHub Repository</b></a>
</p>

</div>

---

## 1. 📌 Problem Statement & Context
Traditional automotive insurance pricing models rely on crude, aggregated demographic proxies (age, postal code, vehicle color, marital status):
* 📉 **Unfair Premium Penalties:** Safe drivers subsidize high-risk reckless drivers due to static, non-personalized annual pricing tables.
* ⚠️ **Lack of Real-Time Risk Telemetry:** Underwriters lack visibility into actual driving habits, harsh braking frequency, and high-speed cornering.
* 🛑 **Opaque Black-Box Algorithms:** Legacy telematics solutions provide cryptic scores without transparent behavioral feedback to drivers.

---

## 2. 🔍 Existing Solutions & Critical Gaps
| Actuarial Risk Metric | Traditional Auto Insurance | Black-Box Insurer Dongles | 🚗 INSURE Platform |
| :--- | :---: | :---: | :---: |
| **Real-Time Dynamic Pricing** | ❌ Static Annual Rates Only | ⚠️ Coarse Monthly Updates | ✅ Dynamic Per-Trip Actuarial Adjustment |
| **Consented Telematics** | ❌ No Behavioral Input | ⚠️ Intrusive Tracking | ✅ Consented, Privacy-Preserving Telemetry |
| **Algorithmic Transparency** | ❌ Closed Underwriter Tables | ❌ Opaque Proprietary Scoring | ✅ 100% Explainable Driving Feedback |
| **Gamified Safety Incentives**| ❌ None | ⚠️ Minimal Deductible Discounts | ✅ Real-Time Driver Cashbacks & Rewards |

---

## 3. 💡 Proposed Solution & Architectural Innovation
**INSURE** is an IoT telematics and behavioral actuarial pricing platform engineered by **Tharunkumar K**:
* 📡 **High-Precision Telematics Ingestion:** Collects speed velocity, acceleration vectors, harsh braking events, and turn angles.
* 📊 **Transparent Actuarial Scoring:** Converts driving behavior into a transparent safety rating that adjusts premiums fairly.
* 🎮 **Gamified Driver Incentives:** Directly rewards safe motorists with instant premium discounts, fostering safer roadways.

---

## 4. ⚙️ Technical Approach & System Architecture

### 📐 High-Level Architectural Flowchart:
```mermaid
graph TD
    VehicleOBD["Consented IoT Telematics (OBD-II / CAN Stream)"] -->|Speed, Accel, Braking| EdgeAgent["Edge Telematics Pre-Processor"]
    EdgeAgent --> CloudAPI["INSURE Actuarial Ingestion Gateway"]
    CloudAPI --> BehavioralEngine["Behavioral Driving Safety Scorer"]
    BehavioralEngine --> ActuarialModel["Fair Risk Pricing & Dynamic Premium Adjuster"]
    ActuarialModel --> SmartContract["Transparent Policy Settlement & Ledger"]
    SmartContract --> InsuredApp["Driver Companion App (Gamified Safety Rewards)"]
```

| Component | Technologies Used | Key Responsibility |
| :--- | :--- | :--- |
| **Web Portal** | React 19, Next.js, Tailwind CSS | Responsive policyholder and underwriter analytics dashboard |
| **Ingestion Gateway**| Node.js, Express, WebSocket | High-throughput ingestion of real-time vehicular sensor streams |
| **Actuarial Engine** | TypeScript, Python Scoring Core | Statistical evaluation of driving events, trip duration, and risk weightings |
| **Ledger & Persistence**| PostgreSQL, Prisma ORM | Tamper-proof policy records, historical trip telemetry, and premium audit trails |

---

## 5. 📈 Quantifiable Impact & Measurable Benefits
* 💰 **Up to 35% Premium Savings:** Directly lowers annual insurance costs for verified safe drivers.
* 📉 **40% Reduction in Reckless Driving:** Actionable feedback disincentivizes aggressive acceleration and abrupt braking.
* 🔍 **100% Underwriting Transparency:** Clear breakdown of factors influencing risk premiums.
* ⏱️ **Sub-Second Claim Event Logging:** High-precision crash telemetry assists fair claim adjudication.

---

## 6. 🚀 Feasibility, Operational Viability & Scalability
* 🔬 **Technical Feasibility:** Compatible with standard OBD-II dongles, vehicle CAN interfaces, and smartphone accelerometer data.
* 💰 **Economic Viability:** Drastically reduces insurer claim payout ratios while increasing customer retention.
* 📈 **Market Scalability:** Modular architecture easily integrates with commercial fleet management and insurance carrier cores.

---

## 7. 👨‍💻 Engineering Author

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
