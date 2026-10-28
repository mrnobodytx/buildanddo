// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/__tests__/PublicPages.behavior.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-27
// Depends:     apps/web/src/pages/PricingPage.jsx, apps/web/src/pages/DocsPage.jsx, apps/web/src/pages/ContactPage.jsx, apps/web/src/lib/publicActions.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/PricingPage.jsx; VALIDATES apps/web/src/pages/DocsPage.jsx; VALIDATES apps/web/src/pages/ContactPage.jsx
// DAG Node:    none
// Intent:      Verify public CTAs, guide links and the email hand-off reach their destinations and record bounded, content-free actions.
// ───────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes, useLocation } from 'react-router-dom';
import PricingPage from '@/pages/PricingPage';
import DocsPage from '@/pages/DocsPage';
import ContactPage from '@/pages/ContactPage';
import { PUBLIC_ACTIONS } from '@/lib/publicActions';
import { reportAction } from '@/lib/observability/runtime';
import { trackEvent } from '@/lib/telemetry';
import { renderWithProviders, screen, setupUser, within } from '@/test/utils';

vi.mock('@/lib/pocketbaseClient', async () => {
    const { createMockPocketBase } = await import('@/test/pocketbaseMock');
    const client = createMockPocketBase();
    return { default: client, pocketbaseClient: client };
});
vi.mock('@/lib/observability/runtime', () => ({
    reportAction: vi.fn(),
    reportMetric: vi.fn(),
    trackAuthIdentity: vi.fn(),
    readFailed: vi.fn(),
}));
vi.mock('@/lib/telemetry', () => ({ trackEvent: vi.fn() }));

const anonymous = { isAuthed: false, user: null };

// jsdom cannot follow external or mailto links; stop the browser default after React's handler ran.
function blockDocumentNavigation() {
    const stop = (event) => { if (event.target.closest?.('a[href]')) event.preventDefault(); };
    document.addEventListener('click', stop);
    return () => document.removeEventListener('click', stop);
}

function Location() {
    const location = useLocation();
    return <p data-testid="location">{location.pathname + location.search + location.hash}</p>;
}

function renderPricingRoutes() {
    return renderWithProviders(
        <>
            <Routes>
                <Route path="/pricing" element={<PricingPage />} />
                <Route path="/contact" element={<ContactPage />} />
                <Route path="/" element={<p>Home page</p>} />
            </Routes>
            <Location />
        </>,
        { route: '/pricing', auth: anonymous },
    );
}

function sentEvents(action) {
    return vi.mocked(trackEvent).mock.calls.filter(([name]) => name === action).map(([, context]) => context);
}

let restoreNavigation;
beforeEach(() => {
    vi.mocked(trackEvent).mockClear();
    vi.mocked(reportAction).mockClear();
    restoreNavigation = blockDocumentNavigation();
});
afterEach(() => restoreNavigation());

describe('pricing calls to action', () => {
    it('opens the government membership enquiry and records the government plan intent', async () => {
        const user = setupUser();
        renderPricingRoutes();
        await user.click(screen.getByRole('link', { name: 'Request government membership' }));
        expect(screen.getByTestId('location')).toHaveTextContent('/contact?interest=government');
        expect(screen.getByLabelText('Enquiry type')).toHaveValue('government');
        expect(sentEvents(PUBLIC_ACTIONS.CTA)).toEqual([
            expect.objectContaining({ outcome: 'intent', reason: 'user_requested', placement: 'pricing', plan: 'government' }),
        ]);
        expect(reportAction).toHaveBeenCalledWith(PUBLIC_ACTIONS.CTA, expect.objectContaining({ plan: 'government' }));
    });

    it('sends early-access requests to the home sign-up and records the early-access plan', async () => {
        const user = setupUser();
        renderPricingRoutes();
        await user.click(screen.getByRole('link', { name: 'Request early access' }));
        expect(screen.getByText('Home page')).toBeVisible();
        expect(screen.getByTestId('location')).toHaveTextContent('/#early-access');
        expect(sentEvents(PUBLIC_ACTIONS.CTA)).toEqual([
            expect.objectContaining({ placement: 'pricing', plan: 'early_access' }),
        ]);
    });

    it('routes a team rollout to the general commercial enquiry and records the team plan', async () => {
        const user = setupUser();
        renderPricingRoutes();
        await user.click(screen.getByRole('link', { name: 'Contact the team' }));
        expect(screen.getByTestId('location')).toHaveTextContent(/^\/contact$/);
        expect(screen.getByLabelText('Enquiry type')).toHaveValue('commercial');
        expect(screen.getByRole('heading', { name: 'Commercial licensing' })).toBeVisible();
        expect(sentEvents(PUBLIC_ACTIONS.CTA)).toEqual([
            expect.objectContaining({ placement: 'pricing', plan: 'team' }),
        ]);
    });

    it('records the pilot plan when the paid-pilot call to action is followed', async () => {
        const user = setupUser();
        renderPricingRoutes();
        await user.click(screen.getByRole('link', { name: 'Discuss a paid pilot' }));
        expect(screen.getByLabelText('Enquiry type')).toHaveValue('pilot');
        expect(sentEvents(PUBLIC_ACTIONS.CTA)).toEqual([expect.objectContaining({ plan: 'pilot' })]);
    });

    it('does not record a plan for the getting-started guide link', async () => {
        const user = setupUser();
        renderWithProviders(
            <>
                <Routes>
                    <Route path="/pricing" element={<PricingPage />} />
                    <Route path="/docs" element={<p>Guide page</p>} />
                </Routes>
                <Location />
            </>,
            { route: '/pricing', auth: anonymous },
        );
        await user.click(screen.getByRole('link', { name: 'Read the getting-started guide' }));
        expect(screen.getByText('Guide page')).toBeVisible();
        expect(sentEvents(PUBLIC_ACTIONS.CTA)).toEqual([]);
    });
});

describe('documentation links', () => {
    function renderDocs() {
        return renderWithProviders(
            <>
                <Routes>
                    <Route path="/docs" element={<DocsPage />} />
                    <Route path="/app/workflows" element={<p>Workflows workspace</p>} />
                </Routes>
                <Location />
            </>,
            { route: '/docs', auth: anonymous },
        );
    }

    it('records a contents entry when a reader jumps to a guide section', async () => {
        const user = setupUser();
        renderDocs();
        const contents = within(screen.getByRole('navigation', { name: 'Documentation sections' }));
        const link = contents.getByRole('link', { name: 'Build a repeatable workflow' });
        expect(link).toHaveAttribute('href', '#workflows');
        await user.click(link);
        expect(sentEvents(PUBLIC_ACTIONS.GUIDE_OPEN)).toEqual([
            expect.objectContaining({ outcome: 'opened', reason: 'user_requested', entry: 'contents' }),
        ]);
    });

    it('opens a guide destination in the workspace and records it as a destination entry', async () => {
        const user = setupUser();
        renderDocs();
        await user.click(screen.getByRole('link', { name: 'Open Workflows' }));
        expect(screen.getByText('Workflows workspace')).toBeVisible();
        expect(screen.getByTestId('location')).toHaveTextContent('/app/workflows');
        expect(sentEvents(PUBLIC_ACTIONS.GUIDE_OPEN)).toEqual([
            expect.objectContaining({ entry: 'destination' }),
        ]);
    });

    it('links the API reference and contribution guide to the public repository and records reference entries', async () => {
        const user = setupUser();
        renderDocs();
        const api = screen.getByRole('link', { name: 'API reference' });
        const contributing = screen.getByRole('link', { name: 'Contribution guide' });
        expect(api).toHaveAttribute('href', 'https://github.com/mrnobodytx/buildanddo/blob/main/docs/api/README.md');
        expect(contributing).toHaveAttribute('href', 'https://github.com/mrnobodytx/buildanddo/blob/main/CONTRIBUTING.md');
        await user.click(api);
        await user.click(contributing);
        expect(sentEvents(PUBLIC_ACTIONS.GUIDE_OPEN)).toEqual([
            expect.objectContaining({ entry: 'reference' }),
            expect.objectContaining({ entry: 'reference' }),
        ]);
        // The opened href is never part of the recorded action.
        for (const context of sentEvents(PUBLIC_ACTIONS.GUIDE_OPEN)) {
            expect(JSON.stringify(context)).not.toContain('github.com');
        }
    });
});

describe('commercial email hand-off', () => {
    it('records opening the prepared draft without sending any enquiry content', async () => {
        const user = setupUser();
        renderWithProviders(<ContactPage />, { route: '/contact', auth: anonymous });
        await user.type(screen.getByLabelText('Name'), 'Private Person');
        await user.type(screen.getByLabelText('Email'), 'private.person@example.com');
        await user.type(screen.getByLabelText('What would you like to discuss?'), 'Confidential rollout question for our team.');
        await user.click(screen.getByRole('button', { name: 'Prepare email draft' }));
        expect(sentEvents(PUBLIC_ACTIONS.ENQUIRY_DRAFT)).toEqual([
            expect.objectContaining({ outcome: 'prepared', reason: 'local_draft' }),
        ]);
        await user.click(screen.getByRole('link', { name: 'Open email draft' }));
        const events = sentEvents(PUBLIC_ACTIONS.ENQUIRY_DRAFT);
        expect(events).toHaveLength(2);
        expect(events[1]).toEqual(expect.objectContaining({ outcome: 'opened', reason: 'mailto_handoff' }));
        const recorded = JSON.stringify([...vi.mocked(trackEvent).mock.calls, ...vi.mocked(reportAction).mock.calls]);
        for (const secret of ['Private Person', 'private.person@example.com', 'Confidential rollout']) {
            expect(recorded).not.toContain(secret);
        }
        // Opening the hand-off keeps the reviewed draft on the page.
        expect(screen.getByLabelText('Email draft preview').value).toContain('Confidential rollout question for our team.');
    });
});
