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
// Depends:     apps/web/src/components/site/PublicPage.jsx, apps/web/src/pages/PricingPage.jsx, apps/web/src/pages/ContactPage.jsx
// EnumType:    Test
// EnumEdges:   DEPENDS_ON apps/web/src/components/site/PublicPage.jsx; VALIDATES apps/web/src/pages/PricingPage.jsx; VALIDATES apps/web/src/pages/ContactPage.jsx
// DAG Node:    none
// Intent:      Exercise public navigation, metadata, documentation search, articles and email-draft behavior.
// ───────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router-dom';
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

    it('distinguishes approved government membership from early access and scoped pilots', () => {
        renderPage(PricingPage, '/pricing');
        expect(
            screen.getByText('$100/month · approval required'),
        ).toBeVisible();
        expect(screen.getByRole('link', { name: 'Request government membership' })).toHaveAttribute('href', '/contact?interest=government');
        expect(screen.getByRole('link', { name: 'Request early access' })).toHaveAttribute(
            'href',
            '/#early-access',
        );
        expect(screen.getByRole('link', { name: 'Contact the team' })).toHaveAttribute(
            'href',
            '/contact',
        );
        expect(screen.getByRole('link', { name: 'Discuss a paid pilot' })).toHaveAttribute(
            'href', '/contact?interest=pilot#commercial-enquiry',
        );
        expect(screen.getByText('One workspace and one agreed external operation')).toBeVisible();
        expect(screen.getByText(/manual invoice schedule/)).toBeVisible();
        expect(screen.getByText(/Payment does not approve an operation/)).toBeVisible();
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

    it('keeps government membership enquiries reviewable and clears them when the tier changes', async () => {
        const user = setupUser();
        renderPage(ContactPage, '/contact?interest=government&paid=true');
        expect(screen.getByLabelText('Enquiry type')).toHaveValue('government');
        expect(screen.getByRole('heading', { name: 'Request government membership' })).toBeVisible();
        await user.type(screen.getByLabelText('Name'), 'Research member');
        await user.type(screen.getByLabelText('Email'), 'member@example.com');
        await user.type(screen.getByLabelText('What would you like to discuss?'), 'Please review my research membership request.');
        await user.click(screen.getByRole('button', { name: 'Prepare email draft' }));
        expect(screen.getByLabelText('Email draft preview').value).toContain('USD 100/month');
        expect(screen.getByLabelText('Email draft preview').value).toContain('does not confirm payment, activate membership');
        await user.selectOptions(screen.getByLabelText('Enquiry type'), 'commercial');
        expect(screen.getByLabelText('Name')).toHaveValue('');
        expect(screen.queryByRole('link', { name: 'Open email draft' })).not.toBeInTheDocument();
    });

    it('opens the pilot CTA, requires an outcome and retains a reviewable draft with restrictions', async () => {
        const user = setupUser();
        renderWithProviders(<Routes>
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/contact" element={<ContactPage />} />
        </Routes>, { route: '/pricing', auth: { isAuthed: false, user: null } });
        await user.click(screen.getByRole('link', { name: 'Discuss a paid pilot' }));
        expect(screen.getByLabelText('Enquiry type')).toHaveValue('pilot');
        const form = screen.getByRole('form', { name: 'Commercial enquiry' });
        expect(form).toHaveClass('ph-no-capture');
        expect(form).toHaveAttribute('data-dd-privacy', 'hidden');
        expect(screen.queryByRole('link', { name: 'Open email draft' })).not.toBeInTheDocument();
        await user.type(screen.getByLabelText('Name'), 'Pat & Team');
        await user.type(screen.getByLabelText('Email'), 'pat@example.com');
        await user.type(screen.getByLabelText('Recurring problem'), 'Reconcile the approved supplier list.');
        await user.click(screen.getByRole('button', { name: 'Prepare email draft' }));
        expect(screen.queryByRole('link', { name: 'Open email draft' })).not.toBeInTheDocument();
        await user.type(screen.getByLabelText('What would a successful result look like?'), 'A reviewer confirms all agreed rows match.');
        await user.type(screen.getByLabelText('Limits or data restrictions (optional)'), 'Public catalogue data only.');
        await user.click(screen.getByRole('button', { name: 'Prepare email draft' }));
        const draft = screen.getByLabelText('Email draft preview');
        expect(draft).toHaveAttribute('readonly');
        expect(draft.value).toContain('A reviewer confirms all agreed rows match.');
        expect(draft.value).toContain('Public catalogue data only.');
        const link = new URL(screen.getByRole('link', { name: 'Open email draft' }).href);
        expect(link.searchParams.get('subject')).toBe('BuildAndDo paid-pilot enquiry');
        expect(link.searchParams.get('body')).toBe(draft.value);
        await user.type(screen.getByLabelText('Limits or data restrictions (optional)'), ' No customer records.');
        expect(screen.queryByLabelText('Email draft preview')).not.toBeInTheDocument();
    });

    it('clears the pilot draft and contact details when the enquiry kind changes', async () => {
        const user = setupUser();
        renderPage(ContactPage, '/contact?interest=pilot');
        await user.type(screen.getByLabelText('Name'), 'Pat');
        await user.type(screen.getByLabelText('Email'), 'pat@example.com');
        await user.type(screen.getByLabelText('Recurring problem'), 'Review the weekly approved list.');
        await user.type(screen.getByLabelText('What would a successful result look like?'), 'An independently reviewed result.');
        await user.click(screen.getByRole('button', { name: 'Prepare email draft' }));
        expect(screen.getByLabelText('Email draft preview').value).toContain('To agree during scoping.');
        await user.selectOptions(screen.getByLabelText('Enquiry type'), 'commercial');
        expect(screen.getByLabelText('What would you like to discuss?')).toHaveValue('');
        expect(screen.getByLabelText('Name')).toHaveValue('');
        expect(screen.queryByLabelText('What would a successful result look like?')).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Open email draft' })).not.toBeInTheDocument();
        await user.selectOptions(screen.getByLabelText('Enquiry type'), 'pilot');
        expect(screen.getByLabelText('Recurring problem')).toHaveValue('');
        expect(screen.queryByLabelText('Email draft preview')).not.toBeInTheDocument();
    });

    it('ignores untrusted query values and rejects a whitespace-only enquiry before preparing a draft', async () => {
        const user = setupUser();
        renderPage(ContactPage, '/contact?interest=unlimited&name=Injected&email=foreign@example.com');
        expect(screen.getByLabelText('Enquiry type')).toHaveValue('commercial');
        expect(screen.getByLabelText('Name')).toHaveValue('');
        expect(screen.getByLabelText('Email')).toHaveValue('');
        await user.type(screen.getByLabelText('Name'), 'Pat');
        await user.type(screen.getByLabelText('Email'), 'pat@example.com');
        await user.type(screen.getByLabelText('What would you like to discuss?'), '          ');
        await user.click(screen.getByRole('button', { name: 'Prepare email draft' }));
        expect(screen.getByRole('alert')).toHaveTextContent('Use 10–2000 characters');
        expect(screen.queryByRole('link', { name: 'Open email draft' })).not.toBeInTheDocument();
        await user.type(screen.getByLabelText('What would you like to discuss?'), 'Licensing and support.');
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
});
