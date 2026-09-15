// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/motion/catalog.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/lib/motion/preferences.js
// EnumType:    ConfigDoc
// EnumEdges:   DEPENDS_ON apps/web/src/lib/motion/preferences.js
// DAG Node:    none
// Intent:      Make every requested motion area discoverable with its usage and an honest preview boundary.
// ───────────────────────────────────────────────────────────────

/** Enumerate each requested motion area and its actual use or optional demonstration. */
export const MOTION_CATALOG = Object.freeze([
    {
        "id": 1,
        "title": "Motion language",
        "category": "controls",
        "usage": "One editorial vocabulary across public pages, auth and the workspace.",
        "preview": "system"
    },
    {
        "id": 2,
        "title": "Timing tokens",
        "category": "controls",
        "usage": "Pace changes shared control, panel, route and reveal timings.",
        "preview": "system"
    },
    {
        "id": 3,
        "title": "Easing & physics",
        "category": "layout",
        "usage": "Settling curves and damped springs in rearrangement and draggable examples.",
        "preview": "planning"
    },
    {
        "id": 4,
        "title": "Choreography",
        "category": "editorial",
        "usage": "Public headings, descriptions, newspaper rules and bounded list staggering.",
        "preview": "story"
    },
    {
        "id": 5,
        "title": "Interruption",
        "category": "navigation",
        "usage": "New input cancels old transitions; removed private records disappear immediately.",
        "preview": "system"
    },
    {
        "id": 6,
        "title": "Button feedback",
        "category": "controls",
        "usage": "Shared buttons respond to focus, hover and press without changing their hit area.",
        "preview": "interface"
    },
    {
        "id": 7,
        "title": "Selection controls",
        "category": "controls",
        "usage": "Checkboxes, switches, sliders and segmented choices reflect their actual selected value.",
        "preview": "interface"
    },
    {
        "id": 8,
        "title": "Hover & focus",
        "category": "controls",
        "usage": "Links, cards and input rings support keyboard, touch and pointer interaction.",
        "preview": "interface"
    },
    {
        "id": 9,
        "title": "Navigation",
        "category": "navigation",
        "usage": "Header, workspace sidebar, drawers, menus and active navigation markers.",
        "preview": "interface"
    },
    {
        "id": 10,
        "title": "Page entrances",
        "category": "navigation",
        "usage": "Public, authentication and workspace content enters without delaying navigation.",
        "preview": "interface"
    },
    {
        "id": 11,
        "title": "Card-to-detail continuity",
        "category": "layout",
        "usage": "Tutorial titles travel from the selected card into its reader using geometry only.",
        "preview": "gallery"
    },
    {
        "id": 12,
        "title": "Layout changes",
        "category": "layout",
        "usage": "Filtered tutorials and keyed ERP/community lists retain visual context.",
        "preview": "planning"
    },
    {
        "id": 13,
        "title": "Tabs & disclosures",
        "category": "navigation",
        "usage": "Tabbed panels, accordions and details transition as their contents change.",
        "preview": "interface"
    },
    {
        "id": 14,
        "title": "Dialogs & popovers",
        "category": "navigation",
        "usage": "Shared overlays preserve Escape, focus return and pending-request recovery.",
        "preview": "interface"
    },
    {
        "id": 15,
        "title": "Form guidance",
        "category": "controls",
        "usage": "Field focus and validation feedback keep errors and drafts readable.",
        "preview": "interface"
    },
    {
        "id": 16,
        "title": "Loading states",
        "category": "feedback",
        "usage": "Spinners and skeletons share controls; text still identifies pending work when motion is off.",
        "preview": "interface"
    },
    {
        "id": 17,
        "title": "Saving & synchronization",
        "category": "feedback",
        "usage": "Saved, pending and uncertain-response notices follow existing persistence results.",
        "preview": "interface"
    },
    {
        "id": 18,
        "title": "Error & recovery",
        "category": "feedback",
        "usage": "Visible error/retry feedback preserves entered work and original requests.",
        "preview": "interface"
    },
    {
        "id": 19,
        "title": "Notifications",
        "category": "feedback",
        "usage": "Toasts and status notices enter without taking focus.",
        "preview": "interface"
    },
    {
        "id": 20,
        "title": "Scroll entrances",
        "category": "editorial",
        "usage": "Public sections reveal once when seen; readable HTML is the fallback.",
        "preview": "story"
    },
    {
        "id": 21,
        "title": "Scroll storytelling",
        "category": "editorial",
        "usage": "The public explanation combines sticky chapter layout and a controllable diagram.",
        "preview": "story"
    },
    {
        "id": 22,
        "title": "Reading orientation",
        "category": "reading",
        "usage": "Public pages, wiki articles and tutorial dialogs show measured reading position.",
        "preview": "story"
    },
    {
        "id": 23,
        "title": "Parallax & depth",
        "category": "pointer",
        "usage": "Shallow illustration depth follows pointer or viewport position when enabled.",
        "preview": "story"
    },
    {
        "id": 24,
        "title": "Typography",
        "category": "editorial",
        "usage": "Editorial heading reveals and numeric changes preserve complete semantic text.",
        "preview": "story"
    },
    {
        "id": 25,
        "title": "Images & galleries",
        "category": "media",
        "usage": "The image lab supports comparison, thumbnail/detail continuity and local image previews.",
        "preview": "gallery"
    },
    {
        "id": 26,
        "title": "SVG & icons",
        "category": "data",
        "usage": "Step connectors, selected paths, progress rings and stateful icons trace real selections.",
        "preview": "story"
    },
    {
        "id": 27,
        "title": "Charts & numbers",
        "category": "data",
        "usage": "Count-up visuals and measured progress expose the final value to assistive technology.",
        "preview": "data"
    },
    {
        "id": 28,
        "title": "Relationship diagrams",
        "category": "data",
        "usage": "The platform mesh and walkthrough highlight selected connections; examples are labeled.",
        "preview": "story"
    },
    {
        "id": 29,
        "title": "Tables & live lists",
        "category": "layout",
        "usage": "Reordered and new rows animate by stable ID without retaining removed records.",
        "preview": "planning"
    },
    {
        "id": 30,
        "title": "Drag, drop & gestures",
        "category": "layout",
        "usage": "The local planning example offers dragging, move buttons and keyboard alternatives.",
        "preview": "planning"
    },
    {
        "id": 31,
        "title": "Onboarding",
        "category": "learning",
        "usage": "Setup-step entrances and a replayable guided walkthrough preserve skip and back controls.",
        "preview": "story"
    },
    {
        "id": 32,
        "title": "Teaching sequences",
        "category": "learning",
        "usage": "Lessons offer controllable examples with pause, restart and readable explanations.",
        "preview": "story"
    },
    {
        "id": 33,
        "title": "Mission & workflow stages",
        "category": "data",
        "usage": "Recorded state, approvals and evidence changes receive emphasis without advancing work.",
        "preview": "data"
    },
    {
        "id": 34,
        "title": "ERP & planning",
        "category": "layout",
        "usage": "Task, objective and contact filters animate retained records; plans remain server-owned.",
        "preview": "planning"
    },
    {
        "id": 35,
        "title": "Wiki & forums",
        "category": "community",
        "usage": "Draft previews, replies, publication and moderation feedback follow persisted outcomes.",
        "preview": "interface"
    },
    {
        "id": 36,
        "title": "Administration",
        "category": "community",
        "usage": "Confirmed role/settings changes and audit rows update without delaying access removal.",
        "preview": "interface"
    },
    {
        "id": 37,
        "title": "Integration lifecycle",
        "category": "community",
        "usage": "Requested, pending and dated observed states remain distinct while their displays change.",
        "preview": "data"
    },
    {
        "id": 38,
        "title": "Themes",
        "category": "theme",
        "usage": "Light/dark surface and icon changes use short transitions after initial rendering.",
        "preview": "interface"
    },
    {
        "id": 39,
        "title": "Media interaction",
        "category": "media",
        "usage": "Local video preview retains native playback, captions support and a readable transcript.",
        "preview": "media"
    },
    {
        "id": 40,
        "title": "Milestones",
        "category": "learning",
        "usage": "Saved lesson/mission achievements receive a bounded check/stamp; practice feedback is labeled.",
        "preview": "data"
    },
    {
        "id": 41,
        "title": "Ambient backgrounds",
        "category": "ambient",
        "usage": "Optional slow texture, illustrative sequences and particle effects stop offscreen.",
        "preview": "story"
    },
    {
        "id": 42,
        "title": "Pointer effects",
        "category": "pointer",
        "usage": "Illustration spotlight, tilt and proximity feedback keep the native pointer and stable targets.",
        "preview": "gallery"
    },
    {
        "id": 43,
        "title": "3D & spatial effects",
        "category": "spatial",
        "usage": "The existing Three.js platform mesh has optional rendering and a static fallback.",
        "preview": "spatial"
    },
    {
        "id": 44,
        "title": "Brand motion",
        "category": "editorial",
        "usage": "Newspaper-rule reveals and evidence-style confirmation stamps unify the site.",
        "preview": "story"
    },
    {
        "id": 45,
        "title": "Responsive motion",
        "category": "controls",
        "usage": "Shorter travel on compact/coarse devices; optional costly effects stay limited.",
        "preview": "system"
    },
    {
        "id": 46,
        "title": "Accessibility",
        "category": "controls",
        "usage": "OS reduced motion wins; pause, static states, focus and text remain available.",
        "preview": "system"
    },
    {
        "id": 47,
        "title": "Performance",
        "category": "ambient",
        "usage": "Visibility-gated loops, cancellable effects and event-driven measurements limit work.",
        "preview": "system"
    },
    {
        "id": 48,
        "title": "Progressive enhancement",
        "category": "navigation",
        "usage": "No observer, animation API or WebGL is required to read or use the app.",
        "preview": "system"
    },
    {
        "id": 49,
        "title": "Implementation choices",
        "category": "spatial",
        "usage": "CSS, browser animation APIs, existing React motion and the existing Three.js mesh are reused.",
        "preview": "system"
    },
    {
        "id": 50,
        "title": "Testing & reference",
        "category": "controls",
        "usage": "Preference, interruption and visibility cases accompany the usage and acceptance reference.",
        "preview": "system"
    }
]);

export const MOTION_PREVIEWS = Object.freeze([
    { id: 'interface', label: 'Interface & feedback' },
    { id: 'story', label: 'Reading & storytelling' },
    { id: 'planning', label: 'Planning & gestures' },
    { id: 'data', label: 'Data & milestones' },
    { id: 'gallery', label: 'Images & depth' },
    { id: 'media', label: 'Media & transcripts' },
    { id: 'spatial', label: '3D & spatial' },
]);
