// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/__tests__/PublicPages.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-14
// Depends:     apps/web/src/components/site/PublicPage.jsx
// EnumType:    Test
// EnumEdges:   DEPENDS_ON apps/web/src/components/site/PublicPage.jsx
// DAG Node:    none
// Intent:      Exercise public navigation, metadata, documentation search, articles and email-draft behavior.
// ───────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import { PUBLIC_PAGES, SITE_ORIGIN } from '@/lib/publicPages';
import PricingPage from '@/pages/PricingPage';
import AboutPage from '@/pages/AboutPage';
import DocsPage, { GUIDES } from '@/pages/DocsPage';
import BlogPage from '@/pages/BlogPage';
import ContactPage from '@/pages/ContactPage';
import ClassroomLandingPage from '@/pages/ClassroomLandingPage';
import { renderWithProviders, screen, setupUser, waitFor, within } from '@/test/utils';

const pages = [
    ['/pricing', PricingPage, 'Start with one useful outcome.'],
    ['/about', AboutPage, 'Work should leave a record.'],
    ['/docs', DocsPage, 'From the first signal to the final receipt.'],
    ['/blog', BlogPage, 'Notes from the work.'],
    ['/contact', ContactPage, 'Tell us what you are working on.'],
    ['/classrooms', ClassroomLandingPage, 'A classroom for the work ahead.'],
];

function renderPage(Component, route) {
    return renderWithProviders(<Component />, { route, auth: { isAuthed: false, user: null } });
}

describe('public pages', () => {
    it.each(pages)(
        '%s has a main landmark, public destinations and complete metadata',
        async (path, Component, heading) => {
            renderPage(Component, path);
            expect(
                within(screen.getByRole('main')).getByRole('heading', { level: 1, name: heading }),
            ).toBeVisible();
            const navigation = within(screen.getByRole('navigation', { name: 'Primary' }));
            for (const route of ['/pricing', '/about', '/docs', '/classrooms', '/blog', '/contact']) {
                const page = PUBLIC_PAGES.find((entry) => entry.path === route);
                expect(navigation.getByRole('link', { name: page.label })).toHaveAttribute(
                    'href',
                    route,
                );
            }
            const metadata = PUBLIC_PAGES.find((entry) => entry.path === path);
            await waitFor(() => expect(document.title).toBe(metadata.title));
            expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute(
                'href',
                SITE_ORIGIN + path,
            );
            expect(document.querySelector('meta[property="og:description"]')).toHaveAttribute(
                'content',
                metadata.description,
            );
            expect(document.querySelector('meta[property="og:type"]')).toHaveAttribute(
                'content',
                'website',
            );
            expect(document.querySelector('meta[name="twitter:card"]')).toHaveAttribute(
                'content',
                'summary_large_image',
            );
            const schema = JSON.parse(document.getElementById('page-schema').textContent);
            expect(schema[0]['@type']).toBe(metadata.type);
            expect(schema[0].url).toBe(SITE_ORIGIN + path);
            expect(schema[1].itemListElement[1].item).toBe(SITE_ORIGIN + path);
        },
    );

    it('explains access without presenting a made-up subscription price', () => {
        renderPage(PricingPage, '/pricing');
        expect(
            screen.getByText(/Public subscription prices have not been announced/),
        ).toBeVisible();
        expect(screen.getByRole('link', { name: 'Request early access' })).toHaveAttribute(
            'href',
            '/#early-access',
        );
        expect(screen.getByRole('link', { name: 'Contact the team' })).toHaveAttribute(
            'href',
            '/contact',
        );
    });

    it('searches useful documentation and recovers from an empty result', async () => {
        const user = setupUser();
        renderPage(DocsPage, '/docs');
        const search = screen.getByRole('searchbox', { name: 'Search the guide' });
        await user.type(search, 'repeatable');
        expect(screen.getByRole('status')).toHaveTextContent('1 guide found');
        expect(screen.getByRole('heading', { name: 'Build a repeatable workflow' })).toBeVisible();
        expect(
            screen.queryByRole('heading', { name: 'Create your first workspace' }),
        ).not.toBeInTheDocument();
        await user.clear(search);
        await user.type(search, 'no-matching-guide');
        expect(screen.getByRole('status')).toHaveTextContent('0 guides found');
        expect(screen.getByText(/No matching guides/)).toBeVisible();
        await user.clear(search);
        // Counted from the page's own list: a hardcoded number silently rots every
        // time a guide is added, which is how this broke when the new docs landed.
        expect(screen.getByRole('status')).toHaveTextContent(`${GUIDES.length} guides found`);
    });

    it('lets a reader open and close a complete journal entry with the native disclosure', async () => {
        const user = setupUser();
        renderPage(BlogPage, '/blog');
        const summary = screen.getByText('Read “What counts as a verified outcome?”');
        await user.click(summary);
        expect(summary.closest('details')).toHaveAttribute('open');
        await user.click(summary);
        expect(summary.closest('details')).not.toHaveAttribute('open');
    });

    it('prepares a correctly encoded email draft only after valid input', async () => {
        const user = setupUser();
        renderPage(ContactPage, '/contact');
        await user.click(screen.getByRole('button', { name: 'Prepare email draft' }));
        expect(screen.queryByRole('link', { name: 'Open email draft' })).not.toBeInTheDocument();
        await user.type(screen.getByLabelText('Name'), 'Pat & Team');
        await user.type(screen.getByLabelText('Email'), 'pat@example.com');
        await user.type(
            screen.getByLabelText('What would you like to discuss?'),
            'Licensing for a team of five & support.',
        );
        await user.click(screen.getByRole('button', { name: 'Prepare email draft' }));
        expect(screen.getByRole('status')).toHaveTextContent('Open it in your email app to send.');
        const link = screen.getByRole('link', { name: 'Open email draft' });
        expect(link.getAttribute('href')).toMatch(/^mailto:licensing@citadel-nexus.com\?subject=/);
        const body = new URL(link.href).searchParams.get('body');
        expect(body).toContain('Pat & Team');
        expect(body).toContain('pat@example.com');
        expect(body).toContain('Licensing for a team of five & support.');
        await user.type(screen.getByLabelText('Name'), ' updated');
        expect(screen.queryByRole('link', { name: 'Open email draft' })).not.toBeInTheDocument();
    });
});
