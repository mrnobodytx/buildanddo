// --- CGRF Header ------------------------------------------------
// File:        apps/pocketbase/pb_migrations/1791500000_password_reset_app_url.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-TRUST-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-TRUST-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/pocketbase/pb_migrations/1759383931_initial_app_settings.js, apps/web/src/pages/ResetPasswordPage.jsx
// EnumType:    Migration
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_migrations/1759383931_initial_app_settings.js; PRODUCES apps/web/src/pages/ResetPasswordPage.jsx
// DAG Node:    none
// Intent:      Take the email app URL from configuration and send reset links to the site's own reset page.
// ----------------------------------------------------------------

// BUILDANDDO_APP_URL is the site's public https origin (optionally with a path),
// e.g. the address the SPA is served from. Unset or unsafe: nothing changes, and
// the hard-coded preview host from 1759383931 stays until an operator sets the
// variable and edits Settings -> Application (a migration applies once).
// Only the reset-password template moves to the SPA; verification and
// email-change links still use {APP_URL}/_/ and need their own pages first.
const SAFE_APP_URL = /^https:\/\/[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::\d{1,5})?(?:\/[A-Za-z0-9._~\/-]*)?$/;
const RESET_LINK = /\{APP_URL\}[^"'\s<>]*\{TOKEN\}/g;
const SPA_RESET_LINK = '{APP_URL}/reset-password/{TOKEN}';

migrate((app) => {
    const raw = String($os.getenv('BUILDANDDO_APP_URL') || '').trim();
    if (!raw) return;
    if (!SAFE_APP_URL.test(raw)) {
        console.log('password-reset migration: BUILDANDDO_APP_URL is not a plain https URL; settings left unchanged.');
        return;
    }
    const settings = app.settings();
    settings.meta.appURL = raw.replace(/\/+$/, '');
    app.save(settings);

    const users = app.findCollectionByNameOrId('users');
    const template = users.resetPasswordTemplate;
    const body = template && typeof template.body === 'string' ? template.body : '';
    if (!body.match(RESET_LINK)) {
        console.log('password-reset migration: reset template has no {APP_URL}...{TOKEN} link; template left unchanged.');
        return;
    }
    template.body = body.replace(RESET_LINK, SPA_RESET_LINK);
    users.resetPasswordTemplate = template;
    app.save(users);
}, (_app) => {
    // No-op: the previous appURL was a dead preview host, and restoring the
    // admin-UI reset link would reintroduce the page this change replaces.
});
