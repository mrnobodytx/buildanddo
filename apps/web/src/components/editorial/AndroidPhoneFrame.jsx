// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/editorial/AndroidPhoneFrame.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-18
// Depends:     apps/web/src/contexts/MotionContext.jsx
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/contexts/MotionContext.jsx
// DAG Node:    none
// Intent:      Keep the phone preview live and keyboard-accessible without claiming a native app or using a screenshot of its content.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { useMotionActivity } from '@/contexts/MotionContext';
import './editorial.css';

/** Frame interactive web content without adding another page landmark.
 * @param {object} props Screen contents and app-bar title.
 * @returns {React.ReactElement} An Android-style CSS device.
 */
export default function AndroidPhoneFrame({ children, title = 'Daily Edition' }) {
    const activity = useMotionActivity('pointer');
    return (
        <div ref={activity.ref} className="android-device" data-tilt={activity.active ? 'on' : 'off'}>
            <div className="android-device__shell">
                <span className="android-device__speaker" aria-hidden="true" />
                <div className="android-device__screen">
                    <div className="android-status" aria-hidden="true">
                        <span>THE WEB EDITION</span>
                        <span className="android-status__signal"><i /><i /><i /><i /></span>
                    </div>
                    <div className="android-appbar">
                        <span className="android-appbar__mark" aria-hidden="true">B<span>&amp;</span>D</span>
                        <span>{title}</span>
                    </div>
                    <div className="android-device__content">{children}</div>
                    <div className="android-nav" aria-hidden="true"><span /><span /><span /></div>
                </div>
            </div>
        </div>
    );
}
