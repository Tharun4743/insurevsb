import axios from 'axios';

/**
 * Resolves the backend API base URL from Vite environment variables.
 * In production (e.g. Vercel), set VITE_API_BASE_URL to your deployed backend
 * (e.g., https://insure-backend.onrender.com).
 * In local development, defaults to '/api', matching Vite's local dev proxy.
 */
export function resolveApiBaseUrl(): string {
  const envUrl = (import.meta.env.VITE_API_BASE_URL || '').trim();
  if (!envUrl) {
    return '/api';
  }
  const clean = envUrl.replace(/\/+$/, '');
  return clean.endsWith('/api') ? clean : `${clean}/api`;
}

const api = axios.create({
  baseURL: resolveApiBaseUrl(),
  headers: { 'Content-Type': 'application/json' },
  timeout: 25000,
});

// ── Attach Bearer JWT token from localStorage if available ────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('insure_auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  } else if (!config.headers.Authorization) {
    config.headers.Authorization = 'Bearer demo';
  }
  return config;
});

// ── Response interceptor for error normalisation ───────────────────────────────
api.interceptors.response.use(
  res => res,
  err => {
    const message = err.response?.data?.error || err.message || 'Network error';
    return Promise.reject(new Error(message));
  }
);

// ── Health ────────────────────────────────────────────────────────────────────
export const checkHealth = () => api.get('/health').then(r => r.data);

// ── Consent ───────────────────────────────────────────────────────────────────
export const getConsent     = () => api.get('/consent').then(r => r.data);
export const grantConsent   = () => api.post('/consent/grant').then(r => r.data);
export const withdrawConsent= () => api.post('/consent/withdraw').then(r => r.data);

// ── Simulator ─────────────────────────────────────────────────────────────────
export const getScenarios   = () => api.get('/simulator/scenarios').then(r => r.data);
export const runSimulation  = (scenario: string, reading_count: number) =>
  api.post('/simulator/run', { scenario, reading_count }).then(r => r.data);
export const startSimulationSession = (scenario: string, reading_count: number, vehicle_id?: string) =>
  api.post('/simulator/session/start', { scenario, reading_count, vehicle_id }).then(r => r.data);
export const pauseSimulationSession = (session_id: string) =>
  api.post('/simulator/session/pause', { session_id }).then(r => r.data);
export const resumeSimulationSession = (session_id: string) =>
  api.post('/simulator/session/resume', { session_id }).then(r => r.data);
export const stopSimulationSession = (session_id: string) =>
  api.post('/simulator/session/stop', { session_id }).then(r => r.data);
export const resetSimulationSession = (session_id: string) =>
  api.post('/simulator/session/reset', { session_id }).then(r => r.data);
export const getSimulationSession = (session_id: string) =>
  api.get(`/simulator/session/${session_id}`).then(r => r.data);

// ── Virtual IoT Telematics (Wokwi / Live Device Monitoring) ─────────────────
export const getIotLatestTelemetry = (vehicleId?: string) =>
  api.get(`/iot/telemetry/latest${vehicleId ? `?vehicleId=${vehicleId}` : ''}`).then(r => r.data);
export const getIotTelemetryHistory = (vehicleId: string, limit = 50) =>
  api.get(`/iot/telemetry/${vehicleId}?limit=${limit}`).then(r => r.data);
export const getIotAlerts = () =>
  api.get('/iot/alerts').then(r => r.data);
export const getIotVehicles = () =>
  api.get('/iot/vehicles').then(r => r.data);

// ── Trips ─────────────────────────────────────────────────────────────────────
export const getTrips       = (limit = 50) => api.get(`/trips?limit=${limit}`).then(r => r.data);
export const getTrip        = (id: string) => api.get(`/trips/${id}`).then(r => r.data);
export const getTripReadings= (id: string) => api.get(`/trips/${id}/readings`).then(r => r.data);

// ── Assessments ───────────────────────────────────────────────────────────────
export const getAssessments = () => api.get('/assessments').then(r => r.data);
export const getAssessment  = (id: string) => api.get(`/assessments/${id}`).then(r => r.data);

// ── Quotes ────────────────────────────────────────────────────────────────────
export const getQuotes      = () => api.get('/quotes').then(r => r.data);
export const getQuote       = (id: string) => api.get(`/quotes/${id}`).then(r => r.data);

// ── Review ────────────────────────────────────────────────────────────────────
export const getReviewCases = (status?: string) =>
  api.get(`/review${status ? `?status=${status}` : ''}`).then(r => r.data);
export const getReviewCase  = (id: string) => api.get(`/review/${id}`).then(r => r.data);
export const submitDecision = (id: string, decision: string, explanation: string) =>
  api.post(`/review/${id}/decision`, { decision, explanation }).then(r => r.data);

// ── Audit ─────────────────────────────────────────────────────────────────────
export const getAuditHistory= (limit = 100) => api.get(`/audit?limit=${limit}`).then(r => r.data);

// ── Accidents & Claims (Stored Separately from Telematics) ────────────────────
export const getAccidents    = () => api.get('/accidents').then(r => r.data);
export const reportAccident  = (data: Record<string, unknown>) => api.post('/accidents', data).then(r => r.data);
export const clearAccidents  = () => api.delete('/accidents').then(r => r.data);
export const seedAccidents   = (scenario: string) => api.post('/accidents/seed', { scenario }).then(r => r.data);

// ── Customer Growth & Profitability Simulation Engine ────────────────────────
export const getProfitabilityPresets = () =>
  api.get('/profitability/presets').then(r => r.data);

export const simulateProfitability = (params: Record<string, unknown>) =>
  api.post('/profitability/simulate', params).then(r => r.data);

export const optimizeProfitability = (data: { candidates?: Array<Record<string, unknown>>; baseline?: Record<string, unknown> }) =>
  api.post('/profitability/optimize', data).then(r => r.data);

export const getFinancialScenarios = () =>
  api.get('/profitability/scenarios').then(r => r.data);

export const saveFinancialScenario = (scenario: Record<string, unknown>) =>
  api.post('/profitability/scenarios', scenario).then(r => r.data);

// ── Authentication & Password Recovery (Brevo SMTP & OTP) ─────────────────────
export const signup = (data: {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  privacyTermsAcknowledged: boolean;
  telematicsConsent?: boolean;
}) => api.post('/auth/signup', data).then(r => r.data);

export const verifySignupOtp = (data: { email: string; otp: string }) =>
  api.post('/auth/verify-signup-otp', data).then(r => r.data);

export const resendSignupOtp = (data: { email: string }) =>
  api.post('/auth/resend-signup-otp', data).then(r => r.data);

export const login = (data: { email: string; password: string }) =>
  api.post('/auth/login', data).then(r => r.data);

export const logout = () =>
  api.post('/auth/logout').then(r => r.data).catch(() => ({}));

export const forgotPassword = (data: { email: string }) =>
  api.post('/auth/forgot-password', data).then(r => r.data);

export const verifyResetOtp = (data: { email: string; otp: string }) =>
  api.post('/auth/verify-reset-otp', data).then(r => r.data);

export const resetPassword = (data: {
  resetToken: string;
  newPassword: string;
  confirmPassword: string;
}) => api.post('/auth/reset-password', data).then(r => r.data);

export const getMe = () => api.get('/auth/me').then(r => r.data);
export const checkSmtpHealth = () => api.get('/auth/smtp-health').then(r => r.data);
export const getAuthAccounts = () => api.get('/auth/accounts').then(r => r.data);

// ── Admin Portfolio & Pricing Config ──────────────────────────────────────────
export const getAdminPortfolio = () => api.get('/admin/portfolio').then(r => r.data);
export const getAdminCustomers = () => api.get('/admin/customers').then(r => r.data);
export const updateAdminCustomerStatus = (userId: string, status: string) =>
  api.patch(`/admin/customers/${userId}/status`, { status }).then(r => r.data);
export const updateAdminPricingConfig = (data: {
  basePremium?: number;
  maxAdjustment?: number;
  ruleVersion?: string;
}) => api.post('/admin/pricing-config', data).then(r => r.data);

// ── Pricing & Compliance Officer Overview & Disputes ──────────────────────────
export const getComplianceOverview = () => api.get('/compliance/overview').then(r => r.data);
export const getComplianceDisputes = () => api.get('/compliance/disputes').then(r => r.data);
export const getComplianceFairness = () => api.get('/compliance/fairness').then(r => r.data);
export const submitComplianceDecision = (
  disputeId: string,
  data: { decision: 'resolved' | 'rejected' | 'under_investigation'; explanation: string }
) => api.post(`/compliance/disputes/${disputeId}/decision`, data).then(r => r.data);

// ── Customer Pricing Disputes ─────────────────────────────────────────────────
export const submitQuoteDispute = (
  quoteId: string,
  data: { reason: string; explanation: string }
) => api.post(`/quotes/${quoteId}/dispute`, data).then(r => r.data);

export const getQuoteDispute = (quoteId: string) =>
  api.get(`/quotes/${quoteId}/dispute`).then(r => r.data);

export default api;



