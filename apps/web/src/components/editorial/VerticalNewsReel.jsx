// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/editorial/VerticalNewsReel.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-18
// Depends:     apps/web/src/lib/editorialReel.js, apps/web/src/lib/editorialContent.js, apps/web/src/contexts/MotionContext.jsx, apps/web/src/components/editorial/LivingStill.jsx, apps/web/src/components/editorial/Engraving.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/lib/editorialReel.js; CONSUMES apps/web/src/lib/editorialContent.js; CONSUMES apps/web/src/contexts/MotionContext.jsx; CONSUMES apps/web/src/components/editorial/LivingStill.jsx; CONSUMES apps/web/src/components/editorial/Engraving.jsx
// DAG Node:    none
// Intent:      Let each news column advance like a printed reel while preserving reading time, focus and access to every source.
// ───────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, Pause, Play, ArrowUpRight } from 'lucide-react';
import { useMotionActivity } from '@/contexts/MotionContext';
import { animateElement } from '@/lib/motion/runtime';
import { advanceReel, reelWindow, scheduleReel } from '@/lib/editorialReel';
import { editorialDate } from '@/lib/editorialContent';
import LivingStill from './LivingStill';
import Engraving from './Engraving';
import './editorial.css';

/** Rotate one independent column and stop automatic work while someone reads it.
 * @param {object} props Cards, accessible reel name and bounded display options.
 * @returns {React.ReactElement} A source-linked vertical carousel with manual controls.
 */
export default function VerticalNewsReel({
    items = [], label = 'News', interval = 9000, visibleCount = 3, height,
    emptyMessage = 'There are no stories in this edition yet.', className = '',
}) {
    const [position, setPosition] = useState({ id: null, tick: 0, direction: 1 });
    const [paused, setPaused] = useState(false);
    const [hovered, setHovered] = useState(false);
    const pointerPause = useRef(null);
    const track = useRef(null);
    const previous = useRef({ ids: '', tick: 0 });
    const activity = useMotionActivity('media');
    const view = reelWindow(items, position.id, visibleCount);
    const ids = JSON.stringify(items.map((item) => item.id));
    const running = activity.active && view.rotating && !paused && !hovered;
    const stillsPaused = paused || hovered || !activity.active;
    const rowHeight = Number.isFinite(height) ? Math.max(200, Math.min(560, height)) : undefined;
    const move = useCallback((direction) => {
        setPosition((current) => ({
            id: advanceReel(items, current.id, direction),
            tick: current.tick + 1, direction,
        }));
    }, [items]);

    useEffect(() => {
        if (!running) return undefined;
        return scheduleReel(() => move(1), interval, window);
    }, [running, interval, move]);

    useLayoutEffect(() => {
        const moved = previous.current.ids === ids && previous.current.tick !== position.tick;
        previous.current = { ids, tick: position.tick };
        if (!moved || !view.rotating) return undefined;
        const pixels = track.current?.firstElementChild?.getBoundingClientRect().height || rowHeight || 256;
        return animateElement(track.current, [
            { transform: `translateY(${position.direction > 0 ? 0 : -2 * pixels}px)` },
            { transform: `translateY(${-pixels}px)` },
        ], { duration: 850, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }, activity.enabled && activity.active);
    }, [ids, position.tick, position.direction, view.rotating, rowHeight, activity.enabled, activity.active]);

    const step = (direction) => { setPaused(true); move(direction); };
    return (
        <section ref={activity.ref} className={`news-reel ${className}`} aria-label={label}
            aria-roledescription={view.rotating ? 'carousel' : undefined}
            data-playing={running ? 'true' : 'false'}
            style={{ '--reel-count': view.visibleCount, '--reel-card-height': rowHeight ? `${rowHeight / 16}rem` : undefined }}
            onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
            onFocusCapture={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setPaused(true);
            }}>
            {!items.length ? <p className="news-reel__empty" role="status">{emptyMessage}</p> : <>
                <div className="news-reel__viewport" aria-live={running ? 'off' : 'polite'} aria-atomic="false">
                    <div ref={track} className="news-reel__track"
                        style={{ transform: view.rotating ? 'translateY(calc(-1 * var(--reel-card-height)))' : undefined }}>
                        {view.rows.map(({ item, position: ordinal, hidden }, row) => {
                            const internal = item.href?.startsWith('/') && !item.href.startsWith('//');
                            const Destination = internal ? Link : 'a';
                            return (
                                <article key={`${row}:${item.id}`} className="news-reel__slide"
                                    role="group" aria-roledescription="slide" aria-label={`${ordinal + 1} of ${items.length}`}
                                    aria-hidden={hidden ? true : undefined} inert={hidden ? '' : undefined}>
                                    <LivingStill src={item.image} alt={item.imageAlt || ''} motion={item.image ? item.motion : 'scene'}
                                        duration={item.duration} paused={hidden || stillsPaused} className="news-reel__image">
                                        <Engraving kind={item.illustration} />
                                    </LivingStill>
                                    <div className="news-reel__copy">
                                        <p className="news-reel__kicker">{item.kicker}</p>
                                        <h3 title={item.title}>{item.title}</h3>
                                        <p className="news-reel__description">{item.description}</p>
                                        <p className="news-reel__source">
                                            {item.source}
                                            {item.date && <time dateTime={item.date}>{editorialDate(item.date)}</time>}
                                        </p>
                                        {item.href && <Destination {...(internal ? { to: item.href } : { href: item.href, rel: 'noreferrer' })}
                                            tabIndex={hidden ? -1 : undefined} className="news-reel__link">
                                            {item.linkLabel || 'Read the story'} <ArrowUpRight size={13} aria-hidden="true" />
                                        </Destination>}
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                </div>
                <div className="news-reel__controls">
                    <span className="news-reel__counter" aria-label={`Showing ${view.visibleCount} of ${items.length} stories`}>
                        <strong>{String(view.index + 1).padStart(2, '0')}</strong>
                        <span aria-hidden="true"> / </span>{String(items.length).padStart(2, '0')}
                    </span>
                    {view.rotating && <div className="news-reel__buttons">
                        <button type="button" aria-label={`Previous in ${label}`} onClick={() => step(-1)}>
                            <ArrowUp size={15} aria-hidden="true" />
                        </button>
                        <button type="button" aria-label={`${paused ? 'Play' : 'Pause'} ${label}`}
                            disabled={!activity.enabled || !activity.motion.automatic}
                            title={!activity.enabled || !activity.motion.automatic ? 'Automatic motion is off in your motion preferences.' : undefined}
                            onPointerDown={() => { pointerPause.current = !paused; }}
                            onPointerCancel={() => { pointerPause.current = null; }}
                            onBlur={() => { pointerPause.current = null; }}
                            onClick={() => {
                                setPaused(pointerPause.current ?? !paused);
                                pointerPause.current = null;
                            }}>
                            {paused || !activity.enabled || !activity.motion.automatic
                                ? <Play size={13} aria-hidden="true" /> : <Pause size={13} aria-hidden="true" />}
                        </button>
                        <button type="button" aria-label={`Next in ${label}`} onClick={() => step(1)}>
                            <ArrowDown size={15} aria-hidden="true" />
                        </button>
                    </div>}
                </div>
            </>}
        </section>
    );
}
