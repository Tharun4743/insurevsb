import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import AppShell from './components/layout/AppShell';

// ── Robust Lazy Loader with Automatic Retry on Stale Deployment Chunks ──
function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
): React.LazyExoticComponent<T> {
  return lazy(async () => {
    const isRetried = window.sessionStorage.getItem('chunk_retry_pending') === 'true';
    try {
      const module = await factory();
      window.sessionStorage.removeItem('chunk_retry_pending');
      return module;
    } catch (error: any) {
      if (!isRetried) {
        console.warn('[ChunkLoader] Stale chunk hash detected after deployment. Auto-refreshing...', error);
        window.sessionStorage.setItem('chunk_retry_pending', 'true');
        window.location.reload();
        return new Promise(() => {}); // Wait for browser reload
      }
      throw error;
    }
  });
}

// ── Lazy-loaded Core Application Routes (TSX Code Splitting) ──
const Dashboard = lazyWithRetry(() => import('./pages/Dashboard'));
const AdminDashboard = lazyWithRetry(() => import('./pages/AdminDashboard'));
const ComplianceDashboard = lazyWithRetry(() => import('./pages/ComplianceDashboard'));
const SimulatorPage = lazyWithRetry(() => import('./pages/SimulatorPage'));
const TripsPage = lazyWithRetry(() => import('./pages/TripsPage'));
const TripDetailPage = lazyWithRetry(() => import('./pages/TripDetailPage'));
const ReviewPage = lazyWithRetry(() => import('./pages/ReviewPage'));
const AuditPage = lazyWithRetry(() => import('./pages/AuditPage'));

// ── Lazy-loaded Auth Routes (Instant login & onboarding) ──
const LoginPage = lazyWithRetry(() => import('./pages/LoginPage'));
const SignupPage = lazyWithRetry(() => import('./pages/SignupPage'));
const VerifyEmailPage = lazyWithRetry(() => import('./pages/VerifyEmailPage'));
const ForgotPasswordPage = lazyWithRetry(() => import('./pages/ForgotPasswordPage'));
const VerifyResetCodePage = lazyWithRetry(() => import('./pages/VerifyResetCodePage'));
const ResetPasswordPage = lazyWithRetry(() => import('./pages/ResetPasswordPage'));

function PageLoader() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
      <div className="w-8 h-8 border-3 border-emerald-500/20 border-t-emerald-600 rounded-full animate-spin" />
      <span className="text-xs font-medium text-slate-400 tracking-wide uppercase">Loading module…</span>
    </div>
  );
}

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactElement; allowedRoles?: string[] }) {
  const { isAuthenticated, isLoading, role } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ThemeProvider>
        <AuthProvider>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Public Auth Routes */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/verify-email" element={<VerifyEmailPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/verify-reset-code" element={<VerifyResetCodePage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />

              {/* Protected Application Routes inside AppShell */}
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <AppShell />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Dashboard />} />
                <Route
                  path="admin"
                  element={
                    <ProtectedRoute allowedRoles={['admin']}>
                      <AdminDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="compliance"
                  element={
                    <ProtectedRoute allowedRoles={['compliance_officer', 'admin']}>
                      <ComplianceDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route path="simulator" element={<SimulatorPage />} />
                <Route path="trips" element={<TripsPage />} />
                <Route path="trips/:id" element={<TripDetailPage />} />
                <Route path="review" element={<ReviewPage />} />
                <Route path="audit" element={<AuditPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </Suspense>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
