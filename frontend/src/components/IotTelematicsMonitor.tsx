import React, { useState, useEffect, useRef } from 'react';
import {
  Activity, Shield, AlertTriangle, AlertCircle, Wifi, WifiOff,
  RefreshCw, CheckCircle2, XCircle, MapPin, Gauge, Cpu, Flame,
  HelpCircle, Eye, ChevronRight, Zap
} from 'lucide-react';
import { getIotLatestTelemetry, getIotTelemetryHistory, getIotAlerts, getIotVehicles } from '../api/client';
import { StatusBadge } from './ui';

export function IotTelematicsMonitor() {
  const [selectedVehicle, setSelectedVehicle] = useState<string>('INSURE-BIKE-001');
  const [latestReading, setLatestReading] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<Date | null>(null);
  const [pollingActive, setPollingActive] = useState<boolean>(true);
  const [showGuide, setShowGuide] = useState<boolean>(false);

  const isMountedRef = useRef(true);
  const inFlightRef = useRef(false);

  const fetchData = async (isManual = false) => {
    if (inFlightRef.current && !isManual) return;
    inFlightRef.current = true;

    try {
      const [latestRes, historyRes, alertsRes, vehiclesRes] = await Promise.all([
        getIotLatestTelemetry(selectedVehicle).catch(() => ({ latest: null })),
        getIotTelemetryHistory(selectedVehicle, 15).catch(() => ({ readings: [] })),
        getIotAlerts().catch(() => ({ alerts: [] })),
        getIotVehicles().catch(() => ({ vehicles: [] })),
      ]);

      if (!isMountedRef.current) return;

      if (latestRes?.latest) {
        setLatestReading(latestRes.latest);
      }
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

    // 4-second bounded polling interval per competition specification
    const intervalId = setInterval(() => {
      fetchData(false);
    }, 4000);

    return () => {
      isMountedRef.current = false;
      clearInterval(intervalId);
    };
  }, [selectedVehicle, pollingActive]);

  // Determine freshness: packet within last 12s is fresh live streaming
  const now = Date.now();
  const packetAgeMs = latestReading?.timestamp
    ? now - new Date(latestReading.timestamp).getTime()
    : null;
  const isFresh = packetAgeMs !== null && packetAgeMs < 20000;

  // Filter alerts for the selected vehicle or recent
  const vehicleAlerts = alerts.filter(
    (a) => !a.vehicle_id || a.vehicle_id === selectedVehicle
  );

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* ── Top Header & Connection Bar ───────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-800">
                  Virtual ESP32 Telematics Live Monitor
                </h2>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                  SYNTHETIC DATA (WOKWI)
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Cloud-connected virtual telematics stream from Wokwi ESP32 DevKit to Render backend.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
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
                  <span>Live Stream Active</span>
                </>
              ) : latestReading ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span>Idle / Stale (&gt;15s)</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-slate-400" />
                  <span>Awaiting Packets</span>
                </>
              )}
            </div>

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
              <span>Wokwi Guide</span>
            </button>
          </div>
        </div>

        {/* Vehicle Tabs & Polling Controls */}
        <div className="flex flex-wrap items-center justify-between border-t border-slate-100 pt-3 gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Monitor Vehicle:</span>
            {['INSURE-BIKE-001', 'INSURE-BIKE-002'].map((vId) => (
              <button
                key={vId}
                onClick={() => setSelectedVehicle(vId)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg border transition-all ${
                  selectedVehicle === vId
                    ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {vId}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-500">
            {lastFetchTime && (
              <span>Last polled: {lastFetchTime.toLocaleTimeString()} (4s bounded loop)</span>
            )}
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={pollingActive}
                onChange={(e) => setPollingActive(e.target.checked)}
                className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 h-3.5 w-3.5"
              />
              <span>Auto-refresh</span>
            </label>
          </div>
        </div>
      </div>

      {/* ── Quick Wokwi Interactive Guide (Collapsible) ────────────────────────── */}
      {showGuide && (
        <div className="bg-slate-900 text-slate-100 border border-slate-700 rounded-2xl p-5 text-xs space-y-3 shadow-md animate-fadeIn">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-sm text-brand-400">
              <Zap className="w-4 h-4 text-brand-400" />
              <span>Wokwi ESP32 Virtual Controller — Quick Command Keys</span>
            </div>
            <button
              onClick={() => setShowGuide(false)}
              className="text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          <p className="text-slate-300">
            Inside the Wokwi Serial Monitor, click inside the terminal and press any of these keys:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 font-mono">
            <div className="p-2.5 bg-slate-800 rounded-xl border border-slate-700">
              <span className="text-emerald-400 font-bold">[A]</span> Scenario A: Safe Driving (Speed ~35 km/h, Helmet ON)
            </div>
            <div className="p-2.5 bg-slate-800 rounded-xl border border-slate-700">
              <span className="text-amber-400 font-bold">[B]</span> Scenario B: Risky Driving (High speed ~95 km/h, Missing Helmet)
            </div>
            <div className="p-2.5 bg-slate-800 rounded-xl border border-slate-700">
              <span className="text-rose-400 font-bold">[C]</span> Scenario C: Collision Spike (7.4g impact, Decel -18.5 m/s²)
            </div>
            <div className="p-2.5 bg-slate-800 rounded-xl border border-slate-700">
              <span className="text-purple-400 font-bold">[D]</span> Scenario D: Two-Vehicle Correlated Crash (Bikes 001 & 002)
            </div>
          </div>
          <p className="text-slate-400 text-[11px]">
            Hardware Controls in Wokwi Canvas: <strong>Red Pushbutton</strong> triggers immediate impact spike (GPIO 18); <strong>Slide Switch</strong> toggles helmet sensor (GPIO 19).
          </p>
        </div>
      )}

      {/* ── Error Banner ──────────────────────────────────────────────────────── */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 flex items-center gap-3 text-xs font-semibold">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Live Sensor Readout Cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {/* Speed */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Speed</span>
            <Gauge className="w-4 h-4 text-blue-500" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-800">
              {latestReading?.speed_kmh != null ? Number(latestReading.speed_kmh).toFixed(1) : '--'}
              <span className="text-xs font-semibold text-slate-500 ml-1">km/h</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              {latestReading?.speed_kmh > 80 ? (
                <span className="text-amber-600 font-semibold">⚠ Overspeeding breach</span>
              ) : (
                <span className="text-emerald-600 font-semibold">✓ Safe urban speed</span>
              )}
            </p>
          </div>
        </div>

        {/* Acceleration */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Accel</span>
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
                <span className="text-emerald-600 font-semibold">✓ Smooth transition</span>
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
                <span className="text-red-600 font-bold">⚠ Collision threshold!</span>
              ) : (
                <span className="text-emerald-600 font-semibold">✓ Nominal road vibration</span>
              )}
            </p>
          </div>
        </div>

        {/* Helmet Sensor */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Helmet</span>
            <Shield className="w-4 h-4 text-emerald-500" />
          </div>
          <div>
            <div className="text-sm font-bold mt-1">
              {latestReading?.helmet_detected !== false ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                  <CheckCircle2 className="w-3 h-3" /> ON (Safe)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-xs font-bold">
                  <XCircle className="w-3 h-3" /> NOT DETECTED
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-500 mt-1.5">
              Simulated optical latch
            </p>
          </div>
        </div>

        {/* Alcohol Sensor */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Alcohol</span>
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
                <span className="text-red-600 font-semibold">Elevated level</span>
              ) : (
                <span className="text-emerald-600 font-semibold">0.00 (Zero / Clear)</span>
              )}
            </p>
          </div>
        </div>

        {/* Ignition & Sequence */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Ignition</span>
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
            <p className="text-[10px] text-slate-500 mt-1.5">
              Seq #{latestReading?.sequence_number || 1}
            </p>
          </div>
        </div>
      </div>

      {/* ── Active Incident / Possible Collision Banner ───────────────────────── */}
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
                  Qualifying synthetic impact event received. An unverified provisional incident record has been generated for compliance investigation.
                </p>
              </div>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-rose-200 text-rose-800 border border-rose-300">
              PENDING REVIEW
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
                    Fault Status: {alert.fault_status.toUpperCase()}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                    Estimated Claim: ₹{Number(alert.claim_amount || 0).toFixed(2)}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    (Provisional — Requires Adjuster Verification)
                  </span>
                </div>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-rose-800/80 font-medium pt-1">
            ⚖ <strong>Fairness Principle:</strong> Under INSURE fair actuarial rules, sensor signals alone never prove driver fault or automatically raise premiums. Fault remains unknown until formally verified by human review.
          </p>
        </div>
      )}

      {/* ── GPS Map & Coordinates Strip ───────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-red-500" />
            <h3 className="text-sm font-bold text-slate-800">
              Virtual GPS Telematics Route ({selectedVehicle})
            </h3>
          </div>
          <span className="text-xs font-mono text-slate-500">
            Lat: {latestReading?.latitude ? Number(latestReading.latitude).toFixed(6) : '12.971600'}°, Lng:{' '}
            {latestReading?.longitude ? Number(latestReading.longitude).toFixed(6) : '77.594600'}°
          </span>
        </div>

        {/* Visual Simulated Route Progress Bar */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span>Route: Bangalore Tech Corridor Expressway</span>
            <span className="font-semibold text-brand-600">
              Trip Status: In Progress ({history.length} points logged)
            </span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
            <div
              className="bg-brand-500 h-2 rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(100, Math.max(15, (history.length * 6) % 100))}%`,
              }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-slate-500 font-mono">
            <span>Point A: 12.971600° N, 77.594600° E</span>
            <span>Current: {latestReading?.latitude ? Number(latestReading.latitude).toFixed(6) : '12.971600'}° N</span>
            <span>Point B: 12.990000° N, 77.610000° E</span>
          </div>
        </div>
      </div>

      {/* ── Recent Telemetry Event Stream Table ────────────────────────────────── */}
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
              Launch the Wokwi ESP32 simulator or press 'S' in the Wokwi Serial Monitor to transmit synthetic packets.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Event ID</th>
                  <th className="py-2.5 px-3">Seq #</th>
                  <th className="py-2.5 px-3">Time</th>
                  <th className="py-2.5 px-3">Speed</th>
                  <th className="py-2.5 px-3">Accel</th>
                  <th className="py-2.5 px-3">Impact</th>
                  <th className="py-2.5 px-3">Helmet</th>
                  <th className="py-2.5 px-3">Alcohol</th>
                  <th className="py-2.5 px-3">Event Type</th>
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
                    <td className="py-2 px-3 text-slate-600 text-[11px]">
                      {row.event_id ? row.event_id.substring(0, 14) + '...' : row.id.substring(0, 8)}
                    </td>
                    <td className="py-2 px-3 font-semibold text-slate-800">
                      {row.sequence_number}
                    </td>
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
                            ? 'text-red-600 font-bold bg-red-100 px-1 py-0.5 rounded'
                            : 'text-slate-700'
                        }
                      >
                        {Number(row.impact_magnitude_g || 1.0).toFixed(2)}g
                      </span>
                    </td>
                    <td className="py-2 px-3 font-sans">
                      {row.helmet_detected !== false ? (
                        <span className="text-emerald-700 text-[10px] font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                          ON
                        </span>
                      ) : (
                        <span className="text-rose-700 text-[10px] font-bold bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                          OFF
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-slate-600">
                      {Number(row.alcohol_ppm || 0).toFixed(2)}
                    </td>
                    <td className="py-2 px-3 font-sans">
                      {row.event_type === 'possible_collision' ? (
                        <span className="text-red-700 font-bold bg-red-100 px-2 py-0.5 rounded-full text-[10px]">
                          COLLISION
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
