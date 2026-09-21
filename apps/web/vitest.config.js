// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/vitest.config.js
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-TEST-001
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/vite.config.js, apps/web/src/test/setup.js
// EnumType:    ConfigDoc
// EnumEdges:   CONSUMES apps/web/src/test/setup.js;
//              PRODUCES reports/junit/web.xml;
//              VALIDATES apps/web/src
// Intent:      Run the web test suite on the existing Vite transform, resolving
//              the same "@" alias the app builds with.
// ───────────────────────────────────────────────────────────────

import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Deliberately standalone rather than `mergeConfig(viteConfig, ...)`: the app's
// vite.config.js injects the Horizons editor plugins and rewrites index.html,
// none of which a headless test run should carry.
const srcDir = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
    plugins: [react()],
    resolve: {
        // Must stay in step with vite.config.js — a test that resolves imports
        // differently from the build is not testing the shipped module graph.
        extensions: ['.jsx', '.js', '.json'],
        alias: {
            // Order matters: the specific entry must precede the '@' prefix rule.
            // SelectContent's default position="popper" never settles under jsdom — the
            // measurements and the six ruled-out causes are in src/test/select-testable.jsx.
            // The real Radix component still runs; only the positioning strategy is pinned to the
            // one that terminates, and pixel placement is what a DOM without layout cannot check
            // either way.
            '@/components/ui/select': fileURLToPath(
                new URL('./src/test/select-testable.jsx', import.meta.url)),
            '@': srcDir,
        },
    },
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./src/test/setup.js'],
        include: ['src/**/*.{test,spec}.{js,jsx}'],
        exclude: ['**/node_modules/**', '**/dist/**'],
        // Tailwind directives carry no behaviour worth asserting and parsing
        // them costs every test run.
        css: false,
        clearMocks: true,
        // JUnit lands at the repository root because that is the directory the
        // datadog-ci-report action already scans (junit-path: reports/junit).
        outputFile: {
            junit: '../../reports/junit/web.xml',
        },
        coverage: {
            provider: 'v8',
            thresholds: {
                'src/pages/{Pricing,About,Docs,Blog,Contact}Page.jsx': { lines: 80, statements: 80, functions: 80, branches: 80 },
                'src/components/{ThemeControls,RouteLoading,SkipNavigation}.jsx': { lines: 80, statements: 80, functions: 80, branches: 80 },
                'src/components/site/PublicPage.jsx': { lines: 80, statements: 80, functions: 80, branches: 80 },
                'src/lib/observability/mutations.js': { lines: 80, statements: 80, functions: 80, branches: 80 },
                'src/components/workspace/TutorialCatalog.jsx': { lines: 80, statements: 80, functions: 80, branches: 80 },
                'src/components/workspace/{TutorialReader,ContentStudio,StructuredContent}.jsx': { lines: 80, statements: 80, functions: 80, branches: 80 },
                'src/pages/workspace/ErpPage.jsx': { lines: 80, statements: 80, functions: 80, branches: 80 },
                'src/lib/{businessPlanning,tutorialCurriculum}.js': { lines: 80, statements: 80, functions: 80, branches: 80 },
                'src/components/workspace/missions/*.jsx': { lines: 80, statements: 80, functions: 80, branches: 80 },
                'src/lib/missionLearning.js': { lines: 80, statements: 80, functions: 80, branches: 80 },
                'src/components/workspace/workflows/*.jsx': { lines: 80, statements: 80, functions: 80, branches: 80 },
                'src/lib/workflowRuns.js': { lines: 80, statements: 80, functions: 80, branches: 80 },
                'src/pages/workspace/{Admin,Integrations,Wiki,Forums}Page.jsx': { lines: 80, statements: 80, functions: 80, branches: 80 },
                'src/components/workspace/{ControlPrimitives,IntegrationControls}.jsx': { lines: 80, statements: 80, functions: 80, branches: 80 },
                'src/hooks/useWorkspaceControl.js': { lines: 80, statements: 80, functions: 80, branches: 80 },
                'src/pages/workspace/ResearchPage.jsx': { lines: 80, statements: 80, functions: 80, branches: 80 },
                'src/pages/workspace/SuitePage.jsx': { lines: 80, statements: 80, functions: 80, branches: 80 },
                'src/components/workspace/suite/*.jsx': { lines: 80, statements: 80, functions: 80, branches: 80 },
                'src/hooks/useMissionSuite.js': { lines: 80, statements: 80, functions: 80, branches: 80 },
                'src/lib/missionSuite.js': { lines: 80, statements: 80, functions: 80, branches: 80 },
                'src/hooks/useMissionResearch.js': { lines: 80, statements: 80, functions: 80, branches: 80 },
                'src/hooks/usePrivateDossier.js': { lines: 80, statements: 80, functions: 80, branches: 80 },
                'src/lib/privateDossier.js': { lines: 80, statements: 80, functions: 80, branches: 80 },
                'src/pages/workspace/DossierPage.jsx': { lines: 80, statements: 80, functions: 80, branches: 80 },
                'src/components/workspace/DossierEditors.jsx': { lines: 80, statements: 80, functions: 80, branches: 80 },
                'src/lib/{missionResearch,discordAccount}.js': { lines: 80, statements: 80, functions: 80, branches: 80 },
                'src/components/workspace/DiscordAccountLink.jsx': { lines: 80, statements: 80, functions: 80, branches: 80 },
                'src/components/motion/*.jsx': { lines: 80, statements: 80, functions: 80, branches: 80 },
                'src/contexts/MotionContext.jsx': { lines: 80, statements: 80, functions: 80, branches: 80 },
                'src/lib/motion/*.js': { lines: 80, statements: 80, functions: 80, branches: 80 },
                'src/contexts/WorkspaceAccessContext.jsx': { lines: 80, statements: 80, functions: 80, branches: 80 },
            },
            reporter: ['text-summary', 'lcov'],
            reportsDirectory: '../../reports/coverage/web',
            include: ['src/**/*.{js,jsx}'],
            exclude: [
                'src/test/**',
                'src/**/__tests__/**',
                'src/**/*.{test,spec}.{js,jsx}',
                'src/components/ui/**',
                'src/main.jsx',
            ],
        },
    },
});
