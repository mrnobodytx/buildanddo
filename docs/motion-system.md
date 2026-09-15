# ─── CGRF Header ───────────────────────────────────────────────
# File:        docs/motion-system.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-15
# Depends:     apps/web/src/lib/motion/catalog.js, apps/web/src/lib/motion/preferences.js, apps/web/src/components/motion/MotionSettings.jsx, tests/upgrade/motion-system.test.mjs
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON apps/web/src/lib/motion/catalog.js; DEPENDS_ON apps/web/src/lib/motion/preferences.js; DEPENDS_ON apps/web/src/components/motion/MotionSettings.jsx; DEPENDS_ON tests/upgrade/motion-system.test.mjs
# DAG Node:    none
# Intent:      Describe the animation controls, actual usage and acceptance needed to review the complete motion system.
# ───────────────────────────────────────────────────────────────

# BuildAndDo motion system

The site uses a shared editorial motion system across public pages, authentication
and workspace controls. Settings has separate Appearance, Motion & interaction,
Workspace and Account tabs. Public visitors can open the same motion controls from
the header without signing in.

## Personal controls

- **Presets:** Editorial starts with restrained interface, reading and data motion.
  Expressive enables the optional categories as well. Reduced and Off keep state
  changes immediate. Device reduced motion takes precedence over Full/Expressive.
- **Pace and movement:** Quick, Standard and Relaxed adjust shared timings; Subtle
  and Expressive adjust travel. Large pointer/depth effects stay disabled on narrow
  screens, coarse pointers and Data Saver.
- **Groups:** Interface; Work & data; Reading & learning; Public storytelling;
  Appearance & media; Optional effects. Fourteen individual categories have an
  explanation and show when a chosen effect is limited by the effective policy.
- **Pause automatic effects:** Stop automatic walkthrough/replay, ambient,
  pointer and spatial motion while retaining useful controls and visible status.
  Each teaching sequence also has Play, Pause, Restart and manual step buttons.
- **Previews and usage:** Open one of seven preview collections at a time. Search
  all 50 areas or filter by category; each entry describes its real use and links
  to a related preview where appropriate. Engineering guarantees are reference
  entries rather than user-disableable safeguards.

Preferences use the versioned `buildanddo.motion.v1` localStorage key and sync
between tabs. They are personal device preferences, not workspace configuration
or role permissions. Unknown versions/keys and malformed data fall back to bounded
defaults. Storage failure retains the current visit's preference and displays its
limited lifetime. Reset restores Editorial defaults. If no new preference exists,
the earlier `buildanddo.mission-effects` choice seeds the learning category;
the mission-page checkbox now edits the same shared setting.

The root provider uses React, CSS and browser animation APIs. The interactive
preview collection is loaded only when opened; its existing React motion and
Three.js code stay outside the shared provider. No dependency was added.

## Implementation and data boundaries

CSS tokens cover control, panel, route, layout, reveal and milestone timings.
CSS category rules also cover portals, switches, progress, skeletons, toasts and
existing styles. Existing React hero/diagram animations read the same effective
policy. The optional platform mesh has its own renderer cleanup and static fallback.

MotionEntrance and MotionReveal leave HTML readable before an effect runs, and
work without Web Animations or IntersectionObserver. MotionList measures only
current keyed child geometry, retains no copied content and immediately removes
records that are no longer rendered. Card/detail continuity uses numeric geometry,
not document snapshots. Account/workspace keys and server access checks remain
authoritative; no exit animation keeps private data visible after removal.

CountUp exposes the exact final value to assistive technology while its visual
number changes. Progress bars retain exact current values. Status effects consume
existing saved mission, workflow, tutorial, moderation and administration results.
Integration request, pending application and dated observations remain different
states. No animation dispatches an operation, awards a credential or supplies a
health receipt.

Automatic timers and the 3D render loop stop when paused, hidden or outside the
viewport. Frame loops are cancellable and finite effects clean up on interruption.
Reading and shallow parallax use passive event listeners with at most one pending
frame. Pointer decoration leaves the native cursor available. No scroll hijacking,
page snapshots, mandatory WebGL or artificial loading percentage is introduced.

The planning, chart, integration-state, success/error and image examples are
explicitly local demonstrations. Their controls do not write business records.
Media previews accept bounded local files and revoke object URLs on replacement
or unmount. They do not upload files. Native media controls manage playback and
sound; transcript and caption input remain local. Examples never autoplay media.

## Where the 50 areas are used

The table is generated from the same catalogue displayed in Settings. A related
preview is supplementary; source integration and runtime acceptance remain distinct.

| Area | Category | Use | Related preview |
|---|---|---|---|
| 1. Motion language | controls | One editorial vocabulary across public pages, auth and the workspace. | Built-in behavior |
| 2. Timing tokens | controls | Pace changes shared control, panel, route and reveal timings. | Built-in behavior |
| 3. Easing & physics | layout | Settling curves and damped springs in rearrangement and draggable examples. | planning |
| 4. Choreography | editorial | Public headings, descriptions, newspaper rules and bounded list staggering. | story |
| 5. Interruption | navigation | New input cancels old transitions; removed private records disappear immediately. | Built-in behavior |
| 6. Button feedback | controls | Shared buttons respond to focus, hover and press without changing their hit area. | interface |
| 7. Selection controls | controls | Checkboxes, switches, sliders and segmented choices reflect their actual selected value. | interface |
| 8. Hover & focus | controls | Links, cards and input rings support keyboard, touch and pointer interaction. | interface |
| 9. Navigation | navigation | Header, workspace sidebar, drawers, menus and active navigation markers. | interface |
| 10. Page entrances | navigation | Public, authentication and workspace content enters without delaying navigation. | interface |
| 11. Card-to-detail continuity | layout | Tutorial titles travel from the selected card into its reader using geometry only. | gallery |
| 12. Layout changes | layout | Filtered tutorials and keyed ERP/community lists retain visual context. | planning |
| 13. Tabs & disclosures | navigation | Tabbed panels, accordions and details transition as their contents change. | interface |
| 14. Dialogs & popovers | navigation | Shared overlays preserve Escape, focus return and pending-request recovery. | interface |
| 15. Form guidance | controls | Field focus and validation feedback keep errors and drafts readable. | interface |
| 16. Loading states | feedback | Spinners and skeletons share controls; text still identifies pending work when motion is off. | interface |
| 17. Saving & synchronization | feedback | Saved, pending and uncertain-response notices follow existing persistence results. | interface |
| 18. Error & recovery | feedback | Visible error/retry feedback preserves entered work and original requests. | interface |
| 19. Notifications | feedback | Toasts and status notices enter without taking focus. | interface |
| 20. Scroll entrances | editorial | Public sections reveal once when seen; readable HTML is the fallback. | story |
| 21. Scroll storytelling | editorial | The public explanation combines sticky chapter layout and a controllable diagram. | story |
| 22. Reading orientation | reading | Public pages, wiki articles and tutorial dialogs show measured reading position. | story |
| 23. Parallax & depth | pointer | Shallow illustration depth follows pointer or viewport position when enabled. | story |
| 24. Typography | editorial | Editorial heading reveals and numeric changes preserve complete semantic text. | story |
| 25. Images & galleries | media | The image lab supports comparison, thumbnail/detail continuity and local image previews. | gallery |
| 26. SVG & icons | data | Step connectors, selected paths, progress rings and stateful icons trace real selections. | story |
| 27. Charts & numbers | data | Count-up visuals and measured progress expose the final value to assistive technology. | data |
| 28. Relationship diagrams | data | The platform mesh and walkthrough highlight selected connections; examples are labeled. | story |
| 29. Tables & live lists | layout | Reordered and new rows animate by stable ID without retaining removed records. | planning |
| 30. Drag, drop & gestures | layout | The local planning example offers dragging, move buttons and keyboard alternatives. | planning |
| 31. Onboarding | learning | Setup-step entrances and a replayable guided walkthrough preserve skip and back controls. | story |
| 32. Teaching sequences | learning | Lessons offer controllable examples with pause, restart and readable explanations. | story |
| 33. Mission & workflow stages | data | Recorded state, approvals and evidence changes receive emphasis without advancing work. | data |
| 34. ERP & planning | layout | Task, objective and contact filters animate retained records; plans remain server-owned. | planning |
| 35. Wiki & forums | community | Draft previews, replies, publication and moderation feedback follow persisted outcomes. | interface |
| 36. Administration | community | Confirmed role/settings changes and audit rows update without delaying access removal. | interface |
| 37. Integration lifecycle | community | Requested, pending and dated observed states remain distinct while their displays change. | data |
| 38. Themes | theme | Light/dark surface and icon changes use short transitions after initial rendering. | interface |
| 39. Media interaction | media | Local video preview retains native playback, captions support and a readable transcript. | media |
| 40. Milestones | learning | Saved lesson/mission achievements receive a bounded check/stamp; practice feedback is labeled. | data |
| 41. Ambient backgrounds | ambient | Optional slow texture, illustrative sequences and particle effects stop offscreen. | story |
| 42. Pointer effects | pointer | Illustration spotlight, tilt and proximity feedback keep the native pointer and stable targets. | gallery |
| 43. 3D & spatial effects | spatial | The existing Three.js platform mesh has optional rendering and a static fallback. | spatial |
| 44. Brand motion | editorial | Newspaper-rule reveals and evidence-style confirmation stamps unify the site. | story |
| 45. Responsive motion | controls | Shorter travel on compact/coarse devices; optional costly effects stay limited. | Built-in behavior |
| 46. Accessibility | controls | OS reduced motion wins; pause, static states, focus and text remain available. | Built-in behavior |
| 47. Performance | ambient | Visibility-gated loops, cancellable effects and event-driven measurements limit work. | Built-in behavior |
| 48. Progressive enhancement | navigation | No observer, animation API or WebGL is required to read or use the app. | Built-in behavior |
| 49. Implementation choices | spatial | CSS, browser animation APIs, existing React motion and the existing Three.js mesh are reused. | Built-in behavior |
| 50. Testing & reference | controls | Preference, interruption and visibility cases accompany the usage and acceptance reference. | Built-in behavior |

## Verification

Run the dependency-free behavioral regression and coverage gate:

```bash
node --test --experimental-test-coverage \
  --test-coverage-include='apps/web/src/lib/motion/*.js' \
  tests/upgrade/*.test.mjs
```

Observed for this continuation: **163 Node tests pass**, including 19 motion
policy/lifecycle/catalogue cases. Selected motion library coverage is **100%
lines, branches and functions**. This measures the policy and injected browser
lifecycle contracts, not rendered React or graphics performance. All 18 Python
regressions also pass.

Real React interaction suites cover Settings organization, presets, device
reduction, cross-tab updates, storage failure, usage search, keyboard dialogs,
local previews, exact progress, media cleanup, interrupted effects, private list
removal, finite walkthroughs and reading fallbacks. Run:

```bash
npm --prefix apps/web test -- \
  src/components/motion/__tests__/MotionSettings.test.jsx \
  src/components/motion/__tests__/MotionRuntime.test.jsx \
  src/pages/workspace/__tests__/MissionsPage.test.jsx
npm --prefix apps/web run test:coverage
npm --prefix apps/web run lint
npm --prefix apps/web run build
```

These frontend gates are **not verified** here: Vitest is unavailable, lint
cannot load eslint-plugin-import, and Vite cannot start. No package installation,
fabricated lock entries or weakened gate substitutes for those checks. New motion
source keeps the existing 80% frontend coverage target. The limited source checker
is an additional diagnostic, not a replacement for these gates.

### Browser acceptance on an enabled runner

1. At 320, 375 and 1280 pixels in both themes, visit public pages, login/setup and
   every workspace section. Check reading width, sidebar, Settings tabs, dialogs,
   portal positioning, keyboard traversal, Escape, focus return and back navigation.
2. Change OS reduced motion while an effect runs. Repeat with Full/Expressive,
   category changes and Off. Content stays visible; no progress or permissions
   change; controls remain operable. Repeat with coarse pointer and Data Saver.
3. Interrupt navigation, list sorting, filtering, playback and dialogs rapidly.
   Remove access or switch account/workspace during pending work. Confirm private
   text disappears immediately and the existing request/retry contract still holds.
4. Scroll a running diagram or mesh offscreen; hide the tab; pause effects.
   Inspect that no render-loop frames remain scheduled. Reenter and resume,
   including missing WebGL, lost graphics context and missing observer fallbacks.
5. Walk through a tutorial, check an answer, save progress and reload. Inspect
   card/detail continuity, real saved milestones and stable final accessible values.
   Exercise mission review, workflow evidence, ERP filters, wiki/forums and
   administration with real existing fixtures; no preview is evidence of backend
   correctness.
6. Use each preview by keyboard and touch. Verify move-button alternatives,
   local image/video limits, captions/transcript, no autoplay and released object
   URLs after switching previews or closing Settings.
7. Capture a production performance trace. Check input responsiveness, long
   animation frames, layout/paint and offscreen work on a representative mobile
   device. Confirm the motion preview and 3D chunks load only when requested.

No screenshot, browser performance measurement, native PocketBase acceptance or
served-release verification is claimed from the source tests.

## Rollback

Revert this frontend motion continuation to remove the provider, imports and
effects together. The preference key contains no business data and can be
ignored by the prior frontend; no backend migration or record deletion is needed.
Keep the earlier workspace access and administration changes intact. Existing
private delivery and native acceptance requirements continue to apply.
