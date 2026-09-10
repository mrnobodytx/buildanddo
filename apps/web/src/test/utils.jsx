// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/test/utils.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-TEST-001
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/contexts/AuthContext.jsx,
//              apps/web/src/contexts/WorkspaceContext.jsx,
//              apps/web/src/test/pocketbaseMock.js
// EnumType:    Test
// EnumEdges:   CONSUMES apps/web/src/contexts/AuthContext.jsx;
//              CONSUMES apps/web/src/contexts/WorkspaceContext.jsx;
//              CONSUMES apps/web/src/test/pocketbaseMock.js;
//              VALIDATES apps/web/src/pages/workspace
// Intent:      Render workspace UI under the real Auth and Workspace contexts so
//              tests exercise production components, not test-only replicas.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import AuthContext from '@/contexts/AuthContext';
import WorkspaceContext from '@/contexts/WorkspaceContext';

export { createMockPocketBase, mockPocketBaseError } from '@/test/pocketbaseMock';

let sequence = 0;
const nextSuffix = () => {
    sequence += 1;
    return sequence;
};

/**
 * ISO timestamp `minutesAgo` minutes before the current clock.
 *
 * Relative to real `Date.now()` on purpose: the pages render relative ages
 * ("15m ago"), so a fixture pinned to a fixed calendar date would render a
 * different string on every future test run.
 *
 * @param {number} minutesAgo Minutes to subtract from now.
 * @returns {string} An ISO-8601 timestamp.
 */
export function isoMinutesAgo(minutesAgo) {
    return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

/* Record factories ------------------------------------------------------- */
/* Field names mirror the PocketBase collections the pages actually read;    */
/* an invented field here would make a passing test meaningless.             */

/**
 * @param {object} [overrides] Fields to override.
 * @returns {object} A `users` record.
 */
export function createMockUser(overrides = {}) {
    return {
        id: 'user_test',
        collectionName: 'users',
        email: 'owner@example.com',
        name: 'Test Owner',
        created: isoMinutesAgo(60 * 24 * 30),
        ...overrides,
    };
}

/**
 * @param {object} [overrides] Fields to override.
 * @returns {object} A `domains` record.
 */
export function createMockDomain(overrides = {}) {
    return {
        id: `domain_${nextSuffix()}`,
        collectionName: 'domains',
        domain: 'example-plumbing.com',
        status: 'selected',
        has_website: true,
        owner: 'user_test',
        created: isoMinutesAgo(60 * 24),
        ...overrides,
    };
}

/**
 * @param {object} [overrides] Fields to override; pass `expand` for the domain.
 * @returns {object} A `workspaces` record.
 */
export function createMockWorkspace(overrides = {}) {
    const domain = overrides.expand?.domain ?? createMockDomain();
    return {
        id: 'ws_test',
        collectionName: 'workspaces',
        name: 'Example Plumbing',
        domain: domain.id,
        owner: 'user_test',
        created: isoMinutesAgo(60 * 24),
        ...overrides,
        expand: { domain, ...(overrides.expand || {}) },
    };
}

/**
 * @param {object} [overrides] Fields to override.
 * @returns {object} A `missions` record.
 */
export function createMockMission(overrides = {}) {
    return {
        id: `mission_${nextSuffix()}`,
        collectionName: 'missions',
        title: 'Reduce next-week no-shows',
        description: 'Send reminder texts two days before each appointment.',
        status: 'proposed',
        workspace: 'ws_test',
        owner: 'user_test',
        created: isoMinutesAgo(30),
        ...overrides,
    };
}

/**
 * @param {object} [overrides] Fields to override.
 * @returns {object} A `workflows` record.
 */
export function createMockWorkflow(overrides = {}) {
    return {
        id: `workflow_${nextSuffix()}`,
        collectionName: 'workflows',
        name: 'Weekly appointment reminders',
        description: 'Every Friday, text next week\u2019s booked customers.',
        status: 'draft',
        workspace: 'ws_test',
        owner: 'user_test',
        created: isoMinutesAgo(120),
        ...overrides,
    };
}

/**
 * @param {object} [overrides] Fields to override.
 * @returns {object} A `signals` record.
 */
export function createMockSignal(overrides = {}) {
    return {
        id: `signal_${nextSuffix()}`,
        collectionName: 'signals',
        title: 'No-show rate up this week',
        description: 'Four missed appointments against a weekly average of one.',
        source: 'Appointment calendar',
        type: 'fact',
        confidence: 72,
        workspace: 'ws_test',
        owner: 'user_test',
        created: isoMinutesAgo(15),
        ...overrides,
    };
}

/**
 * @param {object} [overrides] Fields to override.
 * @returns {object} An `evidence` record.
 */
export function createMockEvidence(overrides = {}) {
    return {
        id: `evidence_${nextSuffix()}`,
        collectionName: 'evidence',
        type: 'verified',
        content: 'No-shows fell from four to one after reminders were sent.',
        source: 'Appointment calendar',
        workspace: 'ws_test',
        owner: 'user_test',
        created: isoMinutesAgo(10),
        ...overrides,
    };
}

/* Context values --------------------------------------------------------- */

/**
 * Builds an auth context value with `vi.fn` actions.
 *
 * @param {object} [overrides] Context fields to override.
 * @returns {object} The value for `AuthContext.Provider`.
 */
export function createAuthValue(overrides = {}) {
    return {
        user: createMockUser(),
        isAuthed: true,
        login: vi.fn(() => Promise.resolve({ token: 'test-token', record: createMockUser() })),
        signup: vi.fn(() => Promise.resolve({ token: 'test-token', record: createMockUser() })),
        logout: vi.fn(),
        ...overrides,
    };
}

/**
 * Builds a workspace context value with one active workspace by default.
 *
 * @param {object} [overrides] Context fields to override.
 * @returns {object} The value for `WorkspaceContext.Provider`.
 */
export function createWorkspaceValue(overrides = {}) {
    const { active: activeOverride, workspaces: workspacesOverride, ...rest } = overrides;
    // `active: null` is the "signed in, no workspace yet" case, which is not the
    // same as "not specified" — hence the explicit null check rather than `||`.
    const workspaces =
        workspacesOverride ??
        (activeOverride === null ? [] : [activeOverride || createMockWorkspace()]);
    const active =
        activeOverride === null ? null : activeOverride || workspaces[0] || null;

    return {
        workspaces,
        active,
        setActive: vi.fn(),
        loading: false,
        hasWorkspaces: workspaces.length > 0,
        refresh: vi.fn(() => Promise.resolve()),
        ...rest,
    };
}

/**
 * Wraps `ui` in a MemoryRouter plus the real Auth and Workspace contexts.
 *
 * @param {React.ReactElement} ui Element under test.
 * @param {{auth?: object, workspace?: object, route?: string, routes?: string[]}} [options]
 *        `auth`/`workspace` are merged into the default context values;
 *        `route` sets the initial location.
 * @returns {object} Testing Library's render result plus `auth` and `workspace`
 *          — the exact context values the tree received, for assertions.
 */
export function renderWithProviders(ui, options = {}) {
    const { auth, workspace, route = '/', ...renderOptions } = options;
    const authValue = createAuthValue(auth);
    const workspaceValue = createWorkspaceValue(workspace);

    const Wrapper = ({ children }) => (
        <MemoryRouter initialEntries={[route]}>
            <AuthContext.Provider value={authValue}>
                <WorkspaceContext.Provider value={workspaceValue}>
                    {children}
                </WorkspaceContext.Provider>
            </AuthContext.Provider>
        </MemoryRouter>
    );

    return {
        ...render(ui, { wrapper: Wrapper, ...renderOptions }),
        auth: authValue,
        workspace: workspaceValue,
    };
}

/**
 * Wraps `children` in the Workspace context only — for `renderHook`.
 *
 * @param {object} [workspace] Workspace context overrides.
 * @returns {React.ComponentType} A wrapper component.
 */
export function workspaceWrapper(workspace = {}) {
    const value = createWorkspaceValue(workspace);
    const Wrapper = ({ children }) => (
        <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
    );
    Wrapper.value = value;
    return Wrapper;
}

/**
 * `userEvent` instance with the pointer-events check disabled.
 *
 * Radix sets `pointer-events: none` on `document.body` while a dialog is open.
 * userEvent's default check reads that as "element not interactive" and throws,
 * so every assertion about an open dialog would fail for a reason that has
 * nothing to do with the component.
 *
 * @returns {object} A configured userEvent instance.
 */
export function setupUser() {
    return userEvent.setup({ pointerEventsCheck: 0 });
}

export * from '@testing-library/react';
