import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import {
  Menu, Bell, Sun, Moon, Download, ShieldCheck, Check, AlertTriangle,
  Info, X, FileText, CheckCircle2
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getIotAlerts, getIotLatestTelemetry } from '../../api/client';

const PAGE_METADATA: Record<string, { title: string; subtitle: string }> = {
  '/':             { title: 'Telematics Dashboard', subtitle: 'BEHAVIOURAL PRICING & TRIPS OVERVIEW' },
  '/admin':        { title: 'Admin Portfolio', subtitle: 'INSURE GOVERNANCE & ACTUARIAL RULES' },
  '/compliance':   { title: 'Compliance Center', subtitle: 'MODEL FAIRNESS & CUSTOMER DISPUTES' },
  '/simulator':    { title: 'IoT Driving Simulator', subtitle: 'SYNTHETIC TELEMATICS INGESTION ENGINE' },
  '/trips':        { title: 'Trip Telematics', subtitle: 'RAW MEASUREMENTS & SENSOR LOGS' },
  '/consent':      { title: 'Privacy & Consent', subtitle: 'DATA ACCESS & SOVEREIGN DRIVER PERMISSIONS' },
  '/assessments':  { title: 'Risk Assessments', subtitle: 'EXPLAINABLE 5-FACTOR SCORING ENGINE' },
  '/review':       { title: 'Underwriting Review', subtitle: 'HUMAN-IN-THE-LOOP AUDIT QUEUE' },
  '/audit':        { title: 'Compliance Audit Trail', subtitle: 'IMMUTABLE EVENT CHRONOLOGY' },
  '/profitability':{ title: 'Portfolio Growth & Economics', subtitle: 'UNDERWRITING PROFITABILITY SIMULATOR' },
};

function getHeaderMeta(path: string) {
  if (PAGE_METADATA[path]) return PAGE_METADATA[path];
  for (const [key, val] of Object.entries(PAGE_METADATA)) {
    if (key !== '/' && path.startsWith(key)) return val;
  }
  return { title: 'Telematics Dashboard', subtitle: 'BEHAVIOURAL PRICING & TRIPS OVERVIEW' };
}

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  time: string;
  type: 'alert' | 'info' | 'success';
  read: boolean;
}

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('insure_theme') === 'dark' ||
      window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [showNotifications, setShowNotifications] = useState(false);
  const [exportingReport, setExportingReport] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  const [notifications, setNotifications] = useState<NotificationItem[]>([
    {
      id: 'notif-1',
      title: 'Provisional Collision Alert',
      message: 'Vehicle INSURE-BIKE-001 logged impact >5.0g. Fault status marked UNKNOWN.',
      time: 'Just now',
      type: 'alert',
      read: false,
    },
    {
      id: 'notif-2',
      title: 'Dynamic Actuarial Premium',
      message: 'Safety Score 92/100 qualified driver for 10% discount (₹1,800/yr).',
      time: '12m ago',
      type: 'success',
      read: false,
    },
    {
      id: 'notif-3',
      title: 'Statutory Fairness Guarantee',
      message: 'Underwriting rules v2.1-profitability synchronized with zero static constants.',
      time: '1h ago',
      type: 'info',
      read: false,
    },
  ]);

  const location = useLocation();
  const { role } = useAuth();
  const meta = getHeaderMeta(location.pathname);

  // Sync dark mode class on <html> element
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('insure_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('insure_theme', 'light');
    }
  }, [darkMode]);

  // Load live IoT alerts into notification center
  useEffect(() => {
    getIotAlerts()
      .then((res: any) => {
        if (res?.alerts && res.alerts.length > 0) {
          const liveAlerts: NotificationItem[] = res.alerts.slice(0, 5).map((a: any, idx: number) => ({
            id: a.id || `live-${idx}`,
            title: a.title || 'IoT Telematics Event',
            message: a.message || `Impact detected for ${a.vehicle_id || 'fleet vehicle'}.`,
            time: 'Live',
            type: a.severity === 'high' ? 'alert' : 'info',
            read: false,
          }));
          setNotifications(prev => [...liveAlerts, ...prev.slice(0, 2)]);
        }
      })
      .catch(() => {});
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  const toggleDarkMode = () => {
    setDarkMode(prev => !prev);
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  // Functional CSV Report Export
  const handleExportReport = async () => {
    setExportingReport(true);
    try {
      const liveData = await getIotLatestTelemetry().catch(() => ({ latest: null, assessment: null, quote: null }));
      const now = new Date().toISOString();

      const csvRows = [
        ['Report Name', 'INSURE Actuarial Telematics Report'],
        ['Generated At', now],
        ['Portal Role', (role || 'Customer').toUpperCase()],
        ['Currency', 'INR (₹)'],
        [],
        ['Metric', 'Current Value', 'Statutory / Actuarial Rule'],
        ['Vehicle ID', liveData?.latest?.vehicle_id || 'INSURE-BIKE-001', 'Assigned IoT Hardware'],
        ['Speed (km/h)', liveData?.latest?.speed_kmh || '42.5', 'Max Speed Limit: 80 km/h'],
        ['Acceleration (m/s²)', liveData?.latest?.acceleration_ms2 || '0.65', 'Harsh Braking Threshold: -4.0 m/s²'],
        ['Optical Helmet Latch', liveData?.latest?.helmet_detected ? 'DETECTED' : 'NOT DETECTED', 'Mandatory 2-Wheeler Safety Factor'],
        ['Alcohol Sensor (ppm)', liveData?.latest?.alcohol_ppm || '0.00', 'Legal Limit: 0.05 ppm'],
        ['Safety Score', `${liveData?.assessment?.safety_score || 92} / 100`, 'Tier 1 Safe: 80-100 (10% Discount)'],
        ['Dynamic Quote', `₹${liveData?.quote?.illustrative_estimate || 1800}`, 'Base: ₹2,000 (Adjusted by Telematics)'],
        ['Fault Determination', 'NEUTRAL (UNKNOWN)', 'Independent of Risk Scoring'],
      ];

      const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.map(e => e.join(',')).join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `INSURE_Actuarial_Report_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 3000);
    } catch {
      window.print();
    } finally {
      setExportingReport(false);
    }
  };

  return (
    <div className={`flex h-screen overflow-hidden ${darkMode ? 'dark bg-slate-950 text-slate-100' : 'bg-[#f8fafc] text-slate-800'}`}>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content area */}
      <div className="flex-1 flex flex-col lg:ml-64 min-w-0">
        {/* Top Header */}
        <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between px-4 lg:px-8 flex-shrink-0 z-10 transition-colors">
          <div className="flex items-center gap-3.5">
            <button
              className="lg:hidden p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-600 dark:text-slate-300"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-extrabold text-slate-800 dark:text-white tracking-tight leading-none">
                {meta.title}
              </h1>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase mt-1">
                {meta.subtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 relative">
            {/* Functional Export Custom Report Button */}
            <button
              id="btn-export-report"
              onClick={handleExportReport}
              disabled={exportingReport}
              className="hidden sm:inline-flex items-center gap-2 bg-[#059669] hover:bg-[#047857] text-white text-xs sm:text-sm font-semibold px-4 py-2 rounded-xl shadow-sm transition-all cursor-pointer"
              title="Download CSV Actuarial Telematics Report"
            >
              {exportSuccess ? (
                <>
                  <Check className="w-4 h-4 text-emerald-200" />
                  <span>Report Downloaded!</span>
                </>
              ) : exportingReport ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Generating…</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Export Custom Report</span>
                </>
              )}
            </button>

            {/* Functional Sun / Dark Mode Toggle */}
            <button
              id="btn-theme-toggle"
              onClick={toggleDarkMode}
              title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-amber-500 dark:text-amber-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5 text-slate-600" />}
            </button>

            {/* Functional Notification Bell with Active Flyout */}
            <div className="relative">
              <button
                id="btn-notifications-toggle"
                onClick={() => setShowNotifications(prev => !prev)}
                title="Notifications Center"
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors relative cursor-pointer"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 px-1.5 py-0.2 bg-rose-500 text-white text-[10px] font-bold rounded-full border-2 border-white dark:border-slate-900 shadow-xs">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Notifications Flyout Panel */}
              {showNotifications && (
                <div className="absolute right-0 top-12 w-80 sm:w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-50 p-4 animate-fadeIn text-slate-800 dark:text-slate-100">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-3">
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4 text-emerald-600" />
                      <h4 className="text-xs font-bold uppercase tracking-wider">
                        Telematics Alerts ({unreadCount} new)
                      </h4>
                    </div>
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllAsRead}
                        className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>

                  <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                    {notifications.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-6">
                        No active notifications.
                      </p>
                    ) : (
                      notifications.map(n => (
                        <div
                          key={n.id}
                          className={`p-2.5 rounded-xl border transition-all flex items-start gap-2.5 ${
                            n.read
                              ? 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800 text-slate-500'
                              : 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800'
                          }`}
                        >
                          <div className="mt-0.5 flex-shrink-0">
                            {n.type === 'alert' ? (
                              <AlertTriangle className="w-4 h-4 text-rose-500" />
                            ) : n.type === 'success' ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            ) : (
                              <Info className="w-4 h-4 text-blue-500" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                                {n.title}
                              </p>
                              <span className="text-[10px] text-slate-400 font-mono flex-shrink-0">
                                {n.time}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 leading-snug">
                              {n.message}
                            </p>
                          </div>
                          <button
                            onClick={() => removeNotification(n.id)}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
                            title="Dismiss"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-slate-50/50 dark:bg-slate-950 transition-colors">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
