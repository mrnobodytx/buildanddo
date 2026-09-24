// --- CGRF Header ------------------------------------------------
// File:        tests/upgrade/public-action-telemetry.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-24
// Depends:     apps/web/src/lib/publicActions.js, apps/web/src/lib/telemetry.js, apps/web/src/lib/observability/runtime.js, apps/web/src/lib/observability/report.js, apps/web/src/pages/LoginPage.jsx, apps/web/src/pages/SignupPage.jsx, apps/web/src/pages/ForgotPasswordPage.jsx, apps/web/src/pages/ResetPasswordPage.jsx, apps/web/src/pages/OnboardingPage.jsx, apps/web/src/components/site/EarlyAccess.jsx, apps/web/src/pages/ContactPage.jsx, apps/web/src/components/voice/TalkToBuddi.jsx, apps/web/src/components/voice/VoiceSession.jsx
//              apps/web/src/lib/observability/context.js
//              apps/web/src/pages/DocsPage.jsx, apps/web/src/pages/PricingPage.jsx, apps/web/src/pages/BlogPage.jsx, apps/web/src/pages/PersonaProfilePage.jsx, apps/web/src/components/site/Header.jsx, apps/web/src/components/site/Footer.jsx, apps/web/src/components/workspace/TutorialCatalog.jsx, apps/web/src/pages/RoadmapPage.jsx, apps/web/src/pages/workspace/ExecutionReplayPage.jsx, apps/web/src/pages/workspace/SpecialistDeskPage.jsx, apps/web/src/pages/workspace/OperatorPage.jsx, apps/web/src/pages/workspace/RoomsPage.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/publicActions.js; CONSUMES apps/web/src/lib/telemetry.js; CONSUMES apps/web/src/lib/observability/runtime.js; CONSUMES apps/web/src/lib/observability/report.js; VALIDATES apps/web/src/pages/LoginPage.jsx; VALIDATES apps/web/src/pages/SignupPage.jsx; VALIDATES apps/web/src/pages/ForgotPasswordPage.jsx; VALIDATES apps/web/src/pages/ResetPasswordPage.jsx; VALIDATES apps/web/src/pages/OnboardingPage.jsx; VALIDATES apps/web/src/components/site/EarlyAccess.jsx; VALIDATES apps/web/src/pages/ContactPage.jsx; VALIDATES apps/web/src/components/voice/TalkToBuddi.jsx; VALIDATES apps/web/src/components/voice/VoiceSession.jsx
//              CONSUMES apps/web/src/lib/observability/context.js
//              VALIDATES apps/web/src/pages/DocsPage.jsx; VALIDATES apps/web/src/pages/PricingPage.jsx; VALIDATES apps/web/src/pages/BlogPage.jsx; VALIDATES apps/web/src/pages/PersonaProfilePage.jsx; VALIDATES apps/web/src/components/site/Header.jsx; VALIDATES apps/web/src/components/site/Footer.jsx; VALIDATES apps/web/src/components/workspace/TutorialCatalog.jsx; VALIDATES apps/web/src/pages/RoadmapPage.jsx; VALIDATES apps/web/src/pages/workspace/ExecutionReplayPage.jsx; VALIDATES apps/web/src/pages/workspace/SpecialistDeskPage.jsx; VALIDATES apps/web/src/pages/workspace/OperatorPage.jsx; VALIDATES apps/web/src/pages/workspace/RoomsPage.jsx
// DAG Node:    none
// Intent:      Connect actual public action handlers to both offline SDK doubles and assert privacy, truthful outcomes and unchanged retry lifetimes.
// ----------------------------------------------------------------

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import * as navigation from '../../apps/web/src/lib/navigationIntent.js';
import * as authErrors from '../../apps/web/src/lib/authErrors.js';
import * as onboarding from '../../apps/web/src/lib/onboarding.js';
import * as enquiry from '../../apps/web/src/lib/commercialEnquiry.js';
import * as publicPages from '../../apps/web/src/lib/publicPages.js';
import * as community from '../../apps/web/src/lib/communityLinks.js';
import * as personas from '../../apps/web/src/data/personas.js';
import * as curriculum from '../../apps/web/src/lib/tutorialCurriculum.js';
import { businessReplay, createBusinessClient } from '../../apps/web/src/lib/businessExecution.js';
import { createOperatorClient, projectOperator } from '../../apps/web/src/lib/operatorPlane.js';
import { projectWorkspaceValue } from '../../apps/web/src/lib/workspaceValue.js';
import { publishedRoom, workspaceRoom } from '../../apps/web/src/lib/workspaceRooms.js';
import { projectionStats } from '../../apps/web/src/lib/roomGraph.js';

const source = (path) => readFileSync(new URL(`../../apps/web/src/${path}`, import.meta.url), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));
const privateText = 'synthetic-private-content';
const email = 'synthetic-private-person@example.invalid';
const password = 'Synthetic-private-password-9!';
const submit = () => ({ preventDefault() {} });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = () => new Promise((resolve) => setImmediate(resolve));
// Keep source positions for coverage of the adapter body; only linking is replaced.
const moduleCode = (code) => code.replace(/^import\s[\s\S]*?;\s*$/gm, (statement) => statement.replace(/[^\n]/g, ' ')).replaceAll('import.meta.env', '__env')
    .replace(/^export\s*\{[^}]+\};?\s*$/gm, (statement) => statement.replace(/[^\n]/g, ' '))
    .replace(/^export (?:default )?/gm, (statement) => ' '.repeat(statement.length));

function load(path, globals, exports) {
    return vm.runInNewContext(`${moduleCode(source(path))}\n({ ${exports.join(', ')} });`, globals,
        { filename: new URL(`../../apps/web/src/${path}`, import.meta.url).href });
}

function fixture(path = '/login') {
    const f = { actions: [], events: [], attempts: [], apiCalls: [], navigations: [], consoleCalls: [], failures: new Set(),
        window: { location: new URL(`https://fixture.invalid${path}`) }, user: { id: 'synthetic-account' } };
    const timers = new Map(); let clock = 0, timerId = 0;
    const schedule = (callback, ms, interval = 0) => { const id = ++timerId; timers.set(id, { callback, at: clock + ms, interval }); return id; };
    const timing = { setTimeout: (callback, ms) => schedule(callback, ms), clearTimeout: (id) => timers.delete(id),
        setInterval: (callback, ms) => schedule(callback, ms, ms), clearInterval: (id) => timers.delete(id) };
    Object.assign(f.window, timing);
    f.advance = (ms) => {
        const until = clock + ms;
        for (;;) {
            const next = [...timers].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
            if (!next) break;
            const [id, timer] = next; clock = timer.at;
            if (timer.interval) timer.at += timer.interval; else timers.delete(id);
            timer.callback();
        }
        clock = until;
    };
    f.params = new URLSearchParams(f.window.location.search);
    const forbidden = () => assert.fail('Unexpected outbound call or second identity owner');
    const posthog = {
        get_config(key) { return this.config?.[key]; },
        init(key, config) { this.config = { ...config, token: key }; },
        has_opted_out_capturing: () => false,
        capture(name, properties) {
            f.attempts.push(['analytics', name, plain(properties)]);
            if (f.failures.has('analytics')) throw new Error(privateText);
            const event = this.config.before_send({ event: name, properties: { ...properties,
                $current_url: f.window.location.href, $title: privateText } });
            if (event) f.events.push(plain(event));
        },
        identify: forbidden, reset: forbidden,
    };
    const datadogRum = { addAction(name, context) {
        f.attempts.push(['rum', name, plain(context)]);
        if (f.failures.has('rum')) throw new Error(privateText);
        f.actions.push([name, plain(context)]);
    }, setUser: forbidden, clearUser: forbidden };
    f.pb = { authStore: { record: f.user, save: forbidden }, collection: forbidden, send: forbidden };
    f.login = forbidden; f.signup = forbidden; f.refresh = forbidden; f.fetch = forbidden;
    f.navigator = { webdriver: true, mediaDevices: { getUserMedia: forbidden }, sendBeacon: forbidden };
    f.globals = {
        ...navigation, ...authErrors, ...enquiry, ...publicPages, ...community, ...personas, ...curriculum, ...timing,
        businessReplay, createOperatorClient, projectOperator, projectWorkspaceValue, publishedRoom, workspaceRoom, projectionStats,
        ONBOARDING_INTENTS: onboarding.ONBOARDING_INTENTS,
        saveWorkspace: onboarding.createWorkspace, pb: f.pb, window: f.window, navigator: f.navigator, document: {},
        URL, URLSearchParams, Error, TypeError, Promise, AbortController,
        performance: { getEntriesByType: () => [] }, fetch: (...args) => f.fetch(...args),
        XMLHttpRequest: class { constructor() { forbidden(); } },
        console: Object.fromEntries(['log', 'error', 'warn', 'info', 'debug'].map((key) => [key, (...args) => f.consoleCalls.push(args)])),
        __env: { VITE_BUILDANDDO_PH: 'synthetic-project', MODE: 'fixture' },
        useAuth: () => ({ user: f.user, isAuthed: true, login: (...args) => f.login(...args), signup: (...args) => f.signup(...args) }),
        useWorkspace: () => ({ refresh: (...args) => f.refresh(...args) }),
        useLocation: () => ({ pathname: f.window.location.pathname, search: f.window.location.search,
            state: { returnTo: '/app/erp?objective=synthetic-private-objective' } }),
        useNavigate: () => (...args) => f.navigations.push(plain(args)),
        useParams: () => ({ token: 'synthetic-private-reset-token' }),
        useSearchParams: () => [f.params, (value) => { f.params = new URLSearchParams(value); }],
        communityLink: (kind) => ({ url: `https://fixture.invalid/${kind}` }),
        FormData: class { constructor(values) { this.values = values; } get(key) { return this.values[key] ?? null; } },
    };
    const report = load('lib/observability/report.js', { ...f.globals, datadogRum, datadogLogs: {}, recordMetric: forbidden }, ['enableReporting', 'reportAction']);
    report.enableReporting();
    const context = load('lib/observability/context.js', f.globals, ['resolveEnvironment', 'resolveRelease']);
    const product = load('lib/telemetry.js', { ...f.globals, ...context, posthog }, ['initTelemetry', 'trackEvent']);
    product.initTelemetry();
    const runtime = load('lib/observability/runtime.js', { ...f.globals, ...report, trackEvent: product.trackEvent }, ['reportAction', 'readFailed']);
    f.globals = { ...f.globals, ...runtime, trackEvent: product.trackEvent };
    f.public = load('lib/publicActions.js', f.globals, ['PUBLIC_ACTIONS', 'publicActionSection', 'publicActionFailureReason', 'publicNavigationTarget', 'trackPublicAction']);
    Object.assign(f.globals, f.public);
    f.names = f.public.PUBLIC_ACTIONS;
    f.ocn = load('lib/ocnLogin.js', f.globals, ['ocnLogin', 'ocnRequested', 'readOcnHeader', 'OCN_MESSAGES']);
    Object.assign(f.globals, f.ocn);
    return f;
}

// Execute the actual pre-JSX component closures with explicit hook/API doubles.
// These are connected handler tests, not a substitute for React/DOM acceptance.
function handlers(f, path, name, exposed, { end = '\n    return (', preamble, globals = {}, props = {} } = {}) {
    const code = source(path), start = code.indexOf(`function ${name}(`), finish = code.indexOf(end, start);
    assert.ok(start >= 0 && finish > start, `Production handler boundaries remain present in ${path}`);
    const prefix = preamble === false ? '' : code.slice(0, preamble ? code.indexOf(preamble) : start).replace(/export default $/, '');
    const cells = [], effects = [], scheduled = [];
    let cursor = 0;
    const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
    const hooks = {
        useState(initial) {
            const index = cursor++;
            if (!cells[index]) cells[index] = { value: typeof initial === 'function' ? initial() : initial };
            return [cells[index].value, (value) => { cells[index].value = typeof value === 'function' ? value(cells[index].value) : value; }];
        },
        useRef(initial) { const index = cursor++; cells[index] ??= { current: initial }; return cells[index]; },
        useMemo(operation, deps) {
            const index = cursor++;
            if (!cells[index] || !same(cells[index].deps, deps)) cells[index] = { value: operation(), deps };
            return cells[index].value;
        },
        useCallback(callback, deps) {
            const index = cursor++;
            if (!cells[index] || !same(cells[index].deps, deps)) cells[index] = { value: callback, deps };
            return cells[index].value;
        },
        useEffect(callback, deps) {
            const index = cursor++;
            if (!effects[index] || !same(effects[index].deps, deps)) {
                scheduled.push(() => { effects[index]?.cleanup?.(); effects[index] = { callback, deps, cleanup: callback() }; });
            }
        },
    };
    const context = { ...f.globals, ...hooks, ...globals };
    Object.assign(context, load('hooks/useFailureTelemetry.js', context, ['useFailureTelemetry']));
    const component = vm.runInNewContext(`${moduleCode(prefix)}\n${code.slice(start, finish)}\nreturn { ${exposed.join(', ')} };\n}\n${name};`,
        context, { filename: path });
    return {
        read(nextProps = props) { props = nextProps; cursor = 0; const value = component(props); for (const effect of scheduled.splice(0)) effect(); return value; },
        replayEffects() { for (const effect of effects) if (effect) { effect.cleanup?.(); effect.cleanup = effect.callback(); } },
        unmount() { for (const effect of effects) effect?.cleanup?.(); },
    };
}

function observed(f, action, outcome, reason, section = f.window.location.pathname, extra = {}) {
    assert.deepEqual(f.actions.at(-1), [action, { outcome, reason, section, ...extra }]);
    const event = f.events.at(-1);
    assert.equal(event.event, action);
    for (const [key, value] of Object.entries(f.actions.at(-1)[1])) assert.equal(event.properties[key], value);
    assert.doesNotMatch(JSON.stringify([f.actions, f.events, f.attempts, f.consoleCalls]), /synthetic-private|example\.invalid|Synthetic-private/);
}

function authPage(f, signup = false) {
    const name = signup ? 'SignupPage' : 'LoginPage';
    const h = handlers(f, `pages/${name}.jsx`, name, ['handleSubmit', 'setForm', 'status', 'serverError', ...(signup ? [] : ['handleOcnLogin', 'ocnBusy', 'ocnError'])]);
    h.read().setForm({ email: ` ${email} `, password, ...(signup ? { name: privateText } : {}) });
    return h;
}

function recoveryPage(f, completing = false) {
    const name = completing ? 'ResetPasswordPage' : 'ForgotPasswordPage';
    const h = handlers(f, `pages/${name}.jsx`, name,
        ['handleSubmit', 'status', 'failure', ...(completing ? ['setPassword', 'setConfirm', 'password', 'confirm'] : ['setEmail'])],
        { end: completing ? '\n    const head = (' : "\n    if (status === 'success')" });
    if (completing) { h.read().setPassword(password); h.read().setConfirm(password); }
    else h.read().setEmail(` ${email} `);
    return h;
}

function onboard(f) {
    const h = handlers(f, 'pages/OnboardingPage.jsx', 'OnboardingDesk',
        ['next', 'createWorkspace', 'setIntent', 'setObjective', 'step', 'name', 'receipt', 'error', 'creating'], { end: '\n    return <div' });
    h.read().setIntent('build'); h.read().next(submit());
    h.read().setObjective(privateText); h.read().next(submit());
    return h;
}

const receipt = () => ({ owner: 'synthetic-account', workspace: 'synthetic-private-workspace', services: Array.from({ length: 7 }, (_, index) => `synthetic-private-service-${index}`),
    intent: 'build', objective: 'synthetic-private-objective' });

function talk(f) {
    const voice = load('lib/voiceAgent.js', f.globals, ['describeMicrophoneError', 'microphonePolicy']);
    return handlers(f, 'components/voice/TalkToBuddi.jsx', 'TalkToBuddi', ['start', 'phase', 'problem', 'note', 'actionSection', 'fail', 'ended'],
        { preamble: 'function VoiceNotLoaded', globals: { ...voice, voiceAgent: () => ({ agentId: privateText, talkToUrl: 'https://fixture.invalid/talk' }) } });
}

function session(f, callbacks = {}, actionSection = '/') {
    const sdk = { status: 'connecting', message: '', isSpeaking: false, isMuted: false, starts: [], ends: 0,
        startSession(value) { this.starts.push(plain(value)); }, endSession() { this.ends++; }, setMuted() {} };
    const h = handlers(f, 'components/voice/VoiceSession.jsx', 'Session', ['end', 'connected'], {
        globals: { useConversation(options) { sdk.options = options; return { ...sdk, startSession: (value) => sdk.startSession(value), endSession: () => sdk.endSession() }; } },
        props: { agentId: privateText, onEnd: callbacks.onEnd || (() => {}), onFail: callbacks.onFail || (() => {}), actionSection },
    });
    return { h, sdk };
}

test('public action vocabulary is frozen, closed and distinct from auth identity', () => {
    const f = fixture();
    assert.equal(Object.isFrozen(f.names), true);
    assert.deepEqual(Object.values(f.names), ['public.auth.login', 'public.auth.signup', 'public.auth.ocn_login', 'public.password_reset.request',
        'public.password_reset.complete', 'public.early_access.request', 'public.enquiry.draft', 'public.onboarding.step', 'public.onboarding.complete', 'public.voice.session',
        'public.navigation.click', 'public.cta.click', 'public.docs.search', 'public.guide.open', 'public.article.open', 'public.persona.result',
        'public.lesson.open', 'roadmap_milestone_hover', 'workspace.replay.snapshot', 'passport.viewed', 'passport.epoch_selected', 'passport.verify_clicked',
        'workspace.rooms.mode_changed', 'workspace.rooms.source_changed', 'workspace.rooms.projection']);
    for (const action of [privateText, 'constructor', '__proto__', {}, null, 'auth.identified']) f.public.trackPublicAction(action, 'success', 'confirmed');
    for (const outcome of [privateText, 'sent', 'delivered', {}, null]) f.public.trackPublicAction(f.names.LOGIN, outcome, 'confirmed');
    for (const reason of [privateText, 'account_exists', 'account_not_found', {}, null]) f.public.trackPublicAction(f.names.LOGIN, 'success', reason);
    assert.deepEqual(f.attempts, []);
});

test('only closed step counts and canonical sections reach either sink', () => {
    const f = fixture('/reset-password/synthetic-private-reset-token?email=synthetic-private#synthetic-private');
    f.public.trackPublicAction(f.names.ONBOARDING_STEP, 'advanced', 'local_step', {
        step: 2, email, name: privateText, token: privateText, error: privateText, route: privateText, count: 9000,
    }, { section: '/onboarding?token=synthetic-private#synthetic-private', email });
    observed(f, f.names.ONBOARDING_STEP, 'advanced', 'local_step', '/onboarding', { step: 2 });
    for (const step of [-1, 0, 4, 1.5, NaN, Infinity, '2', {}, null]) {
        f.public.trackPublicAction(f.names.ONBOARDING_STEP, 'advanced', 'local_step', { step });
        assert.equal('step' in f.actions.at(-1)[1], false);
    }
    f.public.trackPublicAction(f.names.LOGIN, 'success', 'confirmed', { step: 1 });
    observed(f, f.names.LOGIN, 'success', 'confirmed', '/reset-password/:token');
    f.public.trackPublicAction(f.names.ONBOARDING_STEP, 'advanced', 'local_step', Object.create({ step: 1 }));
    assert.equal('step' in f.actions.at(-1)[1], false);
});

test('hostile optional properties and unavailable browser state cannot break either sink', () => {
    const f = fixture(), counts = {}, options = {};
    const bad = () => { throw new Error(privateText); };
    Object.defineProperty(counts, 'step', { get: bad }); Object.defineProperty(options, 'section', { get: bad });
    f.public.trackPublicAction(f.names.ONBOARDING_STEP, 'advanced', 'local_step', counts, options);
    observed(f, f.names.ONBOARDING_STEP, 'advanced', 'local_step', '/unknown');
    Object.defineProperty(f.window, 'location', { get: bad });
    assert.equal(f.public.publicActionSection(), '/unknown');
    f.public.trackPublicAction(f.names.LOGIN, 'failure', 'unknown', null, null);
    assert.deepEqual(f.actions.at(-1), [f.names.LOGIN, { outcome: 'failure', reason: 'unknown', section: '/unknown' }]);
    assert.deepEqual(f.attempts.slice(-2).map(([sink]) => sink), ['rum', 'analytics']);
    assert.equal(f.events.length, 1, 'The analytics wrapper fails closed when its browser context is unavailable');
    assert.equal(f.public.publicActionSection('not-a-route'), '/unknown');
    assert.equal(f.public.publicActionSection('/guild/synthetic-private'), '/guild/:slug');
});

for (const sink of ['rum', 'analytics', 'both']) test(`a failing ${sink} SDK does not block the other public sink`, () => {
    const f = fixture();
    for (const name of sink === 'both' ? ['rum', 'analytics'] : [sink]) f.failures.add(name);
    assert.doesNotThrow(() => f.public.trackPublicAction(f.names.LOGIN, 'success', 'confirmed'));
    assert.deepEqual(f.attempts.map(([name]) => name), ['rum', 'analytics']);
    assert.equal(f.actions.length, sink === 'analytics' ? 1 : 0);
    assert.equal(f.events.length, sink === 'rum' ? 1 : 0);
});

for (const mode of ['throw', 'reject']) test(`wrapper ${mode}s and mutation cannot cross-contaminate sinks`, async () => {
    const f = fixture(), calls = [];
    const fail = (name, context) => { calls.push([name, plain(context)]); context.section = privateText;
        if (mode === 'throw') throw new Error(privateText); return Promise.reject(new Error(privateText)); };
    const api = load('lib/publicActions.js', { ...f.globals, reportAction: fail, trackEvent: fail }, ['trackPublicAction']);
    assert.equal(api.trackPublicAction(f.names.LOGIN, 'success', 'confirmed'), undefined);
    await tick();
    assert.equal(calls.length, 2); assert.deepEqual(calls[0], calls[1]); assert.equal(calls[1][1].section, '/login');
});

test('native rejection classification never reads messages, bodies or profile fields', () => {
    const f = fixture();
    for (const [status, reason] of [[0, 'network'], [400, 'rejected'], [401, 'rejected'], [404, 'rejected'], [429, 'rate_limited'], [503, 'server']]) {
        const error = { status, get message() { assert.fail('Message must not be inspected'); }, get response() { assert.fail('Body must not be inspected'); } };
        assert.equal(f.public.publicActionFailureReason(error), reason);
    }
    assert.equal(f.public.publicActionFailureReason({ get status() { throw new Error(privateText); } }), 'unknown');
});

for (const signup of [false, true]) test(`${signup ? 'signup' : 'login'} reports only its result and keeps its starting section through navigation`, async () => {
    const path = signup ? '/signup' : '/login', f = fixture(path), held = deferred(), calls = [];
    f[signup ? 'signup' : 'login'] = (...args) => { calls.push(args); return held.promise; };
    const h = authPage(f, signup), pending = h.read().handleSubmit(submit());
    assert.equal(h.read().status, 'submitting'); await h.read().handleSubmit(submit());
    assert.equal(calls.length, 1); assert.equal(f.actions.length, 0);
    f.window.location = new URL('https://fixture.invalid/app/missions?name=synthetic-private');
    held.resolve({ token: privateText, record: { id: privateText, email, name: privateText } }); await pending;
    observed(f, signup ? f.names.SIGNUP : f.names.LOGIN, 'success', 'confirmed', path);
    assert.deepEqual(plain(calls[0]), signup ? [email, password, { name: privateText }] : [email, password]);
    assert.equal(f.navigations[0][0], signup ? '/onboarding' : '/app/erp?objective=synthetic-private-objective');
    assert.equal(f.actions.length, 1); assert.equal(f.events.length, 1);
});

for (const signup of [false, true]) test(`${signup ? 'signup' : 'login'} keeps validation and server UI without leaking input or errors`, async () => {
    const f = fixture(signup ? '/signup' : '/login'), h = authPage(f, signup), action = signup ? f.names.SIGNUP : f.names.LOGIN;
    h.read().setForm({ name: '', email: '', password: '' }); await h.read().handleSubmit(submit());
    observed(f, action, 'failure', 'validation');
    h.read().setForm({ name: privateText, email, password });
    f[signup ? 'signup' : 'login'] = async () => { throw { status: 400, response: { message: privateText, data: { email: privateText } } }; };
    await h.read().handleSubmit(submit());
    observed(f, action, 'failure', 'rejected');
    assert.equal(h.read().status, 'error');
    assert.equal(h.read().serverError, signup ? 'That email is already registered. Try signing in instead.' : privateText);
    assert.equal(f.navigations.length, 0);
});

test('OCN exchanges the same runtime envelope once and records a separate result, never another identity', async () => {
    const f = fixture('/login?ocn=1'), held = deferred(), saved = [];
    f.window.__BND_OCN_HEADER__ = 'synthetic-private-envelope';
    f.fetch = (...args) => { f.apiCalls.push(args); return held.promise; };
    f.pb.authStore.save = (...args) => saved.push(args);
    const h = authPage(f), pending = h.read().handleOcnLogin();
    assert.equal(h.read().ocnBusy, true); assert.equal(f.actions.length, 0);
    f.window.location = new URL('https://fixture.invalid/app');
    const record = { id: privateText, email, name: privateText };
    held.resolve({ status: 200, json: async () => ({ token: 'synthetic-private-envelope', record }) }); await pending;
    observed(f, f.names.OCN_LOGIN, 'success', 'confirmed', '/login');
    assert.equal(f.apiCalls.length, 1); assert.equal(saved.length, 1);
    assert.equal(f.apiCalls[0][1].headers['X-Citadel-Key'], 'synthetic-private-envelope');
    assert.equal(h.read().ocnBusy, false); assert.equal(f.navigations[0][0], '/app');
});

for (const status of [403, 404, 503, 200]) test(`OCN ${status === 200 ? 'malformed response' : status} remains a failed sign-in`, async () => {
    const f = fixture('/login?ocn=1'); f.window.__BND_OCN_HEADER__ = 'synthetic-private-envelope';
    f.fetch = async () => ({ status, json: async () => ({ message: privateText }) });
    const h = authPage(f); await h.read().handleOcnLogin();
    observed(f, f.names.OCN_LOGIN, 'failure', status === 503 ? 'server' : 'rejected', '/login');
    assert.ok(h.read().ocnError); assert.equal(h.read().ocnBusy, false); assert.equal(f.navigations.length, 0);
});

for (const status of [200, 400, 404, 0, 429, 503]) test(`reset request ${status} never claims delivery or discloses account existence`, async () => {
    const f = fixture('/forgot-password'), held = deferred();
    f.pb.collection = (name) => { assert.equal(name, 'users'); return { requestPasswordReset(value) { f.apiCalls.push(value); return held.promise; } }; };
    const h = recoveryPage(f), pending = h.read().handleSubmit(submit());
    assert.equal(f.actions.length, 0); await h.read().handleSubmit(submit()); assert.equal(f.apiCalls.length, 1);
    f.window.location = new URL('https://fixture.invalid/contact');
    if (status === 200) held.resolve(true); else held.reject({ status, response: { message: `${email} ${privateText}` } });
    await pending;
    const opaque = status === 400 || status === 404;
    observed(f, f.names.PASSWORD_RESET_REQUEST, status === 200 ? 'accepted' : opaque ? 'opaque' : 'failure',
        status === 200 ? 'request_accepted' : opaque ? 'opaque' : status === 0 ? 'network' : status === 429 ? 'rate_limited' : 'server', '/forgot-password');
    assert.equal(h.read().status, status === 200 || opaque ? 'success' : 'error'); assert.deepEqual(f.apiCalls, [email]);
    assert.doesNotMatch(JSON.stringify([f.actions, f.events]), /delivered|sent|account_exists|not_found/);
});

for (const status of [200, 400, 404, 0, 429, 503]) test(`reset completion ${status} uses only the native result and masks the token section`, async () => {
    const f = fixture('/reset-password/synthetic-private-reset-token'), held = deferred();
    f.pb.collection = () => ({ confirmPasswordReset(...args) { f.apiCalls.push(args); return held.promise; } });
    const h = recoveryPage(f, true), pending = h.read().handleSubmit(submit());
    assert.equal(f.actions.length, 0);
    f.window.location = new URL('https://fixture.invalid/login');
    if (status === 200) held.resolve(true); else held.reject({ status, response: { message: privateText } });
    await pending;
    observed(f, f.names.PASSWORD_RESET_COMPLETE, status === 200 ? 'success' : 'failure',
        status === 200 ? 'confirmed' : status === 0 ? 'network' : status === 429 ? 'rate_limited' : status === 503 ? 'server' : 'rejected', '/reset-password/:token');
    assert.deepEqual(f.apiCalls[0], ['synthetic-private-reset-token', password, password]);
    assert.equal(h.read().password, status === 200 ? '' : password); assert.equal(h.read().status, status === 200 ? 'success' : 'error');
});

test('recovery validation emits no API call and does not imply a reset result', async () => {
    for (const completing of [false, true]) {
        const f = fixture(completing ? '/reset-password/synthetic-private' : '/forgot-password'), h = recoveryPage(f, completing);
        if (completing) h.read().setConfirm('mismatch'); else h.read().setEmail('invalid');
        await h.read().handleSubmit(submit());
        observed(f, completing ? f.names.PASSWORD_RESET_COMPLETE : f.names.PASSWORD_RESET_REQUEST, 'failure', 'validation',
            completing ? '/reset-password/:token' : '/forgot-password');
        assert.equal(h.read().status, 'idle');
    }
});

test('early access retains validation, native payload and failure UI without console content', async () => {
    const f = fixture('/'), h = handlers(f, 'components/site/EarlyAccess.jsx', 'EarlyAccess', ['handleSubmit', 'setForm', 'status', 'reset']);
    await h.read().handleSubmit(submit()); observed(f, f.names.EARLY_ACCESS_REQUEST, 'failure', 'validation');
    h.read().setForm({ name: privateText, email, businessType: 'Learning on my own', task: privateText });
    const held = deferred();
    f.pb.collection = (name) => { assert.equal(name, 'early_access'); return { create(value) { f.apiCalls.push(plain(value)); return held.promise; } }; };
    const pending = h.read().handleSubmit(submit()); f.window.location = new URL('https://fixture.invalid/pricing');
    held.resolve({ id: privateText }); await pending;
    observed(f, f.names.EARLY_ACCESS_REQUEST, 'accepted', 'request_accepted', '/');
    assert.equal(h.read().status, 'success'); assert.deepEqual(f.apiCalls[0], { name: privateText, email, business_type: 'Learning on my own', task: privateText });
    h.read().reset(); h.read().setForm({ name: privateText, email, businessType: 'Learning on my own', task: privateText });
    f.pb.collection = () => ({ create: async () => { throw { status: 503, response: { message: privateText } }; } });
    await h.read().handleSubmit(submit()); observed(f, f.names.EARLY_ACCESS_REQUEST, 'failure', 'server', '/pricing');
    assert.equal(h.read().status, 'error'); assert.deepEqual(f.consoleCalls, []);
});

test('enquiry preparation and mailto activation remain local, distinct and never count as sending', () => {
    const f = fixture('/contact?interest=pilot&email=synthetic-private');
    const h = handlers(f, 'pages/ContactPage.jsx', 'CommercialEnquiryForm', ['prepareDraft', 'openDraft', 'draft', 'error'], { props: { interest: 'pilot' } });
    const fields = { name: privateText, email, message: privateText, outcome: privateText, constraints: privateText };
    h.read().prepareDraft({ ...submit(), currentTarget: fields });
    observed(f, f.names.ENQUIRY_DRAFT, 'prepared', 'local_draft', '/contact');
    assert.equal(h.read().draft.body.includes(email), true);
    const href = h.read().draft.href; h.read().openDraft();
    observed(f, f.names.ENQUIRY_DRAFT, 'opened', 'mailto_handoff', '/contact');
    assert.equal(h.read().draft.href, href); assert.match(href, /^mailto:/);
    h.read().prepareDraft({ ...submit(), currentTarget: { ...fields, message: '   ' } });
    observed(f, f.names.ENQUIRY_DRAFT, 'failure', 'validation', '/contact');
    assert.equal(h.read().draft, null); assert.ok(h.read().error); assert.equal(f.apiCalls.length, 0);
    assert.doesNotMatch(JSON.stringify([f.actions, f.events]), /sent|delivered/);
});

test('onboarding step advances are local and completion waits for native receipt plus readable workspace', async () => {
    const f = fixture('/onboarding'), saved = deferred(), refreshed = deferred(), h = onboard(f);
    assert.deepEqual(f.actions.map(([, value]) => [value.outcome, value.reason, value.step]), [['advanced', 'local_step', 1], ['advanced', 'local_step', 2]]);
    f.pb.send = (path, options) => { f.apiCalls.push([path, plain(options)]); return saved.promise; };
    f.refresh = () => refreshed.promise;
    const pending = h.read().createWorkspace(submit()); await h.read().createWorkspace(submit());
    assert.equal(f.apiCalls.length, 1); assert.equal(f.actions.length, 2);
    saved.resolve(receipt()); await tick(); assert.equal(f.actions.length, 2); assert.ok(h.read().receipt);
    f.window.location = new URL('https://fixture.invalid/app'); refreshed.resolve([{ id: receipt().workspace }]); await pending;
    observed(f, f.names.ONBOARDING_COMPLETE, 'success', 'confirmed', '/onboarding');
    assert.deepEqual(f.actions.at(-2), [f.names.ONBOARDING_STEP, { outcome: 'success', reason: 'confirmed', section: '/onboarding', step: 3 }]);
    assert.equal(f.apiCalls[0][1].body.name, privateText); assert.equal(f.apiCalls[0][1].requestKey, null);
    assert.equal(f.navigations[0][0], '/app/erp?objective=synthetic-private-objective');
});

for (const mode of ['malformed', 'lost', 'refresh_missing', 'refresh_throw']) test(`onboarding ${mode} does not emit completion and preserves explicit retry`, async () => {
    const f = fixture('/onboarding'), h = onboard(f); let saves = 0, refreshes = 0;
    f.pb.send = async () => { saves++; if (mode === 'lost') throw new Error(privateText); return mode === 'malformed' ? { workspace: privateText } : receipt(); };
    f.refresh = async () => { refreshes++; if (mode === 'refresh_throw') throw new Error(privateText); return undefined; };
    await h.read().createWorkspace(submit());
    observed(f, f.names.ONBOARDING_COMPLETE, 'uncertain', mode === 'refresh_missing' ? 'workspace_unavailable' : 'unconfirmed');
    assert.equal(f.actions.filter(([, value]) => value.outcome === 'success').length, 0); assert.equal(f.navigations.length, 0);
    f.pb.send = async () => { saves++; return receipt(); }; f.refresh = async () => { refreshes++; return [{ id: receipt().workspace }]; };
    await h.read().createWorkspace(submit()); observed(f, f.names.ONBOARDING_COMPLETE, 'success', 'confirmed');
    assert.equal(saves, mode.startsWith('refresh') ? 1 : 2); assert.equal(refreshes, mode.startsWith('refresh') ? 2 : 1);
});

for (const stage of ['save', 'refresh']) for (const change of ['account', 'unmount']) test(`onboarding ${change} during ${stage} suppresses stale success and navigation`, async () => {
    const f = fixture('/onboarding'), held = deferred(), h = onboard(f);
    f.pb.send = () => stage === 'save' ? held.promise : Promise.resolve(receipt());
    f.refresh = () => { f.apiCalls.push('refresh'); return held.promise; };
    const pending = h.read().createWorkspace(submit()); await tick();
    if (change === 'account') f.pb.authStore.record = { id: 'another-account' }; else h.unmount();
    held.resolve(stage === 'save' ? receipt() : [{ id: receipt().workspace }]); await pending;
    assert.equal(f.actions.length, 2); assert.equal(f.events.length, 2); assert.equal(f.navigations.length, 0);
    assert.equal(f.apiCalls.length, stage === 'save' ? 0 : 1);
});

test('voice starts only on explicit intent, retains its section and does not count speaking as another connection', async () => {
    const f = fixture('/'), microphone = deferred(), h = talk(f); let stopped = 0;
    f.navigator.mediaDevices.getUserMedia = () => microphone.promise;
    assert.equal(h.read().phase, 'idle'); assert.equal(f.actions.length, 0);
    const pending = h.read().start(); observed(f, f.names.VOICE_SESSION, 'started', 'user_requested', '/');
    f.window.location = new URL('https://fixture.invalid/docs');
    microphone.resolve({ getTracks: () => [{ stop() { stopped++; } }] }); await pending;
    assert.equal(h.read().phase, 'session'); assert.equal(stopped, 1);
    const s = session(f, { onEnd: h.read().ended, onFail: h.read().fail }, h.read().actionSection.current);
    s.h.read(); assert.equal(s.sdk.starts.length, 1); assert.equal(f.actions.length, 1);
    s.sdk.status = 'connected'; s.h.read(); observed(f, f.names.VOICE_SESSION, 'connected', 'connected', '/');
    s.sdk.isSpeaking = true; s.h.read(); s.h.replayEffects(); assert.equal(f.actions.length, 2); assert.equal(s.sdk.starts.length, 1);
    s.sdk.endSession = () => { s.sdk.ends++; s.sdk.options.onDisconnect({ reason: 'user' }); };
    s.h.read().end(); observed(f, f.names.VOICE_SESSION, 'ended', 'user_ended', '/');
    assert.equal(f.actions.length, 3); assert.equal(s.sdk.ends, 1); assert.equal(h.read().phase, 'idle');
    s.sdk.options.onDisconnect({ reason: 'agent' }); assert.equal(f.actions.length, 3);
});

test('voice microphone policy and permission failures keep their existing retry behavior', async () => {
    const f = fixture('/'), h = talk(f);
    f.globals.document.permissionsPolicy = { allowsFeature: () => false };
    await h.read().start(); observed(f, f.names.VOICE_SESSION, 'failure', 'policy_blocked', '/');
    assert.equal(h.read().problem.retry, false); assert.equal(h.read().phase, 'unavailable');
    delete f.globals.document.permissionsPolicy;
    f.navigator.mediaDevices.getUserMedia = async () => { throw Object.assign(new Error(privateText), { name: 'NotAllowedError' }); };
    await h.read().start(); observed(f, f.names.VOICE_SESSION, 'failure', 'microphone_unavailable', '/');
    assert.equal(h.read().problem.retry, true); assert.match(h.read().problem.reason, /did not allow/);
    f.navigator.mediaDevices.getUserMedia = async () => ({ getTracks: () => [] });
    await h.read().start(); observed(f, f.names.VOICE_SESSION, 'started', 'user_requested', '/'); assert.equal(h.read().phase, 'session');
});

test('a failed lazy voice chunk reports once without collecting the loader error', () => {
    const f = fixture('/docs'), calls = [];
    const h = handlers(f, 'components/voice/TalkToBuddi.jsx', 'VoiceNotLoaded', [], { end: '\n    return null;', props: {
        onFail: (...args) => calls.push(args), actionSection: '/',
    } });
    h.read(); h.replayEffects(); observed(f, f.names.VOICE_SESSION, 'failure', 'load_failed', '/');
    assert.equal(f.actions.length, 1); assert.equal(calls.length, 2); assert.equal(calls[0][2], false);
});

for (const mode of ['throw', 'status', 'disconnect']) test(`voice ${mode} failures are bounded and terminal measurement is deduplicated without suppressing callbacks`, () => {
    const f = fixture('/'), calls = [], s = session(f, { onFail: (...args) => calls.push(args) });
    if (mode === 'throw') s.sdk.startSession = () => { throw new Error(privateText); };
    s.h.read();
    if (mode === 'status') { s.sdk.status = 'error'; s.sdk.message = privateText; s.h.read(); }
    if (mode === 'disconnect') s.sdk.options.onDisconnect({ reason: 'error', message: privateText });
    observed(f, f.names.VOICE_SESSION, 'failure', mode === 'disconnect' ? 'connection_lost' : 'connection_failed', '/');
    s.sdk.options.onDisconnect({ reason: 'error', message: privateText });
    s.sdk.status = 'connected'; s.h.read(); assert.equal(f.actions.length, 1); assert.equal(calls.length, 2);
    assert.equal(calls[0][1], privateText, 'Existing visible SDK detail remains unchanged, but is not sent to telemetry');
});

for (const reason of ['agent', 'user', privateText]) test(`voice disconnect ${reason === privateText ? 'unknown' : reason} retains a closed reason`, () => {
    const f = fixture('/'), ended = [], s = session(f, { onEnd: (value) => ended.push(value) });
    s.h.read(); s.sdk.options.onDisconnect({ reason, message: privateText });
    observed(f, f.names.VOICE_SESSION, 'ended', reason === 'agent' ? 'agent_ended' : reason === 'user' ? 'user_ended' : 'disconnected', '/');
    assert.equal(ended.length, 1);
});

test('explicit voice cancel still ends once even without a disconnect callback', () => {
    const f = fixture('/'), calls = [], s = session(f, { onEnd: (value) => calls.push(value) });
    s.h.read().end(); observed(f, f.names.VOICE_SESSION, 'ended', 'user_requested', '/');
    assert.equal(s.sdk.ends, 1); assert.equal(calls.length, 1);
});

test('throwing SDK observers cannot convert successful public work into application failures or retries', async () => {
    for (const kind of ['login', 'signup', 'request', 'reset', 'onboarding', 'early_access', 'enquiry', 'voice']) {
        const f = fixture('/'); f.failures.add('rum'); f.failures.add('analytics');
        if (kind === 'login' || kind === 'signup') {
            f[kind] = async () => true; const h = authPage(f, kind === 'signup'); await h.read().handleSubmit(submit());
            assert.equal(h.read().serverError, ''); assert.equal(f.navigations.length, 1);
        } else if (kind === 'request' || kind === 'reset') {
            f.pb.collection = () => ({ requestPasswordReset: async () => true, confirmPasswordReset: async () => true });
            const h = recoveryPage(f, kind === 'reset'); await h.read().handleSubmit(submit()); assert.equal(h.read().status, 'success');
        } else if (kind === 'onboarding') {
            f.pb.send = async () => { f.apiCalls.push('save'); return receipt(); }; f.refresh = async () => [{ id: receipt().workspace }];
            const h = onboard(f); await h.read().createWorkspace(submit()); assert.equal(h.read().error, ''); assert.equal(f.apiCalls.length, 1);
        } else if (kind === 'early_access') {
            f.pb.collection = () => ({ create: async () => ({ id: privateText }) });
            const h = handlers(f, 'components/site/EarlyAccess.jsx', 'EarlyAccess', ['handleSubmit', 'setForm', 'status']);
            h.read().setForm({ name: privateText, email, businessType: 'Learning on my own', task: privateText });
            await h.read().handleSubmit(submit()); assert.equal(h.read().status, 'success');
        } else if (kind === 'enquiry') {
            const h = handlers(f, 'pages/ContactPage.jsx', 'CommercialEnquiryForm', ['prepareDraft', 'openDraft', 'draft', 'error'], { props: { interest: 'commercial' } });
            h.read().prepareDraft({ ...submit(), currentTarget: { name: privateText, email, message: privateText } }); h.read().openDraft();
            assert.ok(h.read().draft); assert.equal(h.read().error, '');
        } else {
            f.navigator.mediaDevices.getUserMedia = async () => ({ getTracks: () => [] }); const h = talk(f); await h.read().start();
            const s = session(f, { onEnd: h.read().ended, onFail: h.read().fail }); s.h.read(); s.sdk.status = 'connected'; s.h.read().end();
            assert.equal(h.read().phase, 'idle'); assert.equal(s.sdk.starts.length, 1); assert.equal(s.sdk.ends, 1);
        }
        assert.ok(f.attempts.length > 0, kind); assert.equal(f.actions.length, 0); assert.equal(f.events.length, 0);
        assert.equal(f.attempts.filter(([sink]) => sink === 'rum').length, f.attempts.filter(([sink]) => sink === 'analytics').length);
        assert.doesNotMatch(JSON.stringify(f.attempts), /synthetic-private|Synthetic-private|example\.invalid/);
    }
});

test('the instrumented closures remain wired to existing controls without another auth or click collector', () => {
    assert.match(source('pages/ContactPage.jsx'), /href=\{draft\.href\} onClick=\{openDraft\}/);
    assert.match(source('components/voice/VoiceSession.jsx'), /onClick=\{end\}/);
    assert.match(source('components/voice/TalkToBuddi.jsx'), /actionSection=\{actionSection\.current\}/);
    for (const path of ['pages/LoginPage.jsx', 'pages/SignupPage.jsx', 'pages/ForgotPasswordPage.jsx', 'pages/ResetPasswordPage.jsx',
        'pages/OnboardingPage.jsx', 'pages/ContactPage.jsx', 'components/site/EarlyAccess.jsx', 'components/voice/TalkToBuddi.jsx', 'components/voice/VoiceSession.jsx']) {
        assert.match(source(path), /from '@\/lib\/publicActions'/);
        assert.doesNotMatch(source(path), /@datadog\/browser|from ['"]posthog|trackAuthIdentity|identifyTelemetryUser|addEventListener\(['"]click/);
    }
});

test('step-16 fields are action-specific closed enums and bounded counts, not record or URL bags', () => {
    const f = fixture('/docs'), { trackPublicAction: track, publicNavigationTarget: target } = f.public;
    for (const value of [privateText, '/docs?q=synthetic-private', '/guild/synthetic-private', 'constructor', '__proto__', {}, null]) assert.equal(target(value), 'other');
    assert.equal(target('/docs'), 'docs'); assert.equal(target('/#early-access'), 'early_access');
    track(f.names.CTA, 'intent', 'user_requested', { completed: 3, step: 1 }, { placement: 'pricing', plan: 'pilot', target: 'contact', id: privateText, href: privateText });
    observed(f, f.names.CTA, 'intent', 'user_requested', '/docs', { placement: 'pricing', plan: 'pilot', target: 'contact' });
    track(f.names.REPLAY_SNAPSHOT, 'observed', 'recorded_snapshot', { completed: 2, uncertain: 0, failed: 1, id: privateText }, { plan: 'pilot' });
    observed(f, f.names.REPLAY_SNAPSHOT, 'observed', 'recorded_snapshot', '/docs', { completed: 2, uncertain: 0, failed: 1 });
    for (const value of [privateText, '2', -1, 1001, 1.5, Infinity, {}, null]) {
        track(f.names.REPLAY_SNAPSHOT, 'observed', 'recorded_snapshot', { completed: value, uncertain: value, failed: value });
        observed(f, f.names.REPLAY_SNAPSHOT, 'observed', 'recorded_snapshot', '/docs');
    }
    track(f.names.CTA, 'intent', 'user_requested', {}, { placement: privateText, plan: privateText, target: privateText });
    observed(f, f.names.CTA, 'intent', 'user_requested', '/docs');
    const props = { get placement() { throw new Error(privateText); } };
    assert.doesNotThrow(() => track(f.names.CTA, 'intent', 'user_requested', {}, props));
    track(f.names.CTA, 'intent', 'user_requested', {}, Object.create({ plan: 'pilot' }));
    observed(f, f.names.CTA, 'intent', 'user_requested', '/docs');
});

test('Docs debounces actual query changes, captures only capped length and result count, and measures guide activation', () => {
    const f = fixture('/docs'), h = handlers(f, 'pages/DocsPage.jsx', 'DocsPage', ['changeQuery', 'openGuide', 'guides']);
    h.read(); f.advance(1000); assert.equal(f.actions.length, 0, 'No extra pageview or initial search');
    h.read().changeQuery({ target: { value: 'repeat' } }); h.read(); f.advance(200);
    h.read().changeQuery({ target: { value: 'repeatable' } }); h.read(); f.advance(299); assert.equal(f.actions.length, 0);
    f.advance(1); observed(f, f.names.DOCS_SEARCH, 'observed', 'query_settled', '/docs', { term_length: 10, result_count: 1 });
    h.read(); f.advance(1000); assert.equal(f.actions.length, 1);
    for (const entry of ['contents', 'destination', 'reference']) {
        h.read().openGuide(entry); observed(f, f.names.GUIDE_OPEN, 'opened', 'user_requested', '/docs', { entry });
    }
    h.read().changeQuery({ target: { value: privateText.repeat(20) } }); h.read(); f.advance(300);
    observed(f, f.names.DOCS_SEARCH, 'observed', 'query_settled', '/docs', { term_length: 200, result_count: 0 });
    h.read().changeQuery({ target: { value: '' } }); h.read(); f.advance(300);
    observed(f, f.names.DOCS_SEARCH, 'observed', 'query_settled', '/docs', { term_length: 0, result_count: h.read().guides.length });
});

for (const change of ['route', 'unmount']) test(`Docs ${change} cancels delayed search observation`, () => {
    const f = fixture('/docs'), h = handlers(f, 'pages/DocsPage.jsx', 'DocsPage', ['changeQuery']);
    h.read().changeQuery({ target: { value: privateText } }); h.read();
    if (change === 'route') f.window.location = new URL('https://fixture.invalid/contact'); else h.unmount();
    f.advance(300); assert.equal(f.attempts.length, 0);
});

test('all pricing plans emit enquiry intent only and never read APIs or claim purchase', () => {
    const f = fixture('/pricing'), h = handlers(f, 'pages/PricingPage.jsx', 'PricingPage', ['selectPlan']);
    h.read(); assert.equal(f.actions.length, 0);
    for (const plan of ['government', 'pilot', 'early_access', 'team']) {
        h.read().selectPlan(plan); observed(f, f.names.CTA, 'intent', 'user_requested', '/pricing', { placement: 'pricing', plan });
    }
    assert.doesNotMatch(JSON.stringify([f.actions, f.events]), /purchase|paid|activated|subscription/);
});

test('blog details emit exactly once per closed-to-open transition, never article IDs or text', () => {
    const f = fixture('/blog'), h = handlers(f, 'pages/BlogPage.jsx', 'BlogPage', ['toggleArticle']), a = { open: false, id: privateText }, b = { open: true, textContent: privateText };
    h.read().toggleArticle({ currentTarget: a }); assert.equal(f.actions.length, 0);
    a.open = true; h.read().toggleArticle({ currentTarget: a }); h.read().toggleArticle({ currentTarget: a });
    observed(f, f.names.ARTICLE_OPEN, 'opened', 'user_requested'); assert.equal(f.actions.length, 1);
    a.open = false; h.read().toggleArticle({ currentTarget: a }); assert.equal(f.actions.length, 1);
    a.open = true; h.read().toggleArticle({ currentTarget: a }); h.read().toggleArticle({ currentTarget: b }); assert.equal(f.actions.length, 3);
});

test('persona lookup distinguishes known and unknown profiles without sending slugs or another pageview', () => {
    const f = fixture('/guild/forge'); f.slug = 'forge';
    const h = handlers(f, 'pages/PersonaProfilePage.jsx', 'PersonaProfilePage', ['persona'], {
        preamble: 'function UnknownPersona', end: '\n    if (!persona)', globals: { useParams: () => ({ slug: f.slug }) },
    });
    assert.equal(h.read().persona.slug, 'forge'); observed(f, f.names.PERSONA_RESULT, 'observed', 'known_profile', '/guild/:slug');
    h.read(); h.replayEffects(); assert.equal(f.actions.length, 1);
    f.slug = privateText; f.window.location = new URL(`https://fixture.invalid/guild/${privateText}`);
    assert.equal(h.read().persona, null); observed(f, f.names.PERSONA_RESULT, 'observed', 'unknown_profile', '/guild/:slug');
    f.slug = 'oracle'; h.read(); assert.equal(f.actions.length, 3);
    assert.ok(f.events.every((event) => event.event === f.names.PERSONA_RESULT));
    assert.doesNotMatch(JSON.stringify([f.actions, f.events]), /forge|oracle|synthetic-private/);
});

const icons = Object.fromEntries(['MessageCircle', 'Users', 'BookOpen', 'Newspaper', 'Youtube', 'Github', 'AudioLines', 'Building2', 'Network', 'GitBranch'].map((name) => [name, () => null]));

test('header and footer keep link/menu behavior while forwarding only fixed target names', () => {
    const f = fixture('/'), header = handlers(f, 'components/site/Header.jsx', 'Header', ['clickNavigation', 'clickCta', 'open', 'setOpen'], {
        globals: { useRoomsLive: () => true }, props: { ctaHref: `/signup?name=${privateText}`, ctaLabel: privateText },
    });
    header.read().setOpen(true); header.read().clickNavigation('/docs', true);
    observed(f, f.names.NAVIGATION, 'intent', 'navigation', '/', { placement: 'header_mobile', target: 'docs' });
    assert.equal(header.read().open, false);
    header.read().clickNavigation('/roadmap'); observed(f, f.names.NAVIGATION, 'intent', 'navigation', '/', { placement: 'header', target: 'roadmap' });
    header.read().setOpen(true); header.read().clickCta(`/signup?name=${privateText}`, true);
    observed(f, f.names.CTA, 'intent', 'user_requested', '/', { placement: 'header_mobile', target: 'other' }); assert.equal(header.read().open, false);
    header.read().clickCta('/app'); observed(f, f.names.CTA, 'intent', 'user_requested', '/', { placement: 'header', target: 'workspace' });
    const footer = handlers(f, 'components/site/Footer.jsx', 'Footer', ['clickNavigation', 'clickCta'], { globals: icons });
    footer.read().clickNavigation('/contact'); observed(f, f.names.NAVIGATION, 'intent', 'navigation', '/', { placement: 'footer', target: 'contact' });
    footer.read().clickCta(); observed(f, f.names.CTA, 'intent', 'user_requested', '/', { placement: 'footer', target: 'early_access' });
    footer.read({ earlyAccessHref: `https://fixture.invalid/${privateText}` }).clickCta();
    observed(f, f.names.CTA, 'intent', 'user_requested', '/', { placement: 'footer', target: 'other' });
});

test('catalogue reader callback retains its lesson, opener and motion origin without sending them', () => {
    const f = fixture('/docs'), lesson = { catalogueKey: privateText, persistedId: privateText, title: privateText, category: privateText },
        opener = { closest: () => ({ getBoundingClientRect: () => ({ left: 12, top: 34 }) }) };
    const h = handlers(f, 'components/workspace/TutorialCatalog.jsx', 'CatalogView', ['openReader', 'selected', 'opener', 'origin'], {
        end: '\n    return <div', preamble: false, props: { lessons: [lesson], initialLesson: privateText },
    });
    h.read(); assert.equal(h.read().selected, privateText); assert.equal(f.actions.length, 0, 'Linked lesson effect remains uninstrumented');
    h.read().openReader(lesson, { currentTarget: opener });
    observed(f, f.names.LESSON_OPEN, 'opened', 'user_requested', '/docs', { mode: 'reader' });
    assert.equal(h.read().selected, privateText); assert.equal(h.read().opener.current, opener); assert.deepEqual(plain(h.read().origin.current), { left: 12, top: 34 });
});

test('guided catalogue action observes opening, not saved learning completion, and preserves read-failure callbacks', async () => {
    const f = fixture('/app/tutorials'), learning = { read: async () => ({ ok: true, data: {} }), readStates: async () => ({ ok: true, data: { items: [] } }) };
    const h = handlers(f, 'components/workspace/TutorialCatalog.jsx', 'SignedInCatalog', ['openGuided', 'guided', 'refreshGrowth', 'refreshStates'], {
        preamble: false, end: '\n    return <div', props: { userId: f.user.id }, globals: { authoredLessons: [],
            createTutorialLearningClient: () => learning, observeMutation: () => assert.fail('No mutation on opening'),
            useRecords: () => ({ records: [], loading: false, degraded: false, refresh() {} }),
        },
    });
    h.read(); await tick(); assert.equal(f.actions.length, 0);
    const opener = {}; h.read().openGuided(privateText, opener); observed(f, f.names.LESSON_OPEN, 'opened', 'user_requested', '/app/tutorials', { mode: 'guided' });
    assert.equal(h.read().guided.tutorialId, privateText); assert.equal(h.read().guided.opener, opener); assert.equal(h.read().guided.client, learning);
    learning.readStates = async () => ({ ok: false, reason: 'wait', error: privateText }); await h.read().refreshStates();
    observed(f, 'section.failure', 'failure', 'rate_limited', '/app/tutorials', { source: 'tutorial_catalog', status_class: 'unknown' });
    h.unmount();
});

function roadmap(f) {
    const feeds = { '/roadmap-status.json': { state: 'MEASURED', milestones: [] }, '/capabilities.json': { state: 'MEASURED', capabilities: [], counts: {} }, '/activity-status.json': { entries: [] } };
    f.fetch = async (path) => ({ ok: true, status: 200, json: async () => feeds[path] });
    return handlers(f, 'pages/RoadmapPage.jsx', 'RoadmapPage', ['handleHover', 'activeDay', 'liveError', 'activityError'], { preamble: 'export function ActivityEvidence' });
}

test('roadmap hover is debounced and deduplicated, not the visible highlight or existing read failures', async () => {
    const f = fixture('/roadmap'), h = roadmap(f);
    h.read(); await tick(); assert.equal(f.actions.length, 0);
    h.read().handleHover(1); assert.equal(h.read().activeDay, 1); f.advance(200);
    h.read().handleHover(3); h.read(); f.advance(299); assert.equal(f.actions.length, 0);
    f.advance(1); observed(f, f.names.ROADMAP_HOVER, 'observed', 'user_requested', '/roadmap', { day: 3 });
    h.read().handleHover(3); f.advance(1000); assert.equal(f.actions.length, 1);
    h.read().handleHover(null); h.read().handleHover(3); f.advance(300); assert.equal(f.actions.length, 2);
    h.read().handleHover(2); f.advance(300); assert.equal(f.actions.length, 2, 'Only authored milestone days are observed');
    h.unmount();
    const failed = fixture('/roadmap'), page = roadmap(failed);
    failed.fetch = async () => ({ ok: false, status: 503 }); page.read(); await tick();
    assert.equal(failed.actions.length, 3); assert.equal(page.read().liveError, true); assert.equal(page.read().activityError, true);
    assert.ok(failed.actions.every(([name, data]) => name === 'section.failure' && data.source === 'roadmap_feed' && data.reason === 'server_error'));
});

for (const change of ['leave', 'route', 'unmount']) test(`roadmap ${change} cancels the pending hover only`, async () => {
    const f = fixture('/roadmap'), h = roadmap(f); h.read(); await tick(); h.read().handleHover(5);
    if (change === 'leave') h.read().handleHover(null); else if (change === 'unmount') h.unmount(); else f.window.location = new URL('https://fixture.invalid/docs');
    f.advance(300); assert.equal(f.actions.length, 0);
});

const jobs = () => ['succeeded', 'hold', 'dispatched', 'failed', 'queued', 'cancelled'].map((status, index) => ({ id: `synthetic-private-job-${index}`,
    workspace: 'synthetic-workspace', status, owner: privateText, worker: privateText, created: '2026-09-24T00:00:00Z', result: { description: privateText } }));
const replayData = () => ({ workspace: 'synthetic-workspace', items: jobs(), page: 1, has_more: false });
function replay(f, api, demo = false) {
    return handlers(f, 'pages/workspace/ExecutionReplayPage.jsx', 'Replay', ['data', 'error', 'detail', 'discarded', 'setReload', 'setPage', 'setSelected'], { end: '\n    return <div', props: { api, demo } });
}

test('execution replay counts the actual successfully loaded snapshot once, never selected details, IDs or independent outcomes', async () => {
    const f = fixture('/app/replay'); f.pb.send = async (_path, { query }) => { f.apiCalls.push(query); const data = replayData();
        return query.id ? { ...data, items: data.items.filter((row) => row.id === query.id) } : data; };
    const api = createBusinessClient({ client: f.pb, workspaceId: 'synthetic-workspace', accountId: f.user.id, isCurrent: () => true });
    const h = replay(f, api); h.read(); await tick();
    observed(f, f.names.REPLAY_SNAPSHOT, 'observed', 'recorded_snapshot', '/app/replay', { completed: 1, uncertain: 2, failed: 1 });
    h.read(); h.read(); assert.equal(f.actions.length, 1);
    h.read().setSelected(jobs()[0].id); h.read(); await tick(); assert.equal(f.actions.length, 1); assert.equal(h.read().detail.job.id, jobs()[0].id);
    h.read().setReload((value) => value + 1); h.read(); await tick(); assert.equal(f.actions.length, 2);
    assert.equal(f.apiCalls.length, 4); assert.doesNotMatch(JSON.stringify(f.actions), /verified|workspace.*synthetic|synthetic-private/);
});

for (const kind of ['list', 'detail']) for (const mode of ['result', 'throw']) test(`execution replay ${kind} ${mode} failure reports unavailable without invented status`, async () => {
    const f = fixture('/app/replay?action=synthetic-private-job'), good = { ok: true, data: replayData() };
    const api = { list: async () => good, read: async () => ({ ok: true, data: jobs()[0] }) };
    api[kind === 'list' ? 'list' : 'read'] = async () => { if (mode === 'throw') throw new Error(privateText); return { ok: false, reason: privateText, error: privateText }; };
    const h = replay(f, api); h.read(); await tick();
    const failures = f.actions.filter(([name]) => name === 'section.failure'); assert.equal(failures.length, 1);
    assert.deepEqual(failures[0][1], { section: '/app/replay', source: 'records', reason: 'unavailable', outcome: 'failure', status_class: 'unknown' });
    assert.ok(kind === 'list' ? h.read().error : h.read().detail.error);
    assert.doesNotMatch(JSON.stringify([f.actions, f.events]), /synthetic-private/);
});

test('execution replay does not label explicit client cancellation as a read failure', async () => {
    for (const failure of [{ isAbort: true, status: 0 }, { name: 'AbortError', status: 0 }]) {
        const f = fixture('/app/replay?action=synthetic-private-job'), reject = async () => { throw failure; };
        const h = replay(f, { list: reject, read: reject }); h.read(); await tick();
        assert.equal(f.actions.length, 0); assert.equal(f.events.length, 0);
    }
});

for (const change of ['stale', 'route', 'unmount', 'demo']) test(`execution replay ${change} fences both late read failures and late snapshot counts`, async () => {
    for (const ok of [true, false]) {
        const f = fixture('/app/replay?action=synthetic-private-job'), held = deferred(), api = { list: () => held.promise, read: () => held.promise }, h = replay(f, api);
        h.read();
        if (change === 'route') f.window.location = new URL('https://fixture.invalid/docs');
        if (change === 'unmount') h.unmount();
        if (change === 'demo') h.read({ api, demo: true });
        held.resolve({ ok, data: replayData(), error: privateText, ...(change === 'stale' ? { stale: true } : {}) }); await tick();
        assert.equal(f.attempts.length, 0);
    }
});

test('execution replay preserves empty snapshots but never fabricates zero counts for a malformed success', async () => {
    for (const items of [[], null]) {
        const f = fixture('/app/replay'), h = replay(f, { list: async () => ({ ok: true, data: { ...replayData(), items } }) });
        h.read(); await tick();
        if (items) observed(f, f.names.REPLAY_SNAPSHOT, 'observed', 'recorded_snapshot', '/app/replay', { completed: 0, uncertain: 0, failed: 0 });
        else observed(f, 'section.failure', 'failure', 'invalid_response', '/app/replay', { source: 'records', status_class: 'unknown' });
    }
});

test('discarded replay reads end their loading state without an outage and explicit refresh can recover', async () => {
    const f = fixture('/app/replay?action=synthetic-private-job');
    const api = { list: async () => ({ ok: false, stale: true }), read: async () => ({ ok: false, stale: true }) };
    const h = replay(f, api); h.read(); await tick();
    assert.equal(h.read().discarded, true);
    assert.equal(h.read().detail.discarded, true);
    assert.equal(h.read().data, null); assert.equal(h.read().detail.job, null);
    assert.equal(f.actions.length, 0);
    api.list = async () => ({ ok: true, data: replayData() });
    api.read = async () => ({ ok: true, data: jobs()[0] });
    h.read().setReload((value) => value + 1); h.read(); await tick();
    assert.equal(h.read().discarded, false); assert.equal(h.read().detail.discarded, false);
    observed(f, f.names.REPLAY_SNAPSHOT, 'observed', 'recorded_snapshot', '/app/replay', { completed: 1, uncertain: 2, failed: 1 });
    h.unmount();
});

for (const kind of ['list', 'detail']) test(`execution replay discards an older ${kind} response after explicit selection changes`, async () => {
    const f = fixture('/app/replay?action=synthetic-private-old'), held = deferred(); let first = true;
    const api = {
        list: async () => { if (kind === 'list' && first) { first = false; return held.promise; } return { ok: true, data: replayData() }; },
        read: async (id) => kind === 'detail' && id === 'synthetic-private-old' ? held.promise : { ok: true, data: { id } },
    };
    const h = replay(f, api); h.read();
    if (kind === 'list') h.read().setPage(2); else h.read().setSelected('synthetic-private-new');
    h.read(); await tick();
    held.resolve(kind === 'list' ? { ok: true, data: replayData() } : { ok: false, error: privateText }); await tick();
    assert.equal(f.actions.filter(([name]) => name === f.names.REPLAY_SNAPSHOT).length, 1);
    assert.equal(f.actions.filter(([name]) => name === 'section.failure').length, 0);
    if (kind === 'detail') assert.equal(h.read().detail.job.id, 'synthetic-private-new');
});

const operatorData = (page = 1) => ({ schema_version: 'buildanddo.operator-snapshot/v1', workspace: 'synthetic-workspace', role: 'owner', observed_at: new Date().toISOString(), page_size: 20,
    sources: Object.fromEntries(['missions', 'signals', 'evidence', 'workflow_runs', 'research', 'suite_runs', 'seat_events', 'integrations']
        .map((key) => [key, { state: 'available', items: [], page: key === 'integrations' ? 1 : page, has_more: false }])) });
function operator(f, globals = {}) {
    return handlers(f, 'pages/workspace/OperatorPage.jsx', 'OperatorDesk', ['refresh', 'snapshot', 'plan'], {
        preamble: 'function DeskLink', end: '\n    return <div', props: { accountId: f.user.id, workspaceId: 'synthetic-workspace', canWrite: true, checkingAccess: false },
        globals: { observeMutation: () => assert.fail('No mutation during reads'), ...globals },
    });
}

for (const kind of ['healthy', 'degraded', 'malformed', 'http', 'opaque']) test(`operator consumes ${kind} readFailure metadata only after guards`, async () => {
    const f = fixture('/app/operator'); f.pb.send = async () => {
        if (kind === 'http') throw { status: 403, message: privateText };
        if (kind === 'opaque') throw new Error(privateText);
        if (kind === 'malformed') return { workspace: privateText };
        const data = operatorData(); if (kind === 'degraded') data.sources.research.state = 'unavailable'; return data;
    };
    const h = operator(f); h.read(); await tick();
    if (kind === 'healthy') assert.equal(f.actions.length, 0);
    else observed(f, 'section.failure', kind === 'http' ? 'forbidden' : 'failure',
        kind === 'http' ? 'forbidden' : kind === 'opaque' ? 'unavailable' : kind === 'malformed' ? 'invalid_response' : 'degraded',
        '/app/operator', { source: 'operator', status_class: kind === 'http' ? '4xx' : kind === 'opaque' ? 'unknown' : '2xx' });
    assert.equal(Boolean(h.read().snapshot.data), kind === 'healthy' || kind === 'degraded'); h.unmount();
});

for (const change of ['superseded', 'account', 'route', 'unmount']) test(`operator ${change} suppresses a delayed native failure`, async () => {
    const f = fixture('/app/operator'), held = deferred(); f.pb.send = () => held.promise;
    const h = operator(f); h.read();
    if (change === 'superseded') { f.pb.send = async (_path, { query }) => operatorData(query.page); await h.read().refresh(2); }
    else if (change === 'account') f.pb.authStore.record = { id: 'other-account' };
    else if (change === 'route') f.window.location = new URL('https://fixture.invalid/docs');
    else h.unmount();
    held.reject({ status: 503, message: privateText }); await tick(); assert.equal(f.actions.length, 0); h.unmount();
});

test('operator fallback treats an unexpected client reason as unavailable with unknown status', async () => {
    const f = fixture('/app/operator'), h = operator(f, { createOperatorClient: () => ({ read: async () => ({ ok: false, reason: privateText, error: privateText }) }) });
    h.read(); await tick(); observed(f, 'section.failure', 'failure', 'unavailable', '/app/operator', { source: 'operator', status_class: 'unknown' }); h.unmount();
});

function passport(f) {
    const proof = source('components/workspace/PublicProof.jsx');
    const compareRoots = vm.runInNewContext(`${moduleCode(proof.slice(proof.indexOf('export function compareRoots'), proof.indexOf('\nconst OUTCOME')))}\ncompareRoots;`);
    f.epochs = { records: [{ id: privateText, display_id: privateText, root_digest: privateText, status: 'ANCHORED', capabilities: [] }], loading: false, error: '' };
    f.anchors = { records: [{ epoch: privateText, observed_public_root: privateText }], loading: false, error: '' };
    return handlers(f, 'pages/workspace/SpecialistDeskPage.jsx', 'SpecialistDeskPage', ['selectEpoch', 'verify', 'selectedId', 'showProof', 'selected'], {
        globals: { compareRoots, useRecords: (name) => name === 'evidence_epochs' ? f.epochs : f.anchors },
    });
}

test('passport waits for anchors too, retains existing actions in both sinks and removes dynamic epoch identity', () => {
    const f = fixture('/app/passport'), h = passport(f); f.anchors.loading = true;
    h.read(); assert.equal(f.actions.length, 0);
    f.anchors.loading = false; h.read(); observed(f, f.names.PASSPORT_VIEW, 'observed', 'recorded_snapshot', '/app/passport',
        { epoch_count: 1, anchored_count: 1, read_failed: false, read_state: 'available' });
    h.read(); h.replayEffects(); assert.equal(f.actions.length, 1);
    h.read().selectEpoch(f.epochs.records[0]); observed(f, f.names.PASSPORT_SELECT, 'selected', 'user_requested', '/app/passport', { epoch_status: 'ANCHORED' });
    assert.equal(h.read().selectedId, privateText); h.read().verify(); observed(f, f.names.PASSPORT_VERIFY, 'match', 'root_comparison', '/app/passport');
    assert.equal(h.read().showProof, true); assert.equal(h.read().selected.display_id, privateText);
    h.read().selectEpoch({ ...f.epochs.records[0], status: privateText });
    observed(f, f.names.PASSPORT_SELECT, 'selected', 'user_requested', '/app/passport');
});

for (const outcome of ['mismatch', 'not_anchored', 'unavailable']) test(`passport ${outcome} is a local comparison, not independent verification`, () => {
    const f = fixture('/app/passport'), h = passport(f);
    if (outcome === 'mismatch') f.anchors.records[0].observed_public_root = 'different-private-root';
    else if (outcome === 'not_anchored') f.anchors.records = [];
    else f.epochs.records[0].root_digest = '';
    h.read().verify(); observed(f, f.names.PASSPORT_VERIFY, outcome, 'root_comparison', '/app/passport');
    assert.doesNotMatch(JSON.stringify([f.actions, f.events]), /different-private-root|verified/);
});

for (const fail of ['epochs', 'anchors', 'both']) test(`passport ${fail} failure is not an empty passport or an absent anchor`, () => {
    const f = fixture('/app/passport'), h = passport(f);
    if (fail !== 'anchors') f.epochs.error = privateText;
    if (fail !== 'epochs') f.anchors.error = privateText;
    h.read(); observed(f, f.names.PASSPORT_VIEW, 'failure', 'unavailable', '/app/passport', { read_failed: true,
        read_state: fail === 'both' ? 'both_failed' : `${fail}_failed` });
    assert.deepEqual(f.actions[0][1], { section: '/app/passport', source: 'capability_passport', reason: 'unavailable', outcome: 'failure', status_class: 'unknown' });
    h.read().verify(); observed(f, f.names.PASSPORT_VERIFY, 'unavailable', 'root_comparison', '/app/passport');
    h.read(); h.replayEffects(); assert.equal(f.actions.filter(([name]) => name === 'section.failure').length, 1);
    f.epochs.error = ''; f.anchors.error = ''; h.read(); f.anchors.error = privateText; h.read();
    assert.equal(f.actions.filter(([name]) => name === 'section.failure').length, 2);
});

function rooms(f) {
    f.room = 'organization'; f.knowledge = { scope: privateText, data: null, error: '', refresh: () => {} };
    return handlers(f, 'pages/workspace/RoomsPage.jsx', 'RoomsPage', ['changeMode', 'changeSource', 'mode', 'source', 'published', 'setRefreshKey'], {
        end: '\n    return <div', globals: { ...icons, useParams: () => ({ room: f.room }), useWorkspaceKnowledge: () => f.knowledge },
    });
}
const roomData = (state = 'MEASURED', room = 'organization') => ({ projection: room, state, nodes: [{ id: privateText, type: 'capability', title: privateText }], edges: [] });
const roomResponse = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(data) });

test('Rooms mode/source callbacks emit only real fixed-enum changes, without fetching on workspace mode changes', () => {
    const f = fixture('/app/rooms/organization'), h = rooms(f); h.read(); assert.equal(f.actions.length, 0);
    h.read().changeMode('inspect'); h.read().changeMode(privateText); h.read().changeSource(privateText); assert.equal(f.actions.length, 0);
    for (const mode of ['operate', 'teach', 'replay', 'inspect']) {
        h.read().changeMode(mode); observed(f, f.names.ROOM_MODE, 'selected', 'user_requested', '/app/rooms/:room', { mode });
    }
    f.fetch = async () => roomResponse(roomData()); h.read().changeSource('published');
    observed(f, f.names.ROOM_SOURCE, 'selected', 'user_requested', '/app/rooms/:room', { projection_source: 'published' });
    h.read(); h.read().changeSource('published'); assert.equal(f.actions.length, 5);
    h.read().changeSource('workspace'); h.read(); assert.equal(f.actions.length, 6); h.unmount();
});

for (const state of ['MEASURED', 'OBSERVED', 'PARTIAL', 'UNMEASURED', privateText, undefined]) test(`published Rooms ${state === privateText ? 'unknown' : state} reports bounded source status, not graph contents`, async () => {
    const f = fixture('/app/rooms/organization'), h = rooms(f); f.fetch = async () => roomResponse({ ...roomData(), state });
    h.read().changeSource('published'); h.read(); await tick();
    const projection = f.actions.find(([name]) => name === f.names.ROOM_PROJECTION);
    assert.deepEqual(projection[1], { outcome: 'observed', reason: 'published_projection', section: '/app/rooms/:room',
        projection_state: state === privateText || state === undefined ? 'unknown' : state });
    assert.equal(f.actions.filter(([name]) => name === 'section.failure').length, ['PARTIAL', 'UNMEASURED'].includes(state) ? 1 : 0);
    assert.equal(h.read().published.value.nodes[0].id, privateText);
    assert.doesNotMatch(JSON.stringify([f.actions, f.events]), /synthetic-private/); h.unmount();
});

// 'json' is a body that looks like JSON and does not parse. 'html' is the SPA fallback the server
// answers for a projection that was never published: #109 reads that as absence, so it is reported
// as unavailable, not as a malformed response.
for (const mode of ['http', 'network', 'json', 'html', 'foreign', 'oversize', 'abort']) test(`published Rooms ${mode} failure preserves observed status and current UI`, async () => {
    const f = fixture('/app/rooms/organization'), h = rooms(f);
    f.fetch = async () => {
        if (mode === 'network' || mode === 'abort') throw Object.assign(new Error(privateText), { name: mode === 'abort' ? 'AbortError' : 'TypeError' });
        if (mode === 'http') return roomResponse({}, 503);
        if (mode === 'json' || mode === 'html' || mode === 'oversize')
            return { ok: true, status: 200, text: async () => mode === 'json' ? '{' + privateText : mode === 'html' ? '<html>' : 'x'.repeat(1000001) };
        return roomResponse(roomData('MEASURED', 'foreign'));
    };
    h.read().changeSource('published'); h.read(); await tick();
    assert.ok(h.read().published.error); assert.equal(h.read().published.value, null);
    if (mode === 'html') assert.equal(h.read().published.error, 'No estate projection is published for this room.');
    if (mode === 'json') assert.equal(h.read().published.error, 'The published projection for this room is not readable JSON.');
    const failures = f.actions.filter(([name]) => name === 'section.failure');
    if (mode === 'abort') assert.equal(failures.length, 0);
    else {
        assert.equal(failures.length, 1); const context = failures[0][1];
        assert.equal(context.source, 'room_projection');
        assert.equal(context.reason, mode === 'network' || mode === 'html' ? 'unavailable' : mode === 'http' ? 'server_error' : 'invalid_response');
        assert.equal(context.status_class, mode === 'network' ? 'unknown' : mode === 'http' ? '5xx' : '2xx');
    }
    assert.doesNotMatch(JSON.stringify([f.actions, f.events]), /synthetic-private/); h.unmount();
});

for (const change of ['source', 'room', 'route', 'unmount', 'retry']) test(`Rooms ${change} suppresses superseded projection observations`, async () => {
    const f = fixture('/app/rooms/organization'), h = rooms(f), held = deferred(); f.fetch = () => held.promise;
    h.read().changeSource('published'); h.read();
    if (change === 'source') { h.read().changeSource('workspace'); h.read(); }
    else if (change === 'room') { f.room = 'capability'; f.window.location = new URL('https://fixture.invalid/app/rooms/capability'); f.fetch = async () => roomResponse(roomData('MEASURED', 'capability')); h.read(); }
    else if (change === 'retry') { f.fetch = async () => roomResponse(roomData()); h.read().setRefreshKey((value) => value + 1); h.read(); }
    else if (change === 'route') f.window.location = new URL('https://fixture.invalid/docs');
    else h.unmount();
    held.reject(new Error(privateText)); await tick();
    assert.equal(f.actions.filter(([name]) => name === 'section.failure').length, 0);
    assert.equal(f.actions.filter(([name]) => name === f.names.ROOM_PROJECTION).length, ['room', 'retry'].includes(change) ? 1 : 0); h.unmount();
});

test('throwing telemetry SDKs cannot change navigation, filtering, profile lookup, replay, passport or projection state', async () => {
    const f = fixture('/docs'); f.failures.add('rum'); f.failures.add('analytics');
    const docs = handlers(f, 'pages/DocsPage.jsx', 'DocsPage', ['changeQuery', 'guides']);
    docs.read().changeQuery({ target: { value: 'repeatable' } }); docs.read(); f.advance(300); assert.equal(docs.read().guides.length, 1);
    const header = handlers(f, 'components/site/Header.jsx', 'Header', ['clickCta', 'setOpen', 'open'], { globals: { useRoomsLive: () => false } });
    header.read().setOpen(true); header.read().clickCta('/app', true); assert.equal(header.read().open, false);
    const pricing = handlers(f, 'pages/PricingPage.jsx', 'PricingPage', ['selectPlan']); assert.doesNotThrow(() => pricing.read().selectPlan('pilot'));
    const blog = handlers(f, 'pages/BlogPage.jsx', 'BlogPage', ['toggleArticle']); assert.doesNotThrow(() => blog.read().toggleArticle({ currentTarget: { open: true } }));
    const persona = handlers(f, 'pages/PersonaProfilePage.jsx', 'PersonaProfilePage', ['persona'], {
        preamble: 'function UnknownPersona', end: '\n    if (!persona)', globals: { useParams: () => ({ slug: 'forge' }) },
    });
    assert.equal(persona.read().persona.slug, 'forge');
    const p = passport(f); p.read(); p.read().selectEpoch(f.epochs.records[0]); p.read().verify(); assert.equal(p.read().showProof, true);
    const r = replay(f, { list: async () => ({ ok: true, data: replayData() }) }); r.read(); await tick(); assert.equal(r.read().data.items.length, 6);
    const room = rooms(f); f.fetch = async () => roomResponse(roomData()); room.read().changeSource('published'); room.read(); await tick(); assert.ok(room.read().published.value);
    const op = operator(f, { createOperatorClient: () => ({ read: async () => ({ ok: false, error: privateText }) }) }); op.read(); await tick(); assert.equal(op.read().snapshot.error, privateText);
    assert.equal(f.actions.length, 0); assert.equal(f.events.length, 0);
    assert.ok(f.attempts.length > 0); assert.equal(f.attempts.filter(([sink]) => sink === 'rum').length, f.attempts.filter(([sink]) => sink === 'analytics').length);
    assert.doesNotMatch(JSON.stringify(f.attempts), /synthetic-private|example\.invalid/); op.unmount();
});

test('step-16 handlers are attached to the existing controls without adding SDK pageviews', () => {
    for (const [path, binding] of [
        ['pages/DocsPage.jsx', /onChange=\{changeQuery\}/], ['pages/DocsPage.jsx', /onClick=\{\(\) => openGuide\('contents'\)\}/],
        ['pages/BlogPage.jsx', /onToggle=\{toggleArticle\}/], ['components/site/Header.jsx', /onClick=\{\(\) => clickNavigation\(page\.path, true\)\}/],
        ['components/site/Footer.jsx', /onClick=\{clickCta\}/], ['components/workspace/TutorialCatalog.jsx', /onClick=\{\(event\) => openReader\(tutorial, event\)\}/],
        ['components/workspace/TutorialCatalog.jsx', /onGuided=\{openGuided\}/], ['pages/RoadmapPage.jsx', /onHover=\{handleHover\}/],
        ['pages/workspace/SpecialistDeskPage.jsx', /onSelect=\{selectEpoch\}/], ['pages/workspace/RoomsPage.jsx', /onClick=\{\(\) => changeMode\(name\)\}/],
        ['pages/workspace/RoomsPage.jsx', /onChange=\{\(event\) => changeSource\(event\.target\.value\)\}/],
    ]) assert.match(source(path), binding);
    for (const plan of ['government', 'pilot', 'early_access', 'team']) assert.ok(source('pages/PricingPage.jsx').includes(`onClick={() => selectPlan('${plan}')}`));
    for (const path of ['pages/DocsPage.jsx', 'pages/PricingPage.jsx', 'pages/BlogPage.jsx', 'pages/PersonaProfilePage.jsx', 'components/site/Header.jsx',
        'components/site/Footer.jsx', 'components/workspace/TutorialCatalog.jsx', 'pages/RoadmapPage.jsx', 'pages/workspace/ExecutionReplayPage.jsx',
        'pages/workspace/SpecialistDeskPage.jsx', 'pages/workspace/OperatorPage.jsx', 'pages/workspace/RoomsPage.jsx']) {
        assert.doesNotMatch(source(path), /@datadog\/browser|from ['"]posthog|\$pageview|startView\(/);
    }
});
