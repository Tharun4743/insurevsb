/**
 * INSURE Virtual IoT Telematics Simulator (ESP32)
 *
 * Simulates real-time 2-wheeler telematics for behavior-based insurance:
 *  - Vehicle identities: INSURE-BIKE-001 & INSURE-BIKE-002
 *  - Sensor streams: GPS (Lat/Lng), Speed (km/h), 3-axis Accel (m/s²), Impact (g),
 *    Helmet state (optical switch), and simulated Alcohol sensor (ppm).
 *  - Scenarios:
 *      [A] Safe Driving
 *      [B] Risky Driving (Overspeeding / Missing Helmet)
 *      [C] Possible Collision (High-g impact, rapid deceleration)
 *      [D] Two-Vehicle Correlated Incident (Bikes 001 & 002 correlated)
 *  - Network: Wokwi Virtual WiFi ("Wokwi-GUEST"), HTTPS POST to INSURE Ingestion API
 *  - Security: Authenticated with X-Device-Key header
 *
 * NOTE: All data produced by this firmware is explicitly marked as SYNTHETIC.
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>

// ── Virtual Hardware Configuration ──────────────────────────────────────────
#define PIN_IMPACT_BTN   18   // Pushbutton: Instant Collision Impact trigger
#define PIN_HELMET_SW    19   // Slide Switch: Helmet On (LOW) / Off (HIGH)
#define PIN_LED_GREEN    22   // Green LED: Active Heartbeat / Normal Telemetry
#define PIN_LED_RED      23   // Red LED: Collision Alert / Critical Warning

// ── WiFi & Cloud Backend Configuration ──────────────────────────────────────
const char* WIFI_SSID     = "Wokwi-GUEST";
const char* WIFI_PASSWORD = "";

// Default ingestion endpoint (can be overridden with deployed Render host)
// Format: "https://your-backend.onrender.com/api/iot/telemetry" or "http://your-ip:3001/api/iot/telemetry"
char backendUrl[160]      = "https://insure-backend.onrender.com/api/iot/telemetry";

// DEMO-ONLY CREDENTIAL NOTICE:
// In the public Wokwi virtual simulator, firmware source and simulator traffic are observable.
// This key is an isolated, synthetic DEMO key for development testing only.
// NEVER commit or embed real production API keys in public simulator firmware.
const char* DEVICE_KEY    = "demo-wokwi-virtual-key-dev-only-2026";

// Transmission interval in milliseconds (e.g. 4000ms = 4s bounded polling)
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

// Base Route GPS (Bangalore Tech Corridor)
double baseLat[2] = { 12.9716, 12.9720 };
double baseLng[2] = { 77.5946, 77.5952 };

// Collision state machine
bool collisionTriggered = false;
int collisionStep = 0;

// ── Helper: Generate Unique Event ID ────────────────────────────────────────
String generateEventId(const char* prefix) {
  uint32_t r1 = esp_random();
  uint32_t r2 = esp_random();
  char buf[40];
  snprintf(buf, sizeof(buf), "evt_%s_%08x%08x", prefix, r1, r2);
  return String(buf);
}

// ── Helper: Format ISO-8601 UTC Timestamp ───────────────────────────────────
String getIsoTimestamp() {
  // ESP32 uptime converted to simulated UTC string
  unsigned long ms = millis();
  unsigned long seconds = ms / 1000;
  unsigned int remMs = ms % 1000;

  time_t rawtime;
  time(&rawtime);

  // If NTP not synced, build a deterministic standard ISO timestamp
  if (rawtime < 100000) {
    rawtime = 1776300000 + seconds; // Synthetic 2026 epoch base
  }

  struct tm* ptm = gmtime(&rawtime);
  char buf[32];
  snprintf(buf, sizeof(buf), "%04d-%02d-%02dT%02d:%02d:%02d.%03dZ",
           ptm->tm_year + 1900, ptm->tm_mon + 1, ptm->tm_mday,
           ptm->tm_hour, ptm->tm_min, ptm->tm_sec, remMs);
  return String(buf);
}

// ── Build Single Telemetry Payload ──────────────────────────────────────────
String buildTelemetryJson(int vIdx, Scenario scn, bool isIncidentStep = false) {
  const char* vehicleId = VEHICLE_IDS[vIdx];
  const char* deviceId  = DEVICE_IDS[vIdx];
  unsigned long seq     = seqNumbers[vIdx]++;
  String eventId        = generateEventId(vIdx == 0 ? "b1" : "b2");
  String isoTime        = getIsoTimestamp();

  // Progress GPS along simulated corridor
  baseLat[vIdx] += 0.00015;
  baseLng[vIdx] += 0.00010;

  // Read hardware pins
  bool hwHelmetPressed = (digitalRead(PIN_HELMET_SW) == LOW); // LOW = switch closed (helmet on)
  bool hwImpactTrigger = (digitalRead(PIN_IMPACT_BTN) == LOW);

  double speedKmh = 35.0;
  double accelMs2 = 0.4;
  double impactG  = 1.0;
  bool helmetOn   = hwHelmetPressed;
  double alcohol  = 0.00;
  const char* ignition = "ON";
  const char* eventType = "regular";

  if (hwImpactTrigger || scn == SCENARIO_COLLISION || isIncidentStep) {
    // Collision scenario
    speedKmh = 0.0;
    accelMs2 = -18.5; // Extreme deceleration (m/s²)
    impactG  = 7.4;   // > 6.0g severe impact threshold
    ignition = "OFF";
    eventType = "possible_collision";
    digitalWrite(PIN_LED_RED, HIGH);
  } else if (scn == SCENARIO_RISKY) {
    // Risky scenario: high speed, missing helmet, aggressive acceleration
    speedKmh = 92.5 + ((millis() % 1500) / 100.0);
    accelMs2 = 4.2;
    impactG  = 1.4;
    helmetOn = false; // Missing helmet
    alcohol  = 0.38;  // Elevated alcohol sensor reading
    eventType = "harsh_event";
    digitalWrite(PIN_LED_RED, LOW);
  } else {
    // Safe scenario: moderate speed, helmet on, smooth acceleration
    speedKmh = 36.5 + ((millis() % 800) / 100.0);
    accelMs2 = 0.6;
    impactG  = 1.02;
    helmetOn = true;
    alcohol  = 0.00;
    eventType = "regular";
    digitalWrite(PIN_LED_RED, LOW);
  }

  // Construct JSON strictly matching backend canonical schema
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
    helmetOn ? "true" : "false",
    alcohol,
    baseLat[vIdx],
    baseLng[vIdx],
    ignition,
    eventType
  );

  return String(jsonBuf);
}

// ── HTTP/HTTPS Transmission with Retry ──────────────────────────────────────
bool sendTelemetry(const String& payload) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[IoT Transmit] WiFi disconnected. Attempting reconnect...");
    WiFi.reconnect();
    unsigned long waitStart = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - waitStart < 3000) {
      delay(200);
    }
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("[IoT Transmit] Offline mode — Telemetry printed to Serial only.");
      return false;
    }
  }

  digitalWrite(PIN_LED_GREEN, HIGH);

  WiFiClientSecure clientSecure;
  // TLS CERTIFICATE CONFIGURATION:
  // In physical production ESP32 hardware:
  // 1. Uncomment #define USE_STRICT_TLS_CERT below
  // 2. Supply the valid Root CA Certificate (e.g. ISRG Root X1 or DigiCert Global Root CA)
  // 3. Never deploy setInsecure() to physical production telematics hardware units.
  #ifdef USE_STRICT_TLS_CERT
    const char* ROOT_CA_PEM = "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----";
    clientSecure.setCACert(ROOT_CA_PEM);
  #else
    // Wokwi Virtual Simulator Limitation:
    // Wokwi virtual ESP32 lacks battery RTC and local Root CA bundles, causing TLS handshake failure
    // on dynamic cloud hosts unless setInsecure() is enabled. This is strictly for virtual simulation.
    clientSecure.setInsecure();
  #endif

  HTTPClient http;
  bool beginSuccess = false;

  if (String(backendUrl).startsWith("https")) {
    beginSuccess = http.begin(clientSecure, backendUrl);
  } else {
    WiFiClient plainClient;
    beginSuccess = http.begin(plainClient, backendUrl);
  }

  if (!beginSuccess) {
    Serial.println("[IoT Transmit] Failed to initiate HTTP connection to backend.");
    digitalWrite(PIN_LED_GREEN, LOW);
    return false;
  }

  http.setTimeout(8000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_KEY);

  Serial.println("[IoT Transmit] Sending HTTPS POST to: " + String(backendUrl));
  Serial.println("[IoT Payload] " + payload);

  int httpCode = http.POST(payload);

  if (httpCode > 0) {
    String response = http.getString();
    Serial.printf("[IoT Response] HTTP Status: %d\n", httpCode);
    Serial.println("[IoT Response Body] " + response);
    if (httpCode == 200 || httpCode == 201) {
      Serial.println("[IoT Result] >>> TELEMETRY SUCCESSFULLY INGESTED BY INSURE BACKEND <<<");
    } else {
      Serial.printf("[IoT Warning] Backend returned non-success code: %d\n", httpCode);
    }
    http.end();
    digitalWrite(PIN_LED_GREEN, LOW);
    return (httpCode == 200 || httpCode == 201);
  } else {
    Serial.printf("[IoT Error] POST request failed, error: %s\n", http.errorToString(httpCode).c_str());
    http.end();
    digitalWrite(PIN_LED_GREEN, LOW);
    return false;
  }
}

// ── Interactive Serial Command Handler ──────────────────────────────────────
void printHelp() {
  Serial.println("\n=======================================================");
  Serial.println("  INSURE VIRTUAL ESP32 TELEMATICS CONTROLLER");
  Serial.println("=======================================================");
  Serial.println("  [A] Switch to SCENARIO A : Safe Driving (Default)");
  Serial.println("  [B] Switch to SCENARIO B : Risky Driving");
  Serial.println("  [C] Trigger SCENARIO C   : Possible Collision Alert");
  Serial.println("  [D] Trigger SCENARIO D   : Two-Vehicle Correlated Incident");
  Serial.println("  [1] Select Vehicle       : INSURE-BIKE-001");
  Serial.println("  [2] Select Vehicle       : INSURE-BIKE-002");
  Serial.println("  [S] Send Telemetry       : Immediate Single Transmission");
  Serial.println("  [U] Set Backend URL      : Update Ingestion URL");
  Serial.println("  [H] Help Menu            : Show this command menu");
  Serial.println("=======================================================\n");
}

void handleSerialCommand() {
  if (Serial.available() > 0) {
    char cmd = Serial.read();
    while (Serial.available()) Serial.read(); // Flush trailing chars

    switch (cmd) {
      case 'A':
      case 'a':
        currentScenario = SCENARIO_SAFE;
        digitalWrite(PIN_LED_RED, LOW);
        Serial.println("\n>>> [SCENARIO ACTIVE] SCENARIO A: SAFE DRIVING (Moderate speed, Helmet ON, Smooth accel)");
        break;

      case 'B':
      case 'b':
        currentScenario = SCENARIO_RISKY;
        digitalWrite(PIN_LED_RED, LOW);
        Serial.println("\n>>> [SCENARIO ACTIVE] SCENARIO B: RISKY DRIVING (High speed, Missing Helmet, Rapid accel)");
        break;

      case 'C':
      case 'c':
        currentScenario = SCENARIO_COLLISION;
        digitalWrite(PIN_LED_RED, HIGH);
        Serial.println("\n>>> [SCENARIO ACTIVE] SCENARIO C: POSSIBLE COLLISION (7.4g Impact, Decel -18.5 m/s²)");
        // Immediately transmit collision event
        {
          String payload = buildTelemetryJson(activeVehicleIndex, SCENARIO_COLLISION, true);
          sendTelemetry(payload);
        }
        break;

      case 'D':
      case 'd':
        currentScenario = SCENARIO_TWO_VEHICLE;
        Serial.println("\n>>> [SCENARIO ACTIVE] SCENARIO D: TWO-VEHICLE CORRELATED INCIDENT");
        Serial.println(">>> Generating correlated incident events for INSURE-BIKE-001 and INSURE-BIKE-002...");
        {
          // Bike 1: Sudden impact at junction
          String p1 = buildTelemetryJson(0, SCENARIO_COLLISION, true);
          sendTelemetry(p1);
          delay(800);

          // Bike 2: Correlated emergency brake / proximity impact at same location
          baseLat[1] = baseLat[0] + 0.00003;
          baseLng[1] = baseLng[0] + 0.00004;
          String p2 = buildTelemetryJson(1, SCENARIO_COLLISION, true);
          sendTelemetry(p2);
          Serial.println(">>> Both vehicle events dispatched. Distinct event IDs preserved. Fault status: UNKNOWN.");
        }
        break;

      case '1':
        activeVehicleIndex = 0;
        Serial.println("\n>>> Active vehicle set to: INSURE-BIKE-001 (Device: ESP32-DEV-001)");
        break;

      case '2':
        activeVehicleIndex = 1;
        Serial.println("\n>>> Active vehicle set to: INSURE-BIKE-002 (Device: ESP32-DEV-002)");
        break;

      case 'S':
      case 's':
        Serial.println("\n>>> Manual Telemetry Triggered:");
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

// ── Setup ───────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n=======================================================");
  Serial.println("  INSURE Embedded Virtual Telematics Unit (ESP32)");
  Serial.println("  Explicitly Synthetic Sensor Simulation v1.0");
  Serial.println("=======================================================");

  pinMode(PIN_IMPACT_BTN, INPUT_PULLUP);
  pinMode(PIN_HELMET_SW,  INPUT_PULLUP);
  pinMode(PIN_LED_GREEN,  OUTPUT);
  pinMode(PIN_LED_RED,    OUTPUT);

  digitalWrite(PIN_LED_GREEN, LOW);
  digitalWrite(PIN_LED_RED,   LOW);

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
    Serial.print("[WiFi] IP Address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n[WiFi] Virtual WiFi not yet ready — continuing in local simulation mode.");
  }

  printHelp();
}

// ── Main Loop ───────────────────────────────────────────────────────────────
void loop() {
  handleSerialCommand();

  // Check hardware pushbutton for instant impact simulation
  if (digitalRead(PIN_IMPACT_BTN) == LOW) {
    delay(50); // Debounce
    if (digitalRead(PIN_IMPACT_BTN) == LOW) {
      Serial.println("\n[HARDWARE BUTTON TRIGGER] Pushbutton Impact Detected!");
      currentScenario = SCENARIO_COLLISION;
      String payload = buildTelemetryJson(activeVehicleIndex, SCENARIO_COLLISION, true);
      sendTelemetry(payload);
      delay(1000); // Prevent multi-triggers
    }
  }

  // Periodic Telemetry Transmission
  unsigned long now = millis();
  if (now - lastTransmitTime >= TRANSMIT_INTERVAL_MS) {
    lastTransmitTime = now;

    // Toggle green LED heartbeat
    digitalWrite(PIN_LED_GREEN, HIGH);
    delay(100);
    digitalWrite(PIN_LED_GREEN, LOW);

    // Build and send current vehicle telemetry
    String payload = buildTelemetryJson(activeVehicleIndex, currentScenario);
    sendTelemetry(payload);

    // If collision was a single event, return to safe driving after reporting
    if (currentScenario == SCENARIO_COLLISION) {
      currentScenario = SCENARIO_SAFE;
      digitalWrite(PIN_LED_RED, LOW);
      Serial.println("\n[Auto-Reset] Resumed Safe Driving scenario following collision event.");
    }
  }

  delay(20);
}
