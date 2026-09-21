// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/test/select-testable.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-TEST-001
// Seat:        C-ONE
// Depends:     apps/web/src/components/ui/select.jsx
// EnumType:    TestDouble
// EnumEdges:   WRAPS apps/web/src/components/ui/select.jsx
// Intent:      Render the real Select under test with the one positioning strategy jsdom can
//              actually complete, because the other one never terminates there.
// ───────────────────────────────────────────────────────────────

/**
 * THE REAL COMPONENT, WITH ONE DEFAULT CHANGED.
 *
 * `SelectContent` defaults to `position="popper"`, which under jsdom never settles: Radix Popper
 * drives placement through @floating-ui/react-dom, whose result is resolved from a promise and
 * written back to state. Without a layout engine that cycle re-enters through MICROTASKS, so it
 * starves the timer queue while scheduling nothing of its own.
 *
 * MEASURED on rig1, 2026-09-20, with the loop instrumented for one second of wall clock:
 *
 *     popper         waited 33721ms   raf 0   setTimeout 3   getComputedStyle 48 (43ms)
 *     item-aligned   waited  1004ms   raf 2   setTimeout 3   getComputedStyle 10 (10ms)
 *
 * Zero rAF and three timers across 33 seconds rules out an animation or polling loop; 43ms of
 * layout reads rules out slow measurement. Ruled out by direct experiment, each with a control:
 * React `act` (a bare `setTimeout(50)` took 32.5s with the act environment OFF), reduced motion,
 * non-zero bounding rects, a no-op vs a firing ResizeObserver (firing made it WORSE, 103s), and
 * mocking `autoUpdate` and then `useFloating` on both @floating-ui/dom and @floating-ui/react-dom
 * — including with those packages inlined via `server.deps.inline`. None bound; the loop is below
 * the level a module mock can reach.
 *
 * So the strategy is pinned instead of the library patched. This is NOT a stub: every Radix
 * behaviour a test asserts — open/close, roles, keyboard, selection, focus — is the real thing.
 * The only difference is which of two shipped positioning strategies is used, and pixel placement
 * is precisely what a DOM without layout cannot verify either way.
 *
 * Wired in apps/web/vitest.config.js, which aliases `@/components/ui/select` here. The import
 * below is RELATIVE on purpose: an aliased specifier would resolve back to this file.
 */
import React from 'react';

import * as Real from '../components/ui/select';

export const SelectContent = React.forwardRef(function TestableSelectContent(props, ref) {
    return <Real.SelectContent ref={ref} {...props} position={props.position ?? 'item-aligned'} />;
});
SelectContent.displayName = 'SelectContent';

export const {
    Select,
    SelectGroup,
    SelectValue,
    SelectTrigger,
    SelectLabel,
    SelectItem,
    SelectSeparator,
    SelectScrollUpButton,
    SelectScrollDownButton,
} = Real;
