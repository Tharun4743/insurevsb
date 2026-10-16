import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard,
  Car,
  Activity,
  Award,
  TrendingUp,
  ShieldCheck,
  ShieldAlert,
  UserCheck,
  FileText,
  LogOut,
  ChevronRight,
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, role, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Clean, Role-Tailored Navigation Modules
  const customerNavItems = [
    { to: '/',              icon: LayoutDashboard, label: 'My Policy & Driving',    iconColor: 'text-slate-900' },
    { to: '/trips',         icon: Car,             label: 'Trip History',            iconColor: 'text-blue-500' },
    { to: '/simulator',     icon: Activity,        label: 'IoT Driving Simulator',   iconColor: 'text-emerald-500' },
  ];

  const adminNavItems = [
    { to: '/admin',         icon: LayoutDashboard, label: 'Admin Portfolio',         iconColor: 'text-slate-900' },
    { to: '/simulator',     icon: Activity,        label: 'IoT Driving Simulator',   iconColor: 'text-emerald-500' },
    { to: '/audit',         icon: FileText,        label: 'Audit Trail',             iconColor: 'text-pink-500' },
  ];

  const complianceNavItems = [
    { to: '/compliance',    icon: LayoutDashboard, label: 'Compliance Overview',     iconColor: 'text-slate-900' },
    { to: '/review',        icon: ShieldAlert,     label: 'Underwriting Review',     iconColor: 'text-emerald-500' },
    { to: '/simulator',     icon: Activity,        label: 'IoT Driving Simulator',   iconColor: 'text-blue-500' },
    { to: '/audit',         icon: FileText,        label: 'Fairness Audit Log',      iconColor: 'text-pink-500' },
  ];

  const activeNavList =
    role === 'admin'
      ? adminNavItems
      : role === 'compliance_officer'
      ? complianceNavItems
      : customerNavItems;

  const roleDisplay =
    role === 'admin'
      ? 'ADMIN'
      : role === 'compliance_officer'
      ? 'COMPLIANCE'
      : (user?.fullName || 'CUSTOMER').toUpperCase();

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-30 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-white dark:bg-slate-900 border-r border-slate-200/80 dark:border-slate-800 flex flex-col z-40 transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100 dark:border-slate-800">
          <img
            src="/logo-shield.png"
            alt="INSURE Logo"
            className="w-10 h-10 object-contain flex-shrink-0 drop-shadow-xs"
          />
          <div className="min-w-0">
            <h2 className="text-[16px] font-extrabold text-slate-800 dark:text-white tracking-tight leading-none">
              INSURE
            </h2>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mt-1">
              {role === 'admin' ? 'ADMIN PORTAL' : role === 'compliance_officer' ? 'COMPLIANCE PORTAL' : 'POLICYHOLDER PORTAL'}
            </p>
          </div>
        </div>

        {/* Navigation List */}
        <nav className="flex-1 px-3.5 py-4 space-y-1.5 overflow-y-auto">
          {activeNavList.map(({ to, icon: Icon, label, iconColor }) => {
            const isActive =
              to === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(to) && to !== '/';

            return (
              <NavLink
                key={label + to}
                to={to}
                onClick={onClose}
                className={`group flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-slate-900 dark:bg-brand-600 text-white font-semibold shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-4 h-4 flex-shrink-0 transition-colors ${
                      isActive ? 'text-white' : iconColor
                    }`}
                  />
                  <span>{label}</span>
                </div>
                {isActive && (
                  <ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-300 group-hover:translate-x-0.5 transition-transform" />
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Bottom Profile & Logout Section */}
        <div className="p-3.5 mx-3 mb-3 bg-slate-50/80 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
          <div className="px-1.5 pt-1 pb-2">
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
              LOGGED IN AS
            </span>
            <div className="flex items-center gap-2 mt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-sm font-extrabold text-slate-800 dark:text-white truncate">
                {roleDisplay}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
              {user?.email || 'tharunkumark4743@gmail.com'}
            </p>
          </div>

          <button
            onClick={handleLogout}
            className="mt-2 w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
}
