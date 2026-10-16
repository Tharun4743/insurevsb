import React, { useState, useEffect, useRef } from 'react';
import {
  Activity, Shield, AlertTriangle, AlertCircle, Wifi, WifiOff,
  RefreshCw, CheckCircle2, XCircle, MapPin, Gauge, Cpu, Flame,
  HelpCircle, Zap, Award, Scale, Check, ExternalLink, Sliders, Layers,
  Play, Square, Radio
} from 'lucide-react';
import { getIotLatestTelemetry, getIotTelemetryHistory, getIotAlerts, getIotVehicles, sendIotTelemetry } from '../api/client';

export function IotTelematicsMonitor() {
  const [selectedVehicle, setSelectedVehicle] = useState<string>('INSURE-BIKE-001');
  const [viewMode, setViewMode] = useState<'all' | 'hardware' | 'actuarial'>('all');
  const [latestReading, setLatestReading] = useState<any>(null);
  const [assessment, setAssessment] = useState<any>(null);
  const [quote, setQuote] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<Date | null>(null);
  const [pollingActive, setPollingActive] = useState<boolean>(true);
  const [showGuide, setShowGuide] = useState<boolean>(false);

  // Live Simulation Controller State
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [simScenario, setSimScenario] = useState<'safe' | 'risky' | 'collision'>('safe');
  const [packetCount, setPacketCount] = useState<number>(0);
  const [sendingPacket, setSendingPacket] = useState<boolean>(false);
  const simSequenceRef = useRef<number>(2000 + Math.floor(Math.random() * 5000));
  const simIntervalRef = useRef<any>(null);

  const isMountedRef = useRef(true);
  const inFlightRef = useRef(false);

  const WOKWI_PROJECT_URL = 'https://wokwi.com/projects/478002558874029057';

  const sendSimulationPacket = async (scenario: 'safe' | 'risky' | 'collision') => {
    setSendingPacket(true);
    simSequenceRef.current += 1;
    const seq = simSequenceRef.current;
    const deviceId = selectedVehicle === 'INSURE-BIKE-001' ? 'ESP32-DEV-001' : 'ESP32-DEV-002';

    let speed = 40.0;
    let accel = 0.5;
    let impact = 0.98;
    let helmet = true;
    let alcohol = 0.00;
    let eventType = 'regular';

    if (scenario === 'safe') {
      speed = Math.round((38 + Math.random() * 8) * 10) / 10;
      accel = Math.round((-0.5 + Math.random() * 1.2) * 100) / 100;
      impact = Math.round((0.95 + Math.random() * 0.1) * 100) / 100;
      helmet = true;
      alcohol = 0.00;
      eventType = 'regular';
    } else if (scenario === 'risky') {
      speed = Math.round((82 + Math.random() * 18) * 10) / 10;
      accel = Math.round((-4.8 + Math.random() * 7.5) * 100) / 100;
      impact = Math.round((1.2 + Math.random() * 0.8) * 100) / 100;
      helmet = false;
      alcohol = 0.28;
      eventType = 'speeding_breach';
    } else if (scenario === 'collision') {
      speed = 0.0;
      accel = -8.5;
      impact = 6.85; // > 5.0g triggers collision alert
      helmet = true;
      alcohol = 0.00;
      eventType = 'collision';
    }

    const payload = {
      eventId: `sim-${selectedVehicle.toLowerCase()}-${Date.now()}-${seq}`,
      deviceId,
      vehicleId: selectedVehicle,
      sequenceNumber: seq,
      timestamp: new Date().toISOString(),
      speed_kmh: speed,
      acceleration_ms2: accel,
      impact_magnitude_g: impact,
      helmet_detected: helmet,
      alcohol_ppm: alcohol,
      latitude: 12.9716 + (seq % 100) * 0.0001,
      longitude: 77.5946 + (seq % 100) * 0.0001,
      ignition_state: 'ON',
      event_type: eventType,
      synthetic: true,
    };

    try {
      await sendIotTelemetry(payload);
      setPacketCount(c => c + 1);
      await fetchData(true);
    } catch (e: any) {
      console.error('Simulation packet error:', e.message);
    } finally {
      setSendingPacket(false);
    }
  };

  const startLiveSimulation = (scenario: 'safe' | 'risky' | 'collision') => {
    setSimScenario(scenario);
    setIsSimulating(true);
    if (simIntervalRef.current) clearInterval(simIntervalRef.current);

    // Send immediate first packet
    sendSimulationPacket(scenario);

    // Stream continuously every 2.5 seconds
    simIntervalRef.current = setInterval(() => {
      sendSimulationPacket(scenario);
    }, 2500);
  };

  const stopLiveSimulation = () => {
    setIsSimulating(false);
    if (simIntervalRef.current) {
      clearInterval(simIntervalRef.current);
      simIntervalRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (simIntervalRef.current) clearInterval(simIntervalRef.current);
    };
  }, []);

  const fetchData = async (isManual = false) => {
    if (inFlightRef.current && !isManual) return;
    inFlightRef.current = true;

    try {
      const [latestRes, historyRes, alertsRes, vehiclesRes] = await Promise.all([
        getIotLatestTelemetry(selectedVehicle).catch(() => ({ latest: null, assessment: null, quote: null })),
        getIotTelemetryHistory(selectedVehicle, 15).catch(() => ({ readings: [] })),
        getIotAlerts().catch(() => ({ alerts: [] })),
        getIotVehicles().catch(() => ({ vehicles: [] })),
      ]);

      if (!isMountedRef.current) return;

      if (latestRes?.latest) {
        setLatestReading(latestRes.latest);
      } else {
        setLatestReading(null);
      }
      setAssessment(latestRes?.assessment || null);
      setQuote(latestRes?.quote || null);
      setHistory(historyRes?.readings || []);
      setAlerts(alertsRes?.alerts || []);
      setVehicles(vehiclesRes?.vehicles || []);
      setLastFetchTime(new Date());
      setError(null);
    } catch (err: any) {
      if (isMountedRef.current) {
        setError(err.message || 'Failed to connect to backend telemetry stream.');
      }
    } finally {
      inFlightRef.current = false;
      if (isMountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    fetchData(true);

    if (!pollingActive) return;

    // 4-second bounded polling loop
    const intervalId = setInterval(() => {
      fetchData(false);
    }, 4000);

    return () => {
      isMountedRef.current = false;
      clearInterval(intervalId);
    };
  }, [selectedVehicle, pollingActive]);

  // Determine freshness: packet within last 20s is considered fresh streaming
  const now = Date.now();
  const packetAgeMs = latestReading?.timestamp
    ? now - new Date(latestReading.timestamp).getTime()
    : null;
  const isFresh = packetAgeMs !== null && packetAgeMs < 20000;

  // Filter collision alerts for the selected vehicle or cross-vehicle incidents
  const vehicleAlerts = alerts.filter(
    (a) => !a.vehicle_id || a.vehicle_id === selectedVehicle
  );

  const activeDeviceId = selectedVehicle === 'INSURE-BIKE-001' ? 'ESP32-DEV-001' : 'ESP32-DEV-002';
  const vehicleMake = selectedVehicle === 'INSURE-BIKE-001' ? 'Ather 450X Gen 3 (EV)' : 'Ola Electric S1 Pro (EV)';

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* ── Top Header & Wokwi Circuit Direct Launcher ────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-slate-800">
                  Virtual ESP32 Telematics Live Monitor
                </h2>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                  SYNTHETIC IOT TELEMATICS
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Connected to Wokwi virtual hardware circuit at <code className="font-mono text-slate-700 bg-slate-100 px-1 py-0.5 rounded">{WOKWI_PROJECT_URL}</code>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Stream Status Pill */}
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${
                isFresh
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                  : latestReading
                  ? 'bg-amber-50 text-amber-700 border-amber-300'
                  : 'bg-slate-100 text-slate-600 border-slate-300'
              }`}
            >
              {isFresh ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  <span>Live Stream Active ({latestReading?.timestamp ? new Date(latestReading.timestamp).toLocaleTimeString() : ''})</span>
                </>
              ) : latestReading ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span>Idle / Stale (&gt;20s) • Last Packet: {new Date(latestReading.timestamp).toLocaleTimeString()}</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-slate-400" />
                  <span>Awaiting Packets</span>
                </>
              )}
            </div>

            {/* Live Gateway Clock Badge */}
            <div className="hidden sm:flex items-center gap-1 px-2.5 py-1 text-[11px] font-mono text-slate-600 bg-slate-100 border border-slate-200 rounded-lg">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Gateway Polling: {lastFetchTime ? lastFetchTime.toLocaleTimeString() : 'Syncing...'}</span>
            </div>

            {/* Launch Tab 1 Button */}
            <a
              href={WOKWI_PROJECT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-sm transition-colors"
            >
              <span>Launch Wokwi Circuit (Tab 1)</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            {/* Manual Refresh */}
            <button
              onClick={() => fetchData(true)}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
              title="Manual Fetch"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            {/* Wokwi Guide Button */}
            <button
              onClick={() => setShowGuide(!showGuide)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Guide</span>
            </button>
          </div>
        </div>

        {/* ── 2 Types Switcher & Vehicle Selector Bar ─────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between border-t border-slate-100 pt-3 gap-3">
          {/* Vehicle selector */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Vehicle:</span>
            {['INSURE-BIKE-001', 'INSURE-BIKE-002'].map((vId) => (
              <button
                key={vId}
                onClick={() => setSelectedVehicle(vId)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                  selectedVehicle === vId
                    ? 'bg-slate-800 text-white border-slate-800 shadow-sm'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {vId}
              </button>
            ))}
            <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-1 rounded border border-slate-200">
              {activeDeviceId} ({vehicleMake})
            </span>
          </div>

          {/* Mode Switcher: Type 1 vs Type 2 */}
          <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-semibold">
            <button
              onClick={() => setViewMode('all')}
              className={`px-3 py-1 rounded-lg transition-all ${
                viewMode === 'all'
                  ? 'bg-white text-brand-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All-in-One Live View
            </button>
            <button
              onClick={() => setViewMode('hardware')}
              className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 ${
                viewMode === 'hardware'
                  ? 'bg-white text-brand-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sliders className="w-3.5 h-3.5 text-blue-500" />
              <span>1. Virtual Circuit Data</span>
            </button>
            <button
              onClick={() => setViewMode('actuarial')}
              className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 ${
                viewMode === 'actuarial'
                  ? 'bg-white text-brand-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Award className="w-3.5 h-3.5 text-emerald-500" />
              <span>2. Scenario Insurance Calculations</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── ⚡ Real Live Driving Simulation Controller ────────────────────── */}
      <div className="bg-slate-900 text-white rounded-2xl border border-slate-800 p-3.5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl ${isSimulating ? 'bg-emerald-500/20 text-emerald-400 animate-pulse' : 'bg-white/10 text-slate-300'}`}>
              <Radio className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white">
                  Live Drive Streamer
                </span>
                {isSimulating ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 animate-pulse flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    STREAMING ({packetCount} pkts)
                  </span>
                ) : (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/10 text-slate-400">
                    Ready to stream live
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!isSimulating ? (
              <>
                <button
                  type="button"
                  id="btn-start-sim-safe"
                  onClick={() => startLiveSimulation('safe')}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 text-white fill-white" />
                  <span>Start Safe Drive</span>
                </button>
                <button
                  type="button"
                  id="btn-start-sim-risky"
                  onClick={() => startLiveSimulation('risky')}
                  className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-white" />
                  <span>Start Risky Drive</span>
                </button>
                <button
                  type="button"
                  id="btn-start-sim-collision"
                  onClick={() => startLiveSimulation('collision')}
                  className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <Flame className="w-3.5 h-3.5 text-white" />
                  <span>Trigger Collision Spike</span>
                </button>
              </>
            ) : (
              <>
                <span className="text-xs text-indigo-300 font-mono hidden sm:inline">
                  Mode: <strong className="text-white uppercase">{simScenario}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => startLiveSimulation(simScenario === 'safe' ? 'risky' : 'safe')}
                  className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Switch to {simScenario === 'safe' ? 'Risky' : 'Safe'}
                </button>
                <button
                  type="button"
                  onClick={() => sendSimulationPacket('collision')}
                  className="px-2.5 py-1.5 rounded-xl bg-rose-600/80 hover:bg-rose-600 text-white text-xs font-bold transition-colors cursor-pointer"
                  title="Inject sudden collision impact"
                >
                  Trigger Collision
                </button>
                <button
                  type="button"
                  id="btn-stop-live-sim"
                  onClick={stopLiveSimulation}
                  className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5 fill-white" />
                  <span>Stop Stream</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Quick Wokwi Interactive Guide (Collapsible) ────────────────────────── */}
      {showGuide && (
        <div className="bg-slate-900 text-slate-100 border border-slate-700 rounded-2xl p-5 text-xs space-y-3 shadow-md animate-fadeIn">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-sm text-brand-400">
              <Zap className="w-4 h-4 text-brand-400" />
              <span>Wokwi Virtual Hardware Controls (Tab 1: {WOKWI_PROJECT_URL})</span>
            </div>
            <button
              onClick={() => setShowGuide(false)}
              className="text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          <p className="text-slate-300">
            You can interact with the circuit in two ways in Tab 1:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 space-y-1.5">
              <span className="font-bold text-blue-400">Interactive Circuit Hardware:</span>
              <ul className="list-disc list-inside text-slate-300 space-y-1 text-[11px]">
                <li><strong>Slide Switch (GPIO 19):</strong> Flip to change Helmet state (Left=ON, Right=OFF).</li>
                <li><strong>Potentiometer (GPIO 34):</strong> Turn knob to change Alcohol level (0–0.80 ppm).</li>
                <li><strong>Pushbutton (GPIO 18):</strong> Press to trigger immediate 7.42g collision event.</li>
                <li><strong>MPU6050 (GPIO 21/22):</strong> Virtual accelerometer provides dynamic motion.</li>
              </ul>
            </div>
            <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 space-y-1.5 font-mono">
              <span className="font-bold text-emerald-400 font-sans">Serial Monitor Commands:</span>
              <div className="text-[11px] text-slate-300 space-y-0.5">
                <div><span className="text-emerald-400 font-bold">[A]</span> Safe Commute (Speed ~35 km/h, Helmet ON)</div>
                <div><span className="text-amber-400 font-bold">[B]</span> Risky Driving (Speed ~95 km/h, Pot/Switch active)</div>
                <div><span className="text-rose-400 font-bold">[C]</span> Collision Spike (7.42g Impact, Siren Alarm)</div>
                <div><span className="text-purple-400 font-bold">[D]</span> Two-Vehicle Crash (Bikes 001 & 002)</div>
                <div><span className="text-cyan-400 font-bold">[R]</span> Reset: Silence siren & return to Safe status</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Error Banner ──────────────────────────────────────────────────────── */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 flex items-center gap-3 text-xs font-semibold">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          TYPE 1: LIVE VIRTUAL CIRCUIT HARDWARE DATA (Sensors & Microcontroller)
         ══════════════════════════════════════════════════════════════════════════ */}
      {(viewMode === 'all' || viewMode === 'hardware') && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-bold text-xs">
                1
              </span>
              <h3 className="text-sm font-bold text-slate-800">
                Live Virtual Circuit Hardware Sensors (Wokwi ESP32 Telemetry)
              </h3>
            </div>
            <span className="text-xs text-slate-500 font-mono">
              Source: ESP32 DevKit V1 (Pins 18, 19, 21, 22, 25, 26, 27, 34)
            </span>
          </div>

          {/* Sensor Readout Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
            {/* Speed */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider">Speedometer</span>
                <Gauge className="w-4 h-4 text-blue-500" />
              </div>
              <div>
                <div className="text-2xl font-black text-slate-800">
                  {latestReading?.speed_kmh != null ? Number(latestReading.speed_kmh).toFixed(1) : '--'}
                  <span className="text-xs font-semibold text-slate-500 ml-1">km/h</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  {latestReading?.speed_kmh > 80 ? (
                    <span className="text-amber-600 font-semibold">⚠ Overspeeding (+{(Number(latestReading.speed_kmh) - 80).toFixed(1)} km/h)</span>
                  ) : (
                    <span className="text-emerald-600 font-semibold">✓ Safe urban speed (&lt; 80 km/h)</span>
                  )}
                </p>
              </div>
            </div>

            {/* Acceleration (MPU6050) */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider">MPU6050 Accel</span>
                <Activity className="w-4 h-4 text-indigo-500" />
              </div>
              <div>
                <div className="text-2xl font-black text-slate-800">
                  {latestReading?.acceleration_ms2 != null
                    ? Number(latestReading.acceleration_ms2).toFixed(2)
                    : '--'}
                  <span className="text-xs font-semibold text-slate-500 ml-1">m/s²</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  {latestReading?.acceleration_ms2 < -4.0 ? (
                    <span className="text-red-600 font-semibold">⚠ Harsh braking event</span>
                  ) : latestReading?.acceleration_ms2 > 3.5 ? (
                    <span className="text-amber-600 font-semibold">⚠ Rapid acceleration</span>
                  ) : (
                    <span className="text-emerald-600 font-semibold">✓ Smooth motion</span>
                  )}
                </p>
              </div>
            </div>

            {/* Impact G-force */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider">Impact Force</span>
                <Flame className="w-4 h-4 text-rose-500" />
              </div>
              <div>
                <div className="text-2xl font-black text-slate-800">
                  {latestReading?.impact_magnitude_g != null
                    ? Number(latestReading.impact_magnitude_g).toFixed(2)
                    : '1.00'}
                  <span className="text-xs font-semibold text-slate-500 ml-1">g</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  {latestReading?.impact_magnitude_g >= 5.0 ? (
                    <span className="text-red-600 font-bold">⚠ Collision threshold (&gt; 5.0g)</span>
                  ) : latestReading?.impact_magnitude_g >= 2.0 ? (
                    <span className="text-amber-600 font-semibold">⚠ Rough vibration</span>
                  ) : (
                    <span className="text-emerald-600 font-semibold">✓ Nominal road vibration</span>
                  )}
                </p>
              </div>
            </div>

            {/* Helmet Slide Switch (Pin 19) */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider">Helmet Switch</span>
                <Shield className="w-4 h-4 text-emerald-500" />
              </div>
              <div>
                <div className="text-sm font-bold mt-1">
                  {latestReading?.helmet_detected !== false ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                      <CheckCircle2 className="w-3 h-3" /> ON (Latched)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-xs font-bold">
                      <XCircle className="w-3 h-3" /> NOT DETECTED (Unlatched)
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 mt-1.5 font-mono">
                  Hardware Pin 19: {latestReading?.helmet_detected !== false ? 'HIGH (1)' : 'LOW (0)'}
                </p>
              </div>
            </div>

            {/* Potentiometer Alcohol (Pin 34) */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider">Potentiometer</span>
                <AlertTriangle className="w-4 h-4 text-amber-500" />
              </div>
              <div>
                <div className="text-2xl font-black text-slate-800">
                  {latestReading?.alcohol_ppm != null
                    ? Number(latestReading.alcohol_ppm).toFixed(2)
                    : '0.00'}
                  <span className="text-xs font-semibold text-slate-500 ml-1">ppm</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  {latestReading?.alcohol_ppm > 0.30 ? (
                    <span className="text-red-600 font-semibold">⚠ Elevated breath alcohol ({Number(latestReading.alcohol_ppm).toFixed(2)} ppm)</span>
                  ) : latestReading?.alcohol_ppm > 0.05 ? (
                    <span className="text-amber-600 font-semibold">⚠ Trace breath detected ({Number(latestReading.alcohol_ppm).toFixed(2)} ppm)</span>
                  ) : (
                    <span className="text-emerald-600 font-semibold">✓ 0.00 (Zero / Clear)</span>
                  )}
                </p>
              </div>
            </div>

            {/* Ignition / Seq */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider">Ignition / Seq</span>
                <Zap className="w-4 h-4 text-amber-500" />
              </div>
              <div>
                <div className="text-sm font-bold mt-1">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                      latestReading?.ignition_state === 'OFF'
                        ? 'bg-slate-200 text-slate-700'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {latestReading?.ignition_state || 'ON'}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1.5 font-mono">
                  Seq #{latestReading?.sequence_number || 1}
                </p>
              </div>
            </div>
          </div>

          {/* GPS Route Progress */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-red-500" />
                <span className="text-xs font-bold text-slate-800">
                  Virtual GPS Telematics Route (Bangalore Tech Corridor Expressway)
                </span>
              </div>
              <span className="text-xs font-mono text-slate-500">
                Lat: {latestReading?.latitude ? Number(latestReading.latitude).toFixed(6) : '12.971600'}° N, Lng:{' '}
                {latestReading?.longitude ? Number(latestReading.longitude).toFixed(6) : '77.594600'}° E
              </span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
              <div
                className="bg-brand-500 h-2 rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, Math.max(15, (history.length * 7) % 100))}%`,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          TYPE 2: SCENARIO-BASED ACTUARIAL INSURANCE CALCULATION
         ══════════════════════════════════════════════════════════════════════════ */}
      {(viewMode === 'all' || viewMode === 'actuarial') && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs">
                2
              </span>
              <h3 className="text-sm font-bold text-slate-800">
                Scenario-Based Actuarial Insurance Calculation (Rule Engine v2.1)
              </h3>
            </div>
            <span className="text-xs text-slate-500 font-mono">
              Status: {assessment ? 'Scored & Persisted' : `Accumulating readings (${history.length}/5)`}
            </span>
          </div>

          {/* Actuarial Scoring & Pricing Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
            {assessment ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Safety Score Card */}
                <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Calculated Safety Score
                    </span>
                    {assessment.data_confidence === 'provisional' && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                        PROVISIONAL
                      </span>
                    )}
                  </div>
                  <div className="my-2 flex items-baseline gap-2">
                    {assessment.safety_score != null ? (
                      <>
                        <span
                          className={`text-3xl font-black ${
                            assessment.safety_score >= 80
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : assessment.safety_score >= 50
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {Number(assessment.safety_score).toFixed(1)}
                        </span>
                        <span className="text-xs font-semibold text-slate-400">/ 100</span>
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded-full ml-auto ${
                            assessment.safety_score >= 80
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : assessment.safety_score >= 50
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                          }`}
                        >
                          {assessment.safety_score >= 80
                            ? 'SAFE DRIVER'
                            : assessment.safety_score >= 50
                            ? 'MODERATE RISK'
                            : 'ELEVATED RISK'}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-2xl font-bold text-slate-700 dark:text-slate-200">
                          Baseline Active
                        </span>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full ml-auto bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                          CALIBRATING
                        </span>
                      </>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {assessment.safety_score != null
                      ? `Driving Risk Index: ${Number(assessment.driving_risk_score || 0).toFixed(2)} | Confidence: ${assessment.data_confidence || 'high'}`
                      : 'Accumulating driving exposure. Baseline approved rate (₹2,000) applies without penalty.'}
                  </p>
                </div>

                {/* Fair Dynamic Premium Calculation (Continuous & Non-Constant) */}
                {(() => {
                  const s = assessment?.safety_score != null ? Number(assessment.safety_score) : null;
                  let dynamicAdjPct = quote?.behaviour_adjustment_pct != null ? Number(quote.behaviour_adjustment_pct) : 0;
                  
                  // Continuous non-constant calculation if score exists
                  if (s != null && (dynamicAdjPct === 0 || quote?.behaviour_adjustment_pct == null)) {
                    if (s > 65) {
                      dynamicAdjPct = -parseFloat(((s - 65) * (10 / 27)).toFixed(1));
                    } else if (s < 65) {
                      dynamicAdjPct = parseFloat(((65 - s) * 0.5).toFixed(1));
                    }
                  }
                  
                  const base = quote?.base_premium || 2000;
                  const dynamicPremium = quote?.illustrative_estimate != null && Number(quote?.behaviour_adjustment_pct) !== 0
                    ? Number(quote.illustrative_estimate)
                    : Math.round(base + (base * (dynamicAdjPct / 100)));

                  return (
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Fair Dynamic Premium
                      </span>
                      <div className="my-2 flex items-baseline gap-2">
                        <span className="text-3xl font-black text-slate-800">
                          ₹{dynamicPremium}
                        </span>
                        <span className="text-xs font-semibold text-slate-400">/ year</span>
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded-full ml-auto ${
                            dynamicAdjPct < 0
                              ? 'bg-emerald-100 text-emerald-800'
                              : dynamicAdjPct === 0
                              ? 'bg-slate-200 text-slate-700'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {dynamicAdjPct < 0
                            ? `${Math.abs(dynamicAdjPct).toFixed(1)}% DISCOUNT`
                            : dynamicAdjPct === 0
                            ? `0.0% NEUTRAL`
                            : `+${dynamicAdjPct.toFixed(1)}% SURCHARGE`}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Base: ₹{base} | Formula: Continuous Actuarial Pricing ({s != null ? `Score ${s.toFixed(1)}` : 'Standard Table'})
                      </p>
                    </div>
                  );
                })()}

                {/* Statutory Fairness Guarantee */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                    <Scale className="w-4 h-4 text-brand-600" />
                    <span>Statutory Fairness Guarantee</span>
                  </div>
                  <p className="text-[11px] text-slate-600 my-2 leading-relaxed">
                    Legitimate claim settlement is legally separated from dynamic pricing. Risk telemetry cannot reduce insurance payouts.
                  </p>
                  <span className="text-[10px] text-emerald-700 font-semibold flex items-center gap-1">
                    <Check className="w-3.5 h-3.5 text-emerald-600" /> Algorithmic Neutrality Enforced
                  </span>
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 p-4 rounded-xl border border-dashed border-slate-300 text-xs text-slate-600 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
                  <span>
                    Accumulating telemetry: <strong>{history.length}/5</strong> valid packets logged. Minimum 5 packets required to compute actuarial risk score and dynamic premium quote.
                  </span>
                </div>
                <span className="text-[11px] font-mono text-slate-400">
                  Run Scenario A or B in Wokwi
                </span>
              </div>
            )}

            {/* Scenario Reference Matrix */}
            <div className="border-t border-slate-100 pt-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-2">
                Demonstration Scenario Actuarial Reference Matrix:
              </span>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div className="p-2.5 bg-emerald-50/60 border border-emerald-200 rounded-lg">
                  <span className="font-bold text-emerald-800">[A] Safe Commute</span>
                  <div className="text-[11px] text-emerald-700 mt-1">Score: 90–95 | Premium: ₹1,800 (-10% Discount)</div>
                </div>
                <div className="p-2.5 bg-amber-50/60 border border-amber-200 rounded-lg">
                  <span className="font-bold text-amber-800">[B] Risky Driving</span>
                  <div className="text-[11px] text-amber-700 mt-1">Score: &lt;50 | Premium: ₹2,400 (+20% Surcharge)</div>
                </div>
                <div className="p-2.5 bg-rose-50/60 border border-rose-200 rounded-lg">
                  <span className="font-bold text-rose-800">[C] Collision Spike</span>
                  <div className="text-[11px] text-rose-700 mt-1">7.42g Impact | Fault: UNKNOWN (Unverified Alert)</div>
                </div>
                <div className="p-2.5 bg-purple-50/60 border border-purple-200 rounded-lg">
                  <span className="font-bold text-purple-800">[D] 2-Vehicle Crash</span>
                  <div className="text-[11px] text-purple-700 mt-1">Distinct event IDs | Both Faults: UNKNOWN</div>
                </div>
              </div>
            </div>
          </div>

          {/* Active Incident / Provisional Collision Alert Banner */}
          {vehicleAlerts.length > 0 && (
            <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-5 space-y-3 animate-fadeIn">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-rose-100 text-rose-700 rounded-xl mt-0.5">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-rose-900">
                      Provisional Collision Alert(s) Detected for {selectedVehicle}
                    </h3>
                    <p className="text-xs text-rose-700 mt-0.5">
                      Severe acceleration/impact spike triggered. An unverified provisional incident record has been created in PostgreSQL for compliance review.
                    </p>
                  </div>
                </div>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-rose-200 text-rose-800 border border-rose-300">
                  PROVISIONAL / UNVERIFIED
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                {vehicleAlerts.slice(0, 2).map((alert) => (
                  <div
                    key={alert.id}
                    className="bg-white p-3.5 rounded-xl border border-rose-200 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800">
                        Incident ID: {alert.id.substring(0, 8)}...
                      </span>
                      <span className="text-[10px] font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                        {new Date(alert.accident_date).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-slate-600 line-clamp-2">{alert.description}</p>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        Fault Status: {alert.fault_status ? alert.fault_status.toUpperCase() : 'UNKNOWN'}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                        Verification: {alert.is_verified ? 'VERIFIED' : 'PROVISIONAL (Adjuster Review Required)'}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                        Provisional Claim: ₹{Number(alert.claim_amount || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-[11px] text-rose-800/80 font-medium pt-1">
                ⚖ <strong>Fairness Principle:</strong> Under INSURE fair actuarial rules, sensor signals alone never prove driver fault or automatically raise premiums. Fault remains strictly unknown until formally verified by a certified human investigator.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Persisted Telemetry Stream Table (PostgreSQL) ──────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-brand-600" />
            <h3 className="text-sm font-bold text-slate-800">
              Persisted Telemetry Stream (PostgreSQL DB)
            </h3>
          </div>
          <span className="text-xs text-slate-500">Showing last {history.length} persisted packets</span>
        </div>

        {history.length === 0 ? (
          <div className="p-8 text-center text-slate-500 space-y-2 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            <WifiOff className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-xs font-semibold">No telemetry packets received yet for {selectedVehicle}.</p>
            <p className="text-[11px] text-slate-400">
              Launch the Wokwi ESP32 simulator in Tab 1 (<a href={WOKWI_PROJECT_URL} target="_blank" rel="noopener noreferrer" className="text-brand-600 underline">{WOKWI_PROJECT_URL}</a>) to begin transmitting packets.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Time</th>
                  <th className="py-2.5 px-3">Speed</th>
                  <th className="py-2.5 px-3">Accel</th>
                  <th className="py-2.5 px-3">Impact</th>
                  <th className="py-2.5 px-3">Helmet</th>
                  <th className="py-2.5 px-3">Alcohol</th>
                  <th className="py-2.5 px-3">Event Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {history.map((row) => (
                  <tr
                    key={row.id || row.event_id}
                    className={`hover:bg-slate-50 transition-colors ${
                      row.event_type === 'possible_collision' || row.impact_magnitude_g >= 5.0
                        ? 'bg-rose-50/60'
                        : ''
                    }`}
                  >
                    <td className="py-2 px-3 text-slate-500 text-[11px]">
                      {new Date(row.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="py-2 px-3 font-semibold">
                      <span className={row.speed_kmh > 80 ? 'text-amber-600' : 'text-slate-800'}>
                        {Number(row.speed_kmh).toFixed(1)} km/h
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className={
                          row.acceleration_ms2 < -4.0
                            ? 'text-red-600 font-bold'
                            : row.acceleration_ms2 > 3.0
                            ? 'text-amber-600'
                            : 'text-slate-700'
                        }
                      >
                        {Number(row.acceleration_ms2).toFixed(2)} m/s²
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className={
                          row.impact_magnitude_g >= 5.0
                            ? 'text-red-600 font-bold bg-red-100 px-1.5 py-0.5 rounded'
                            : 'text-slate-700'
                        }
                      >
                        {Number(row.impact_magnitude_g || 1.0).toFixed(2)}g
                      </span>
                    </td>
                    <td className="py-2 px-3 font-sans">
                      {row.helmet_detected !== false ? (
                        <span className="text-emerald-700 text-[10px] font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          ON
                        </span>
                      ) : (
                        <span className="text-rose-700 text-[10px] font-bold bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                          OFF
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-slate-600">
                      {Number(row.alcohol_ppm || 0).toFixed(2)} ppm
                    </td>
                    <td className="py-2 px-3 font-sans">
                      {row.event_type === 'possible_collision' ? (
                        <span className="text-red-700 font-bold bg-red-100 px-2 py-0.5 rounded-full text-[10px]">
                          COLLISION ALERT
                        </span>
                      ) : row.event_type === 'harsh_event' ? (
                        <span className="text-amber-700 font-bold bg-amber-100 px-2 py-0.5 rounded-full text-[10px]">
                          HARSH EVENT
                        </span>
                      ) : (
                        <span className="text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full text-[10px]">
                          Regular
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default IotTelematicsMonitor;
