import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { Auth0Provider, type AppState } from '@auth0/auth0-react';
import { type ReactNode } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { WebSocketProvider } from './contexts/WebSocketContext';
import { ToastProvider } from './components/ToastProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CosmicBackground } from './components/CosmicBackground';
import { Navigation } from './components/Navigation';
import { Footer } from './components/Footer';

// Pages
import { HomePage } from './pages/HomePage';
import { ReadersPage } from './pages/readers/ReadersPage';
import { ReaderProfilePage } from './pages/readers/ReaderProfilePage';
import { CommunityHubPage } from './pages/community/CommunityHubPage';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { AdminDashboard } from './pages/dashboard/AdminDashboard';
import { ReaderDashboard } from './pages/dashboard/ReaderDashboard';
import { ClientDashboard } from './pages/dashboard/ClientDashboard';
import { ReadingSessionPage } from './pages/reading/ReadingSessionPage';
import { AboutPage } from './pages/AboutPage';
import { HelpPage } from './pages/HelpPage';
import { LoginPage } from './pages/LoginPage';
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage';
import { TermsOfServicePage } from './pages/TermsOfServicePage';
import { NotFoundPage } from './pages/NotFoundPage';

function AppRoutes() {
  return (
    <ErrorBoundary>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <CosmicBackground />
      <Navigation />
      <main id="main-content" className="page-wrapper">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/readers" element={<ReadersPage />} />
          <Route path="/readers/:id" element={<ReaderProfilePage />} />
          <Route path="/community" element={<CommunityHubPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/dashboard/admin" element={<AdminDashboard />} />
          <Route path="/dashboard/reader" element={<ReaderDashboard />} />
          <Route path="/dashboard/client" element={<ClientDashboard />} />
          <Route path="/reading/:id" element={<ReadingSessionPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
          <Route path="/terms" element={<TermsOfServicePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <Footer />
    </ErrorBoundary>
  );
}

/**
 * Auth0 provider that navigates via React Router after the login callback.
 *
 * Must be rendered INSIDE <BrowserRouter> so useNavigate() is available.
 * Previous versions used window.history.replaceState in onRedirectCallback,
 * which did not trigger a React Router re-render — the URL updated but the
 * page stayed on HomePage, making it look like /dashboard didn't exist.
 */
function Auth0ProviderWithNavigate({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  const auth0Domain = (import.meta.env.VITE_AUTH0_DOMAIN || '')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
  const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID || '';
  const audience = import.meta.env.VITE_AUTH0_AUDIENCE || '';
  const redirectUri = (
    import.meta.env.VITE_AUTH0_REDIRECT_URI ||
    (typeof window !== 'undefined' ? window.location.origin : '')
  ).replace(/\/$/, '');

  if (!auth0Domain || !clientId) {
    console.error(
      '[SoulSeer] Auth0 env vars missing. Ensure VITE_AUTH0_DOMAIN and VITE_AUTH0_CLIENT_ID are set.',
    );
  }
  if (!audience) {
    console.warn(
      '[SoulSeer] VITE_AUTH0_AUDIENCE is not set — backend JWT validation will reject tokens.',
    );
  }

  const onRedirectCallback = (appState?: AppState) => {
    const target = appState?.returnTo || '/dashboard';
    navigate(target, { replace: true });
  };

  return (
    <Auth0Provider
      domain={auth0Domain}
      clientId={clientId}
      authorizationParams={{
        redirect_uri: redirectUri,
        audience,
      }}
      onRedirectCallback={onRedirectCallback}
    >
      {children}
    </Auth0Provider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Auth0ProviderWithNavigate>
        <ToastProvider>
          <AuthProvider>
            <WebSocketProvider>
              <AppRoutes />
            </WebSocketProvider>
          </AuthProvider>
        </ToastProvider>
      </Auth0ProviderWithNavigate>
    </BrowserRouter>
  );
}
