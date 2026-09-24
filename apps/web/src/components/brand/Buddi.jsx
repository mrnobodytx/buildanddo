// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/brand/Buddi.jsx
// Stage:       06_IMPLEMENT
// SRS:         SRS-BUILDANDDO-BUDDI-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     design/brand/Buddi.dc.html
// EnumType:    Component
// EnumEdges:   IMPLEMENTS design/brand/Buddi.dc.html
// Intent:      Buddi, the BuildAndDo mascot, as one component with five poses, so the brand the
//              canvas defines actually appears in the product instead of only being drawn.
// ───────────────────────────────────────────────────────────────

/**
 * Buddi: the BuildAndDo block awake. Ported from design/brand/Buddi.dc.html.
 *
 * WHERE EACH POSE BELONGS, from the mascot sheet - these are not interchangeable:
 *   calm      the default; beside the assistant, in help text, on the dark stage
 *   hello     welcomes, sign-up, the first lesson
 *   think     measuring, loading, waiting on evidence - NEVER a success state
 *   verified  only after a real check has passed
 *   build     empty states that invite work
 *
 * The rule the sheet puts on its don't list is the platform's own: Buddi must not say a thing is
 * done before it has been measured. `verified` is therefore reserved for a server-confirmed check,
 * and `think` covers everything still being measured.
 *
 * COLOUR. The cap red, ochre side, paper front and verified green are BRAND constants, not theme
 * tokens: the block looks the same on paper and on ink, exactly as the brand sheet draws it. Only
 * the outline follows the surface, through `currentColor`, which is what the canvas's `dark` prop
 * switched by hand. The face stays ink because it sits on the paper front in both themes.
 */
const INK = 'hsl(220, 16%, 12%)';
const PAPER_FRONT = 'hsl(40, 18%, 97%)';
const CAP = 'hsl(0, 70%, 40%)';
const SIDE = 'hsl(38, 60%, 64%)';
const PLANK = 'hsl(38, 58%, 40%)';
const GREEN = 'hsl(128, 26%, 34%)';
const PAPER = 'hsl(42, 30%, 95%)';

const POSES = ['calm', 'hello', 'think', 'verified', 'build'];

const MOUTHS = {
    calm: 'M88 158 Q101 168 114 158',
    hello: 'M86 154 Q101 170 116 154',
    think: 'M91 162 L111 162',
    verified: 'M84 152 Q101 178 118 152 Z',
    build: 'M90 160 Q101 166 112 160',
};

const NAMES = {
    calm: 'calm',
    hello: 'waving hello',
    think: 'thinking',
    verified: 'holding a verified check',
    build: 'building',
};

const show = (on) => (on ? 'inline' : 'none');

/**
 * `decorative` hides the mascot from assistive technology. Use it wherever visible text already
 * names the thing - a button reading "Buddi", the assistant panel's own heading. Without it the
 * SVG's label joins the control's accessible name, so a button called "Buddi" announces itself as
 * "Buddi, the BuildAndDo mascot, calm Buddi" and stops matching the name a reader is given. Found
 * by the assistant's own tests, which is what they are for.
 *
 * @param {{pose?: 'calm'|'hello'|'think'|'verified'|'build', size?: number, ground?: boolean,
 *          className?: string, title?: string, decorative?: boolean}} props
 */
export default function Buddi({
    pose = 'calm', size = 120, ground = false, className = '', title, decorative = false,
}) {
    const use = POSES.includes(pose) ? pose : 'calm';
    const up = use === 'think';
    const eyeLx = up ? 84 : 81;
    const eyeRx = up ? 124 : 121;
    const eyeY = up ? 120 : 126;
    const label = title || `Buddi, the BuildAndDo mascot, ${NAMES[use]}`;

    return (
        <svg
            viewBox="0 0 220 240"
            width={size}
            height={Math.round((size * 240) / 220)}
            {...(decorative ? { 'aria-hidden': 'true' } : { role: 'img', 'aria-label': label })}
            focusable="false"
            className={className}
        >
            <g stroke="currentColor" fill="none" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round">
                {ground && (
                    <line x1="26" y1="226" x2="194" y2="226" stroke="hsl(var(--border))" strokeWidth="2" />
                )}
                <rect x="70" y="196" width="14" height="28" fill="currentColor" />
                <rect x="116" y="196" width="14" height="28" fill="currentColor" />

                <g display={show(use !== 'think' && use !== 'build')}>
                    <path d="M44 136 L24 170" />
                    <circle cx="22" cy="174" r="7" fill="currentColor" />
                </g>
                <g display={show(use === 'calm' || use === 'think')}>
                    <path d="M176 128 L194 164" />
                    <circle cx="196" cy="168" r="7" fill="currentColor" />
                </g>
                <g display={show(use === 'hello')}>
                    <path d="M176 122 Q198 108 196 82" />
                    <circle cx="196" cy="76" r="7" fill="currentColor" />
                    <path d="M207 64 L214 56" strokeWidth="3" />
                    <path d="M209 80 L217 79" strokeWidth="3" />
                </g>
                <path display={show(use === 'think')} d="M44 150 Q24 186 56 184" />
                <path display={show(use === 'verified')} d="M176 120 L192 98" />
                <g display={show(use === 'build')}>
                    <path d="M44 112 L54 54" />
                    <path d="M176 102 L166 54" />
                </g>

                <polygon points="160,80 178,62 178,182 160,200" fill={SIDE} />
                <polygon points="40,80 58,62 178,62 160,80" fill={CAP} />
                <rect x="40" y="80" width="120" height="120" fill={PAPER_FRONT} />

                {/* The ruler down the front: Buddi measures before it celebrates. */}
                <g stroke={INK} strokeWidth="3" strokeLinecap="butt">
                    <line x1="40" y1="100" x2="52" y2="100" />
                    <line x1="40" y1="120" x2="47" y2="120" />
                    <line x1="40" y1="140" x2="52" y2="140" />
                    <line x1="40" y1="160" x2="47" y2="160" />
                    <line x1="40" y1="180" x2="52" y2="180" />
                </g>

                <circle cx="68" cy="148" r="6" fill={CAP} stroke="none" opacity="0.3" />
                <circle cx="134" cy="148" r="6" fill={CAP} stroke="none" opacity="0.3" />

                <g display={show(use !== 'verified')} stroke="none">
                    <circle cx={eyeLx} cy={eyeY} r="7" fill={INK} />
                    <circle cx={eyeRx} cy={eyeY} r="7" fill={INK} />
                    <circle cx={eyeLx + 2} cy={eyeY - 3} r="2.2" fill={PAPER_FRONT} />
                    <circle cx={eyeRx + 2} cy={eyeY - 3} r="2.2" fill={PAPER_FRONT} />
                </g>
                <g display={show(use === 'verified')} stroke={INK}>
                    <path d="M73 128 Q81 118 89 128" />
                    <path d="M113 128 Q121 118 129 128" />
                </g>
                <path d={MOUTHS[use]} stroke={INK} fill={use === 'verified' ? INK : 'none'} />

                {/* The flag is the goal on top. It comes down while Buddi is building. */}
                <g display={show(use !== 'build')}>
                    <line x1="150" y1="62" x2="150" y2="24" />
                    <polygon points="150,24 176,32 150,40" fill={CAP} />
                </g>

                <g display={show(use === 'think')}>
                    <circle cx="58" cy="183" r="7" fill="currentColor" />
                    <circle cx="192" cy="46" r="5" strokeWidth="3" />
                    <circle cx="204" cy="24" r="8" strokeWidth="3" />
                </g>
                <g display={show(use === 'verified')}>
                    <circle cx="196" cy="80" r="17" fill={GREEN} />
                    <path d="M188 80 L194 86 L205 73" stroke={PAPER} />
                </g>
                <g display={show(use === 'build')}>
                    <rect x="36" y="18" width="148" height="34" fill={PLANK} />
                    <line x1="60" y1="35" x2="90" y2="35" stroke={INK} strokeWidth="2" opacity="0.45" />
                    <line x1="120" y1="29" x2="160" y2="29" stroke={INK} strokeWidth="2" opacity="0.45" />
                    <circle cx="54" cy="54" r="7" fill="currentColor" />
                    <circle cx="166" cy="54" r="7" fill="currentColor" />
                </g>
            </g>
        </svg>
    );
}
