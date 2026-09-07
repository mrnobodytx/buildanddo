import React from 'react';
import {
    Route,
    Routes,
    BrowserRouter as Router,
    Navigate,
} from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import ScrollToTop from './components/ScrollToTop';
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
                <Route index element={<OverviewPage />} />
                <Route path="signals" element={<SignalsPage />} />
                <Route path="missions" element={<MissionsPage />} />
                <Route path="workflows" element={<WorkflowsPage />} />
                <Route path="tutorials" element={<TutorialsPage />} />
                <Route path="erp" element={<ErpPage />} />
                <Route path="operations" element={<OperationsPage />} />
                <Route path="evidence" element={<EvidencePage />} />
                <Route path="edition" element={<DailyEditionPage />} />
                <Route path="desks" element={<SpecialistDeskPage />} />
                <Route path="corrections" element={<CorrectionsPage />} />
                <Route path="support" element={<SupportRevenuePage />} />
                <Route path="community" element={<CommunitySocialPage />} />
                <Route path="roadmap" element={<WorkspaceRoadmapPage />} />
                <Route path="settings" element={<SettingsPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}

function App() {
    return (
        <Router>
            <AuthProvider>
                <WorkspaceProvider>
                    <ScrollToTop />
                    <AppRoutes />
                </WorkspaceProvider>
            </AuthProvider>
        </Router>
    );
}

export default App;
