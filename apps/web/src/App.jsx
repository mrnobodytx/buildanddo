import React from 'react';
import {
    Route,
    Routes,
    BrowserRouter as Router,
    Navigate,
} from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import ScrollToTop from './components/ScrollToTop';
import RouteTelemetry from './components/observability/RouteTelemetry';
import TelemetryBoundary from './components/observability/TelemetryBoundary';
import HomePage from './pages/HomePage';
import RoadmapPage from './pages/RoadmapPage';
import PracticePage from './pages/PracticePage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import OnboardingPage from './pages/OnboardingPage';
import WorkspaceLayout from './components/workspace/WorkspaceLayout';
import OverviewPage from './pages/workspace/OverviewPage';
import SignalsPage from './pages/workspace/SignalsPage';
import MissionsPage from './pages/workspace/MissionsPage';
import WorkflowsPage from './pages/workspace/WorkflowsPage';
import TutorialsPage from './pages/workspace/TutorialsPage';
import ErpPage from './pages/workspace/ErpPage';
import OperationsPage from './pages/workspace/OperationsPage';
import EvidencePage from './pages/workspace/EvidencePage';
import DailyEditionPage from './pages/workspace/DailyEditionPage';
import SpecialistDeskPage from './pages/workspace/SpecialistDeskPage';
import CorrectionsPage from './pages/workspace/CorrectionsPage';
import SupportRevenuePage from './pages/workspace/SupportRevenuePage';
import CommunitySocialPage from './pages/workspace/CommunitySocialPage';
import WorkspaceRoadmapPage from './pages/workspace/RoadmapPage';
import SettingsPage from './pages/workspace/SettingsPage';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import {
    WorkspaceProvider,
    useWorkspace,
} from '@/contexts/WorkspaceContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import PageBoundary from '@/components/workspace/PageBoundary';

// Each workspace page is mounted inside its own error boundary. The root
// TelemetryBoundary still catches everything, but a root catch replaces the
// whole screen — one broken page would take the navigation with it and leave
// the operator with nothing but a reload.
const WORKSPACE_ROUTES = [
    { index: true, label: 'Front Page', element: OverviewPage },
    { path: 'signals', label: 'Signals', element: SignalsPage },
    { path: 'missions', label: 'Challenge Desk', element: MissionsPage },
    { path: 'workflows', label: 'Workflows', element: WorkflowsPage },
    { path: 'tutorials', label: 'Field Manual', element: TutorialsPage },
    { path: 'erp', label: 'ERP', element: ErpPage },
    { path: 'operations', label: 'Operations', element: OperationsPage },
    { path: 'evidence', label: 'Evidence Ledger', element: EvidencePage },
    { path: 'edition', label: 'Daily Edition', element: DailyEditionPage },
    { path: 'desks', label: 'Specialist Desks', element: SpecialistDeskPage },
    { path: 'corrections', label: 'Corrections', element: CorrectionsPage },
    { path: 'support', label: 'Support & Revenue', element: SupportRevenuePage },
    { path: 'community', label: 'Community & Social', element: CommunitySocialPage },
    { path: 'roadmap', label: 'Roadmap', element: WorkspaceRoadmapPage },
    { path: 'settings', label: 'Settings', element: SettingsPage },
];

// Redirect already-authenticated users away from the auth screens.
function RedirectIfAuthed({ children }) {
    const { isAuthed } = useAuth();
    if (isAuthed) return <Navigate to="/app" replace />;
    return children;
}

// Send signed-in users with no workspace into onboarding before the app shell.
function WorkspaceGate({ children }) {
    const { loading, hasWorkspaces } = useWorkspace();
    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
            </div>
        );
    }
    if (!hasWorkspaces) return <Navigate to="/onboarding" replace />;
    return children;
}

function AppRoutes() {
    return (
        <Routes>
            {/* Public marketing site */}
            <Route path="/" element={<HomePage />} />
            <Route path="/roadmap" element={<RoadmapPage />} />
            <Route path="/practice" element={<PracticePage />} />

            {/* Authentication */}
            <Route
                path="/login"
                element={
                    <RedirectIfAuthed>
                        <LoginPage />
                    </RedirectIfAuthed>
                }
            />
            <Route
                path="/signup"
                element={
                    <RedirectIfAuthed>
                        <SignupPage />
                    </RedirectIfAuthed>
                }
            />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />

            {/* Onboarding (protected) */}
            <Route
                path="/onboarding"
                element={
                    <ProtectedRoute>
                        <OnboardingPage />
                    </ProtectedRoute>
                }
            />

            {/* Authenticated workspace */}
            <Route
                path="/app"
                element={
                    <ProtectedRoute>
                        <WorkspaceGate>
                            <WorkspaceLayout />
                        </WorkspaceGate>
                    </ProtectedRoute>
                }
            >
                {WORKSPACE_ROUTES.map(({ path, index, label, element: Element }) => (
                    <Route
                        key={label}
                        index={index}
                        path={path}
                        element={
                            <PageBoundary name={label}>
                                <Element />
                            </PageBoundary>
                        }
                    />
                ))}
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}

function App() {
    return (
        <TelemetryBoundary>
            <Router>
                <AuthProvider>
                    <WorkspaceProvider>
                        <ScrollToTop />
                        <RouteTelemetry />
                        <AppRoutes />
                    </WorkspaceProvider>
                </AuthProvider>
            </Router>
        </TelemetryBoundary>
    );
}

export default App;
