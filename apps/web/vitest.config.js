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
