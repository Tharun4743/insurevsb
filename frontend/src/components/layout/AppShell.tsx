import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { Menu, Bell, Sun, Download, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

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

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { role } = useAuth();
  const meta = getHeaderMeta(location.pathname);

  const handleExportReport = () => {
    window.print();
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8fafc]">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content area */}
      <div className="flex-1 flex flex-col lg:ml-64 min-w-0">
        {/* Top Header matching exact screenshot */}
        <header className="h-16 bg-white border-b border-slate-200/80 flex items-center justify-between px-4 lg:px-8 flex-shrink-0 z-10">
          <div className="flex items-center gap-3.5">
            <button
              className="lg:hidden p-2 rounded-xl hover:bg-slate-100 transition-colors text-slate-600"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-extrabold text-slate-800 tracking-tight leading-none">
                {meta.title}
              </h1>
              <p className="text-[10px] font-bold text-slate-400 tracking-wider uppercase mt-1">
                {meta.subtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Export Custom Report Button */}
            <button
              onClick={handleExportReport}
              className="hidden sm:inline-flex items-center gap-2 bg-[#059669] hover:bg-[#047857] text-white text-xs sm:text-sm font-semibold px-4 py-2 rounded-xl shadow-sm transition-all cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Export Custom Report</span>
            </button>

            {/* Sun / Theme Button */}
            <button
              title="Theme setting"
              className="p-2 rounded-xl border border-slate-200 text-amber-500 hover:bg-slate-50 transition-colors"
            >
              <Sun className="w-5 h-5" />
            </button>

            {/* Notification Bell with 8+ badge */}
            <button
              title="Notifications"
              className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors relative"
            >
              <Bell className="w-5 h-5" />
              <span className="absolute -top-1 -right-1 px-1.5 py-0.2 bg-rose-500 text-white text-[10px] font-bold rounded-full border-2 border-white shadow-xs">
                8+
              </span>
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
