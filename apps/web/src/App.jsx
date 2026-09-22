// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/App.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-21
// Depends:     apps/web/src/contexts/AuthContext.jsx, apps/web/src/components/ProtectedRoute.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/contexts/AuthContext.jsx; CONSUMES apps/web/src/components/ProtectedRoute.jsx
// Intent:      Route public and workspace views only after native session validation.
// ───────────────────────────────────────────────────────────────

import React, { lazy, Suspense } from 'react';
import { MotionProvider } from '@/contexts/MotionContext';
import { MotionEntrance } from '@/components/motion/MotionPrimitives';
import { ThemeProvider } from 'next-themes';
import RouteLoading from '@/components/RouteLoading';
import SkipNavigation from '@/components/SkipNavigation';
import { Route, Routes, BrowserRouter as Router, Navigate, useLocation } from 'react-router-dom';
import ScrollToTop from './components/ScrollToTop';
import RouteTelemetry from './components/observability/RouteTelemetry';
import TelemetryBoundary from './components/observability/TelemetryBoundary';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { WorkspaceProvider, useWorkspace } from '@/contexts/WorkspaceContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import PageBoundary from '@/components/workspace/PageBoundary';
import { workspaceDestination } from '@/lib/navigationIntent';
import { isMasterSeat } from '@/lib/estateAccess';

const HomePage = lazy(() => import('./pages/HomePage'));
const HostingerChallengePage = lazy(() => import('./pages/HostingerChallengePage'));
const RoadmapPage = lazy(() => import('./pages/RoadmapPage'));
const PracticePage = lazy(() => import('./pages/PracticePage'));
const PlatformPage = lazy(() => import('./pages/PlatformPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const SignupPage = lazy(() => import('./pages/SignupPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const OnboardingPage = lazy(() => import('./pages/OnboardingPage'));
const WorkspaceLayout = lazy(() => import('./components/workspace/WorkspaceLayout'));
const OverviewPage = lazy(() => import('./pages/workspace/OverviewPage'));
const SignalsPage = lazy(() => import('./pages/workspace/SignalsPage'));
const MissionsPage = lazy(() => import('./pages/workspace/MissionsPage'));
const WorkflowsPage = lazy(() => import('./pages/workspace/WorkflowsPage'));
const TutorialsPage = lazy(() => import('./pages/workspace/TutorialsPage'));
const ClassroomsPage = lazy(() => import('./pages/workspace/ClassroomsPage'));
const ClassroomLandingPage = lazy(() => import('./pages/ClassroomLandingPage'));
const ErpPage = lazy(() => import('./pages/workspace/ErpPage'));
const OperationsPage = lazy(() => import('./pages/workspace/OperationsPage'));
const FleetPage = lazy(() => import('./pages/workspace/FleetPage'));
const PlatformHealthPage = lazy(() => import('./pages/workspace/PlatformHealthPage'));
const EvidencePage = lazy(() => import('./pages/workspace/EvidencePage'));
const ResearchPage = lazy(() => import('./pages/workspace/ResearchPage'));
const KnowledgePage = lazy(() => import('./pages/workspace/KnowledgePage'));
const BlueprintPage = lazy(() => import('./pages/workspace/BlueprintPage'));
const PolicyPage = lazy(() => import('./pages/workspace/PolicyPage'));
const OperatorPage = lazy(() => import('./pages/workspace/OperatorPage'));
const SuitePage = lazy(() => import('./pages/workspace/SuitePage'));
const DossierPage = lazy(() => import('./pages/workspace/DossierPage'));
const DailyEditionPage = lazy(() => import('./pages/workspace/DailyEditionPage'));
// Capability Passport viewer; file path retained from the former desks page so
// existing /app/desks bookmarks keep resolving (SRS-BUILDANDDO-WITNESS-001).
const SpecialistWorkPage = lazy(() => import('./pages/workspace/SpecialistWorkPage'));
const ExecutionReplayPage = lazy(() => import('./pages/workspace/ExecutionReplayPage'));
const CapabilityPassportPage = lazy(() => import('./pages/workspace/SpecialistDeskPage'));
const CorrectionsPage = lazy(() => import('./pages/workspace/CorrectionsPage'));
const SupportRevenuePage = lazy(() => import('./pages/workspace/SupportRevenuePage'));
const CommunitySocialPage = lazy(() => import('./pages/workspace/CommunitySocialPage'));
const WorkspaceRoadmapPage = lazy(() => import('./pages/workspace/RoadmapPage'));
const SettingsPage = lazy(() => import('./pages/workspace/SettingsPage'));
const AdminPage = lazy(() => import('./pages/workspace/AdminPage'));
const IntegrationsPage = lazy(() => import('./pages/workspace/IntegrationsPage'));
const WikiPage = lazy(() => import('./pages/workspace/WikiPage'));
const ForumsPage = lazy(() => import('./pages/workspace/ForumsPage'));
const PricingPage = lazy(() => import('./pages/PricingPage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const DocsPage = lazy(() => import('./pages/DocsPage'));
const BlogPage = lazy(() => import('./pages/BlogPage'));
const ContactPage = lazy(() => import('./pages/ContactPage'));
const RoomsPage = lazy(() => import('./pages/workspace/RoomsPage'));
const SystemsRoomPage = lazy(() => import('./pages/workspace/SystemsRoomPage'));
const LiveExperimentRoomPage = lazy(() => import('./pages/workspace/LiveExperimentRoomPage'));

// Each workspace page is mounted inside its own error boundary. The root
// TelemetryBoundary still catches everything, but a root catch replaces the
// whole screen — one broken page would take the navigation with it and leave
// the operator with nothing but a reload.
// Estate surfaces (Fleet) exist only for a signed-in master-level CNWB seat. Anyone else is sent to the workspace front
// page: not a 403 page, because the surface should not exist for them at all. The level is backend-owned.
function EstateOnly({ enabled, children }) {
    const { user } = useAuth();
    if (enabled && !isMasterSeat(user)) return <Navigate to="/app" replace />;
    return children;
}

const WORKSPACE_ROUTES = [
    { index: true, label: 'Front Page', element: OverviewPage },
    { path: 'operator', label: 'Operator cockpit', element: OperatorPage },
    { path: 'signals', label: 'Signals', element: SignalsPage },
    { path: 'missions', label: 'Challenge Desk', element: MissionsPage },
    { path: 'workflows', label: 'Workflows', element: WorkflowsPage },
    { path: 'tutorials', label: 'Field Manual', element: TutorialsPage },
    { path: 'classrooms', label: 'Classrooms', element: ClassroomsPage },
    { path: 'classrooms/:roomId', label: 'Classroom', element: ClassroomsPage },
    { path: 'erp', label: 'ERP', element: ErpPage },
    { path: 'operations', label: 'Operations', element: OperationsPage },
    { path: 'fleet', label: 'Fleet', element: FleetPage, estate: true },
    { path: 'platforms', label: 'Platform Health', element: PlatformHealthPage },
    { path: 'evidence', label: 'Evidence Ledger', element: EvidencePage },
    { path: 'research', label: 'Mission research', element: ResearchPage },
    { path: 'knowledge', label: 'Knowledge & context', element: KnowledgePage },
    { path: 'blueprints', label: 'Blueprints', element: BlueprintPage },
    { path: 'policy', label: 'Policy intelligence', element: PolicyPage },
    { path: 'suite', label: 'Mission suite', element: SuitePage },
    { path: 'dossier', label: 'My dossier', element: DossierPage },
    { path: 'edition', label: 'Daily Edition', element: DailyEditionPage },
    { path: 'desks', label: 'Specialist desks', element: SpecialistWorkPage },
    { path: 'replay', label: 'Execution replay', element: ExecutionReplayPage },
    { path: 'passport', label: 'Capability Passport', element: CapabilityPassportPage },
    { path: 'corrections', label: 'Corrections', element: CorrectionsPage },
    { path: 'support', label: 'Support & Revenue', element: SupportRevenuePage },
    { path: 'community', label: 'Community & Social', element: CommunitySocialPage },
    { path: 'roadmap', label: 'Roadmap', element: WorkspaceRoadmapPage },
    { path: 'settings', label: 'Settings', element: SettingsPage },
    { path: 'admin', label: 'Administration', element: AdminPage },
    { path: 'integrations', label: 'Sinks & extensions', element: IntegrationsPage },
    { path: 'wiki', label: 'Workspace wiki', element: WikiPage },
    { path: 'forums', label: 'Workspace forum', element: ForumsPage },
    { path: 'rooms/systems', label: 'Systems Room', element: SystemsRoomPage },
    { path: 'rooms/live', label: 'Live Experiment', element: LiveExperimentRoomPage },
    { path: 'rooms/:room?', label: 'Living Rooms', element: RoomsPage },
];

// Redirect already-authenticated users away from the auth screens.
function RedirectIfAuthed({ children }) {
    const { isAuthed, loading } = useAuth();
    const location = useLocation();
    if (loading) return <RouteLoading fullPage />;
    if (isAuthed) return <Navigate to={workspaceDestination(location.state?.returnTo)} replace />;
    return children;
}

// Send signed-in users with no workspace into onboarding before the app shell.
function WorkspaceGate({ children }) {
    const { loading, hasWorkspaces, error, refresh } = useWorkspace();
    const location = useLocation();
    if (loading) {
        return <RouteLoading fullPage />;
    }
    if (error) {
        return (
            <main id="main-content" tabIndex={-1} className="mx-auto max-w-xl space-y-4 p-8">
                <h1 className="font-display text-2xl font-semibold">Your workspaces are unavailable</h1>
                <p role="alert">{error}</p>
                <button type="button" onClick={refresh} className="min-h-11 border border-border px-4 py-2">
                    Try again
                </button>
            </main>
        );
    }
    if (!hasWorkspaces) return <Navigate to="/onboarding" state={{ returnTo: workspaceDestination(`${location.pathname}${location.search}${location.hash}`) }} replace />;
    return children;
}

export function AppRoutes() {
    return (
        <Suspense fallback={<RouteLoading fullPage />}>
            <Routes>
                {/* Public marketing site */}
                <Route path="/" element={<HomePage />} />
                <Route path="/hostinger-challenge" element={<HostingerChallengePage />} />
                <Route path="/roadmap" element={<RoadmapPage />} />
                <Route path="/practice" element={<PracticePage />} />
                <Route path="/platform" element={<PlatformPage />} />
                <Route path="/pricing" element={<PricingPage />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="/docs" element={<DocsPage />} />
                <Route path="/classrooms" element={<ClassroomLandingPage />} />
                <Route path="/blog" element={<BlogPage />} />
                <Route path="/contact" element={<ContactPage />} />

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
                    {WORKSPACE_ROUTES.map(({ path, index, label, element: Element, estate }) => (
                        <Route
                            key={path || 'index'}
                            index={index}
                            path={path}
                            element={
                                <PageBoundary key={path || 'index'} name={label}>
                                    <Suspense fallback={<RouteLoading />}>
                                        <EstateOnly enabled={estate}>
                                            <MotionEntrance><Element /></MotionEntrance>
                                        </EstateOnly>
                                    </Suspense>
                                </PageBoundary>
                            }
                        />
                    ))}
                </Route>

                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </Suspense>
    );
}

function App() {
    return (
        <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            storageKey="buildanddo.theme"
        >
            <MotionProvider>
                <TelemetryBoundary>
                    <Router>
                        <SkipNavigation />
                        <AuthProvider>
                            <WorkspaceProvider>
                                <ScrollToTop />
                                <RouteTelemetry />
                                <AppRoutes />
                            </WorkspaceProvider>
                        </AuthProvider>
                    </Router>
                </TelemetryBoundary>
            </MotionProvider>
        </ThemeProvider>
    );
}

export default App;
