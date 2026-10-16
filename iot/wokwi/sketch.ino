/**
 * INSURE Virtual IoT Telematics Simulator (ESP32)
 *
 * Full-Featured Virtual Hardware Integration:
 *  - Board: ESP32 DevKit V1 (Wokwi)
 *  - MPU6050 6-DOF I2C Accelerometer & Gyroscope (SDA: GPIO 21, SCL: GPIO 22)
 *  - Hardware Pushbutton: Instant Collision Impact Trigger (GPIO 18)
 *  - Hardware Slide Switch: Optical Helmet Latch Sensor (GPIO 19)
 *  - Analog Potentiometer: Simulated Breath Alcohol Sensor (ADC: GPIO 34)
 *  - Green LED: Heartbeat & Normal Telemetry (GPIO 25)
 *  - Red LED: Collision Alert & Warning (GPIO 26)
 *  - Piezo Buzzer: Acoustic Warning Siren (GPIO 27)
 *  - Network: Wokwi Virtual WiFi ("Wokwi-GUEST"), HTTPS POST to INSURE Ingestion API
 *  - Security: Authenticated with X-Device-Key header
 *
 * Scenarios:
 *   [A] Safe Driving Commute (Moderate speed, Helmet ON, Smooth accel, Normal status)
 *   [B] Risky Driving (Excessive speed, dynamic Potentiometer & Helmet states)
 *   [C] Instant Collision Alert (7.4g impact spike, -18.5 m/s² decel, Siren + Red LED)
 *   [D] Two-Vehicle Correlated Crash (Distinct events for BIKE-001 & BIKE-002, Fault: UNKNOWN)
 *   [R] Scenario Reset (Clears siren, resets indicators to safe operation)
 *
 * NOTE: All data produced by this firmware is explicitly marked as SYNTHETIC.
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Wire.h>

// ── Virtual Hardware GPIO Configuration ─────────────────────────────────────
#define PIN_IMPACT_BTN    18   // Pushbutton: Collision Trigger (INPUT_PULLUP, Button to GND)
#define PIN_HELMET_SW     19   // Slide Switch: Helmet Sensor (INPUT_PULLUP, LOW=ON, HIGH=OFF)
#define PIN_I2C_SDA       21   // I2C Data line for MPU6050
#define PIN_I2C_SCL       22   // I2C Clock line for MPU6050
#define PIN_LED_GREEN     25   // Green LED: Normal Operation / Heartbeat
#define PIN_LED_RED       26   // Red LED: Collision Status / Alert
#define PIN_BUZZER        27   // Piezo Buzzer: Audible Collision Warning
#define PIN_POT_ALCOHOL   34   // Potentiometer: Simulated Breath Alcohol (ADC1_CH6, Input-only)

// ── MPU6050 I2C Register Addresses ──────────────────────────────────────────
#define MPU6050_ADDR      0x68
#define MPU6050_PWR_MGMT  0x6B
#define MPU6050_ACCEL_X   0x3B

// ── WiFi & Cloud Backend Configuration ──────────────────────────────────────
const char* WIFI_SSID     = "Wokwi-GUEST";
const char* WIFI_PASSWORD = "";

// Default backend endpoint (Deployed Vercel production API)
char backendUrl[160]      = "https://insurevsb.vercel.app/api/iot/telemetry";

// DEMO-ONLY CREDENTIAL NOTICE:
// In the public Wokwi virtual simulator, firmware source is observable.
// This key authenticates strictly with the demonstration environment.
const char* DEVICE_KEY    = "38252d8258310d9507b46252bb3dc360824a6c1e2e2e42ac2db8af64efcff95a";

// Transmission interval in milliseconds (4000ms = 4s bounded polling loop)
const unsigned long TRANSMIT_INTERVAL_MS = 4000;
unsigned long lastTransmitTime = 0;

// ── State Variables ─────────────────────────────────────────────────────────
enum Scenario {
  SCENARIO_SAFE = 0,
  SCENARIO_RISKY = 1,
  SCENARIO_COLLISION = 2,
  SCENARIO_TWO_VEHICLE = 3
};

Scenario currentScenario = SCENARIO_SAFE;
int activeVehicleIndex   = 0; // 0 = INSURE-BIKE-001, 1 = INSURE-BIKE-002

const char* VEHICLE_IDS[2] = { "INSURE-BIKE-001", "INSURE-BIKE-002" };
const char* DEVICE_IDS[2]  = { "ESP32-DEV-001",   "ESP32-DEV-002"   };
unsigned long seqNumbers[2]= { 1, 1 };

// Base Route GPS (Bangalore Tech Corridor Expressway)
double baseLat[2] = { 12.971600, 12.972000 };
double baseLng[2] = { 77.594600, 77.595200 };

bool mpuAvailable = false;
bool collisionActive = false;

// ── Sound Alarm Generator ───────────────────────────────────────────────────
void soundBuzzerBeep(int freq, int durationMs) {
  // Generate square wave for piezo buzzer on GPIO 27
  unsigned long start = millis();
  long delayMicros = 1000000L / (freq * 2);
  while (millis() - start < (unsigned long)durationMs) {
    digitalWrite(PIN_BUZZER, HIGH);
    delayMicroseconds(delayMicros);
    digitalWrite(PIN_BUZZER, LOW);
    delayMicroseconds(delayMicros);
  }
  digitalWrite(PIN_BUZZER, LOW);
}

// ── MPU6050 Sensor Initialization ───────────────────────────────────────────
void initMPU6050() {
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  Wire.beginTransmission(MPU6050_ADDR);
  Wire.write(MPU6050_PWR_MGMT);
  Wire.write(0x00); // Wake up MPU6050 from sleep mode
  byte err = Wire.endTransmission();

  if (err == 0) {
    mpuAvailable = true;
    Serial.println("[MPU6050] Virtual I2C Accelerometer successfully initialized (Addr: 0x68).");
  } else {
    mpuAvailable = false;
    Serial.printf("[MPU6050 WARNING] Sensor initialization returned code: %d. Falling back to calibrated model.\n", err);
  }
}

// ── Read Real Simulated Measurements from MPU6050 ────────────────────────────
bool readMPU6050(double &ax, double &ay, double &az) {
  if (!mpuAvailable) return false;

  Wire.beginTransmission(MPU6050_ADDR);
  Wire.write(MPU6050_ACCEL_X);
  byte err = Wire.endTransmission(false);
  if (err != 0) return false;

  Wire.requestFrom((uint8_t)MPU6050_ADDR, (size_t)6, true);
  if (Wire.available() < 6) return false;

  int16_t rawX = (Wire.read() << 8) | Wire.read();
  int16_t rawY = (Wire.read() << 8) | Wire.read();
  int16_t rawZ = (Wire.read() << 8) | Wire.read();

  // Convert raw 16-bit counts (±2g range = 16384 LSB/g) to m/s²
  ax = (rawX / 16384.0) * 9.80665;
  ay = (rawY / 16384.0) * 9.80665;
  az = (rawZ / 16384.0) * 9.80665;

  return true;
}

// ── Helper: Generate Unique Event ID ────────────────────────────────────────
String generateEventId(const char* prefix) {
  uint32_t r1 = esp_random();
  uint32_t r2 = esp_random();
  char buf[48];
  snprintf(buf, sizeof(buf), "evt_%s_%08x%08x", prefix, r1, r2);
  return String(buf);
}

// ── Helper: Format ISO-8601 UTC Timestamp ───────────────────────────────────
String getIsoTimestamp() {
  unsigned long ms = millis();
  unsigned long seconds = ms / 1000;
  unsigned int remMs = ms % 1000;

  time_t rawtime;
  time(&rawtime);

  if (rawtime < 100000) {
    rawtime = 1776300000 + seconds; // Synthetic 2026 epoch base
  }

  struct tm* ptm = gmtime(&rawtime);
  char buf[36];
  snprintf(buf, sizeof(buf), "%04d-%02d-%02dT%02d:%02d:%02d.%03dZ",
           ptm->tm_year + 1900, ptm->tm_mon + 1, ptm->tm_mday,
           ptm->tm_hour, ptm->tm_min, ptm->tm_sec, remMs);
  return String(buf);
}

// ── Build Single Telemetry Payload ──────────────────────────────────────────
String buildTelemetryJson(int vIdx, Scenario scn, bool isIncidentTrigger = false) {
  const char* vehicleId = VEHICLE_IDS[vIdx];
  const char* deviceId  = DEVICE_IDS[vIdx];
  unsigned long seq     = seqNumbers[vIdx]++;
  String eventId        = generateEventId(vIdx == 0 ? "b1" : "b2");
  String isoTime        = getIsoTimestamp();

  // Advance synthetic route GPS
  baseLat[vIdx] += 0.00012;
  baseLng[vIdx] += 0.00009;

  // 1. Read Hardware Helmet Sensor Switch (GPIO 19)
  // LOW = switch closed to ground (Helmet detected / Safe)
  // HIGH = switch open with pullup (Helmet Missing)
  bool hwHelmetOn = (digitalRead(PIN_HELMET_SW) == LOW);

  // 2. Read Potentiometer Simulated Alcohol Sensor (GPIO 34, ADC 0-4095)
  int rawAdc = analogRead(PIN_POT_ALCOHOL);
  // Map ADC reading to synthetic breath alcohol range: 0 to 0.80 ppm
  double potAlcoholPpm = (rawAdc / 4095.0) * 0.80;

  // 3. Read Hardware MPU6050 Accelerometer
  double mpuAx = 0.0, mpuAy = 0.0, mpuAz = 9.80;
  bool mpuReadOk = readMPU6050(mpuAx, mpuAy, mpuAz);

  // 4. Determine Dynamic Telematics Parameters based on Scenario
  double speedKmh = 35.0;
  double accelMs2 = 0.5;
  double impactG  = 1.02;
  bool helmetState = hwHelmetOn;       // Physical switch GPIO 19 is live source of truth!
  double alcoholPpm = potAlcoholPpm;   // Physical potentiometer GPIO 34 is live source of truth!
  const char* ignition = "ON";
  const char* eventType = "regular";

  if (isIncidentTrigger || scn == SCENARIO_COLLISION) {
    // Scenario C: Possible Collision
    speedKmh = 0.0;
    accelMs2 = -18.5; // Extreme deceleration spike
    impactG  = 7.42;  // Severe collision impact magnitude (> 5.0g)
    ignition = "OFF";
    eventType = "possible_collision";
    digitalWrite(PIN_LED_RED, HIGH);
    collisionActive = true;
  } else if (scn == SCENARIO_RISKY) {
    // Scenario B: Risky Driving (Excessive speed, dynamic hardware controls)
    speedKmh = 94.5 + ((millis() % 1600) / 100.0);
    accelMs2 = (mpuReadOk && abs(mpuAy) > 0.8) ? mpuAy : 4.25;
    impactG  = 1.45;
    // If potentiometer is at 0 in risky scenario, provide baseline risky alcohol (0.38 ppm) unless turned
    if (potAlcoholPpm > 0.02) {
      alcoholPpm = potAlcoholPpm;
    } else {
      alcoholPpm = 0.38;
    }
    eventType = "harsh_event";
    digitalWrite(PIN_LED_RED, LOW);
  } else {
    // Scenario A: Safe Driving Commute
    speedKmh = 36.0 + ((millis() % 800) / 100.0);
    accelMs2 = (mpuReadOk && abs(mpuAx) > 0.1) ? mpuAx : 0.62;
    impactG  = 1.01;
    eventType = "regular";
    digitalWrite(PIN_LED_RED, LOW);
  }

  // Construct JSON strictly conforming to INSURE backend telemetry schema
  char jsonBuf[512];
  snprintf(jsonBuf, sizeof(jsonBuf),
    "{"
      "\"eventId\":\"%s\","
      "\"deviceId\":\"%s\","
      "\"vehicleId\":\"%s\","
      "\"sequenceNumber\":%lu,"
      "\"timestamp\":\"%s\","
      "\"speed_kmh\":%.2f,"
      "\"acceleration_ms2\":%.3f,"
      "\"impact_magnitude_g\":%.2f,"
      "\"helmet_detected\":%s,"
      "\"alcohol_ppm\":%.2f,"
      "\"latitude\":%.6f,"
      "\"longitude\":%.6f,"
      "\"ignition_state\":\"%s\","
      "\"event_type\":\"%s\","
      "\"synthetic\":true"
    "}",
    eventId.c_str(),
    deviceId,
    vehicleId,
    seq,
    isoTime.c_str(),
    speedKmh,
    accelMs2,
    impactG,
    helmetState ? "true" : "false",
    alcoholPpm,
    baseLat[vIdx],
    baseLng[vIdx],
    ignition,
    eventType
  );

  // Print telemetry diagnostics to Serial Monitor
  Serial.println("\n---------------------------------------------------------");
  Serial.printf("[Telematics] Vehicle: %s | Device: %s | Seq: #%lu\n", vehicleId, deviceId, seq);
  Serial.printf("[Hardware Sensors] MPU6050: (Ax=%.2f, Ay=%.2f, Az=%.2f) m/s² | Pot ADC: %d (Sim: %.2f ppm) | Helmet: %s\n",
                mpuAx, mpuAy, mpuAz, rawAdc, potAlcoholPpm, hwHelmetOn ? "DETECTED (ON)" : "NOT DETECTED (OFF)");
  Serial.printf("[Synthetic Vehicle] Speed: %.1f km/h | Accel: %.2f m/s² | Impact: %.2fg | Event: %s\n",
                speedKmh, accelMs2, impactG, eventType);

  return String(jsonBuf);
}

// ── HTTP/HTTPS Transmission Engine ──────────────────────────────────────────
bool sendTelemetry(const String& payload) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[Network] WiFi disconnected. Attempting reconnect...");
    WiFi.reconnect();
    unsigned long waitStart = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - waitStart < 3000) {
      delay(200);
    }
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("[Network] Offline mode — Telemetry printed to Serial only.");
      return false;
    }
  }

  // Flash green LED during transmission
  digitalWrite(PIN_LED_GREEN, HIGH);

  WiFiClientSecure clientSecure;
  // Wokwi Virtual Simulator Limitation:
  // Virtual ESP32 lacks battery RTC and local Root CA store, requiring setInsecure() for TLS.
  // Physical hardware units must use strict Root CA validation (#define USE_STRICT_TLS_CERT).
  clientSecure.setInsecure();

  HTTPClient http;
  bool beginSuccess = false;

  if (String(backendUrl).startsWith("https")) {
    beginSuccess = http.begin(clientSecure, backendUrl);
  } else {
    WiFiClient plainClient;
    beginSuccess = http.begin(plainClient, backendUrl);
  }

  if (!beginSuccess) {
    Serial.println("[HTTP Error] Failed to configure HTTP connection.");
    digitalWrite(PIN_LED_GREEN, LOW);
    return false;
  }

  http.setTimeout(8000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_KEY);

  Serial.println("[HTTP POST] Transmitting packet to: " + String(backendUrl));

  int httpCode = http.POST(payload);

  if (httpCode > 0) {
    String response = http.getString();
    Serial.printf("[Backend Response] HTTP Code: %d\n", httpCode);
    Serial.println("[Response Body] " + response);
    if (httpCode == 200 || httpCode == 201) {
      Serial.println("[Result] >>> TELEMETRY PERSISTED IN POSTGRESQL & AVAILABLE ON DASHBOARD <<<");
    } else {
      Serial.printf("[Warning] Backend returned non-200 code: %d\n", httpCode);
    }
    http.end();
    digitalWrite(PIN_LED_GREEN, LOW);
    return (httpCode == 200 || httpCode == 201);
  } else {
    Serial.printf("[HTTP Error] POST request failed: %s\n", http.errorToString(httpCode).c_str());
    http.end();
    digitalWrite(PIN_LED_GREEN, LOW);
    return false;
  }
}

// ── Interactive Serial Command Menu ─────────────────────────────────────────
void printHelp() {
  Serial.println("\n=======================================================");
  Serial.println("  INSURE VIRTUAL ESP32 TELEMATICS CONTROLLER");
  Serial.println("=======================================================");
  Serial.println("  [A] Switch to SCENARIO A : Safe Commute (Speed ~35km/h, Helmet ON)");
  Serial.println("  [B] Switch to SCENARIO B : Risky Driving (Speed ~95km/h, Pot/Switch active)");
  Serial.println("  [C] Trigger SCENARIO C   : Collision Spike (7.4g Impact, Siren Beep)");
  Serial.println("  [D] Trigger SCENARIO D   : Two-Vehicle Correlated Crash (Bike 001 & 002)");
  Serial.println("  [R] RESET Alarm / State  : Silence Siren & Clear Collision Warning");
  Serial.println("  [1] Select Vehicle       : INSURE-BIKE-001 (ESP32-DEV-001)");
  Serial.println("  [2] Select Vehicle       : INSURE-BIKE-002 (ESP32-DEV-002)");
  Serial.println("  [S] Send Telemetry       : Immediate Single Transmission");
  Serial.println("  [H] Help Menu            : Show this interactive menu");
  Serial.println("=======================================================\n");
}

void handleSerialCommand() {
  if (Serial.available() > 0) {
    char cmd = Serial.read();
    while (Serial.available()) Serial.read(); // Flush extra chars

    switch (cmd) {
      case 'A':
      case 'a':
        currentScenario = SCENARIO_SAFE;
        collisionActive = false;
        digitalWrite(PIN_LED_RED, LOW);
        digitalWrite(PIN_BUZZER, LOW);
        Serial.println("\n>>> [SCENARIO ACTIVE] SCENARIO A: SAFE COMMUTE");
        Serial.println(">>> Moderate speed (35 km/h), Helmet Detected, Smooth driving.");
        break;

      case 'B':
      case 'b':
        currentScenario = SCENARIO_RISKY;
        collisionActive = false;
        digitalWrite(PIN_LED_RED, LOW);
        digitalWrite(PIN_BUZZER, LOW);
        Serial.println("\n>>> [SCENARIO ACTIVE] SCENARIO B: RISKY DRIVING");
        Serial.println(">>> Overspeeding (95 km/h), Dynamic Helmet/Potentiometer states active.");
        break;

      case 'C':
      case 'c':
        currentScenario = SCENARIO_COLLISION;
        collisionActive = true;
        digitalWrite(PIN_LED_RED, HIGH);
        Serial.println("\n>>> [SCENARIO ACTIVE] SCENARIO C: POSSIBLE COLLISION ALERT");
        Serial.println(">>> 7.42g Impact Spike, Severe Deceleration -18.5 m/s², Siren Active!");
        // Sound buzzer siren
        soundBuzzerBeep(1200, 350);
        {
          String payload = buildTelemetryJson(activeVehicleIndex, SCENARIO_COLLISION, true);
          sendTelemetry(payload);
        }
        break;

      case 'D':
      case 'd':
        currentScenario = SCENARIO_TWO_VEHICLE;
        collisionActive = true;
        digitalWrite(PIN_LED_RED, HIGH);
        soundBuzzerBeep(1400, 400);
        Serial.println("\n>>> [SCENARIO ACTIVE] SCENARIO D: TWO-VEHICLE CORRELATED INCIDENT");
        Serial.println(">>> Dispatches correlated events for INSURE-BIKE-001 and INSURE-BIKE-002...");
        {
          // Vehicle 1: Severe impact
          String p1 = buildTelemetryJson(0, SCENARIO_COLLISION, true);
          sendTelemetry(p1);
          delay(800);

          // Vehicle 2: Correlated emergency brake / proximity impact at same junction
          baseLat[1] = baseLat[0] + 0.00004;
          baseLng[1] = baseLng[0] + 0.00003;
          String p2 = buildTelemetryJson(1, SCENARIO_COLLISION, true);
          sendTelemetry(p2);
          Serial.println(">>> Both vehicle records dispatched. Distinct event IDs. Fault: UNKNOWN.");
        }
        break;

      case 'R':
      case 'r':
        collisionActive = false;
        currentScenario = SCENARIO_SAFE;
        digitalWrite(PIN_LED_RED, LOW);
        digitalWrite(PIN_BUZZER, LOW);
        digitalWrite(PIN_LED_GREEN, HIGH);
        Serial.println("\n>>> [RESET] Collision siren silenced. Scenario returned to Safe Commute.");
        break;

      case '1':
        activeVehicleIndex = 0;
        Serial.println("\n>>> Active vehicle switched to: INSURE-BIKE-001 (Device: ESP32-DEV-001)");
        break;

      case '2':
        activeVehicleIndex = 1;
        Serial.println("\n>>> Active vehicle switched to: INSURE-BIKE-002 (Device: ESP32-DEV-002)");
        break;

      case 'S':
      case 's':
        Serial.println("\n>>> Manual Single Telemetry Packet Triggered:");
        {
          String payload = buildTelemetryJson(activeVehicleIndex, currentScenario);
          sendTelemetry(payload);
        }
        break;

      case 'H':
      case 'h':
        printHelp();
        break;

      default:
        break;
    }
  }
}

// ── Arduino Setup ───────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n=======================================================");
  Serial.println("  INSURE Embedded Virtual Telematics Unit (ESP32)");
  Serial.println("  Hardware-Driven Synthetic Telematics Prototype");
  Serial.println("=======================================================");

  pinMode(PIN_IMPACT_BTN,    INPUT_PULLUP);
  pinMode(PIN_HELMET_SW,     INPUT_PULLUP);
  pinMode(PIN_POT_ALCOHOL,   INPUT);
  pinMode(PIN_LED_GREEN,     OUTPUT);
  pinMode(PIN_LED_RED,       OUTPUT);
  pinMode(PIN_BUZZER,        OUTPUT);

  digitalWrite(PIN_LED_GREEN, HIGH);
  digitalWrite(PIN_LED_RED,   LOW);
  digitalWrite(PIN_BUZZER,    LOW);

  // Initialize MPU6050 Accelerometer
  initMPU6050();

  // Connect to Wokwi virtual WiFi
  Serial.print("[WiFi] Connecting to ");
  Serial.println(WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long wifiStart = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - wifiStart < 8000) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Connected successfully!");
    Serial.print("[WiFi] Virtual IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n[WiFi] Virtual WiFi not yet ready — continuing in local simulation mode.");
  }

  printHelp();
}

// ── Main Execution Loop ─────────────────────────────────────────────────────
void loop() {
  handleSerialCommand();

  // 1. Check Hardware Pushbutton for Instant Impact Simulation (GPIO 18)
  if (digitalRead(PIN_IMPACT_BTN) == LOW) {
    delay(50); // Debounce
    if (digitalRead(PIN_IMPACT_BTN) == LOW) {
      Serial.println("\n[HARDWARE PUSHBUTTON] Impact / Collision Trigger Pressed!");
      collisionActive = true;
      currentScenario = SCENARIO_COLLISION;
      digitalWrite(PIN_LED_RED, HIGH);
      soundBuzzerBeep(1200, 350);

      String payload = buildTelemetryJson(activeVehicleIndex, SCENARIO_COLLISION, true);
      sendTelemetry(payload);
      delay(1500); // Prevent multi-triggering
    }
  }

  // 2. Periodic Telemetry Transmission
  unsigned long now = millis();
  if (now - lastTransmitTime >= TRANSMIT_INTERVAL_MS) {
    lastTransmitTime = now;

    // Heartbeat blink on Green LED
    if (!collisionActive) {
      digitalWrite(PIN_LED_GREEN, LOW);
      delay(80);
      digitalWrite(PIN_LED_GREEN, HIGH);
    }

    String payload = buildTelemetryJson(activeVehicleIndex, currentScenario);
    sendTelemetry(payload);

    // If collision was triggered once, auto-reset to safe driving after transmission
    if (currentScenario == SCENARIO_COLLISION) {
      currentScenario = SCENARIO_SAFE;
      collisionActive = false;
      digitalWrite(PIN_LED_RED, LOW);
      digitalWrite(PIN_LED_GREEN, HIGH);
      Serial.println("\n[Auto-Reset] Resumed Safe Driving scenario following collision event.");
    }
  }

  delay(20);
}