// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/platform/MetaFunctionOrb.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-PLATFORM-001
// CAPS:        pending
// CK:          pending
// Dispatch:    USO-BUILDANDDO-PLATFORM-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-13
// Depends:     three, framer-motion,
//              apps/web/src/components/platform/CapabilityMeshFallback.jsx
// EnumType:    Widget
// EnumEdges:   DEPENDS_ON three;
//              DEPENDS_ON apps/web/src/components/platform/CapabilityMeshFallback.jsx;
//              CONSUMES apps/web/src/components/platform/platformData.js
// Intent:      Render the provider capability mesh as a restrained, performant hero illustration.
// ───────────────────────────────────────────────────────────────

import React, { useEffect, useId, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Pause, Play } from 'lucide-react';
import * as THREE from 'three';
import CapabilityMeshFallback from '@/components/platform/CapabilityMeshFallback';
import { PROVIDERS } from '@/components/platform/platformData';

const PROVIDER_POSITIONS = [
    [-2.65, 1.65, 0.25],
    [2.65, 1.5, -0.15],
    [2.75, -1.4, 0.35],
    [-2.55, -1.5, 0.15],
    [0, -2.55, -0.35],
];

const NAMESPACE_POSITIONS = PROVIDER_POSITIONS.map(([x, y, z]) => [x * 0.52, y * 0.52, z + 0.05]);

function buildParticlePositions(count) {
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
        const phi = index * 2.399963;
        const radius = 2.4 + ((index * 17) % 31) / 22;
        positions[index * 3] = Math.cos(phi) * radius;
        positions[index * 3 + 1] = Math.sin(phi) * radius * 0.72;
        positions[index * 3 + 2] = (((index * 23) % 19) - 9) / 5;
    }
    return positions;
}

function disposeObject(object) {
    object.traverse((child) => {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
            child.material.forEach((material) => material.dispose());
        } else {
            child.material?.dispose();
        }
    });
}

export default function MetaFunctionOrb({ forceStatic = false }) {
    const reduce = useReducedMotion();
    const titleId = useId();
    const captionId = useId();
    const mountRef = useRef(null);
    const activeProviderRef = useRef(0);
    const pausedRef = useRef(false);
    const [activeProvider, setActiveProvider] = useState(0);
    const [paused, setPaused] = useState(false);
    const [compact, setCompact] = useState(() => (
        typeof window === 'undefined' ? false : window.matchMedia('(max-width: 767px)').matches
    ));
    const [webglFailed, setWebglFailed] = useState(false);
    const staticMode = forceStatic || reduce || compact || webglFailed;

    useEffect(() => {
        const query = window.matchMedia('(max-width: 767px)');
        const update = () => setCompact(query.matches);
        query.addEventListener('change', update);
        return () => query.removeEventListener('change', update);
    }, []);

    useEffect(() => {
        activeProviderRef.current = activeProvider;
    }, [activeProvider]);

    useEffect(() => {
        pausedRef.current = paused;
    }, [paused]);

    useEffect(() => {
        if (staticMode || paused) return undefined;
        const timer = window.setInterval(() => {
            setActiveProvider((index) => (index + 1) % PROVIDERS.length);
        }, 2600);
        return () => window.clearInterval(timer);
    }, [paused, staticMode]);

    useEffect(() => {
        if (staticMode || !mountRef.current) return undefined;
        const mount = mountRef.current;
        let renderer;
        try {
            renderer = new THREE.WebGLRenderer({
                alpha: true,
                antialias: true,
                powerPreference: 'high-performance',
            });
        } catch {
            setWebglFailed(true);
            return undefined;
        }

        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.setClearColor(0x000000, 0);
        renderer.domElement.setAttribute('aria-hidden', 'true');
        mount.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0xece8dc, 0.075);
        const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
        camera.position.set(0, 0.15, 8.3);

        const group = new THREE.Group();
        group.rotation.x = -0.12;
        scene.add(group);

        scene.add(new THREE.AmbientLight(0xffffff, 1.75));
        const keyLight = new THREE.PointLight(0xfff4df, 24, 16);
        keyLight.position.set(3, 4, 5);
        scene.add(keyLight);

        const nucleusGeometry = new THREE.IcosahedronGeometry(0.78, 1);
        const nucleusMaterial = new THREE.MeshStandardMaterial({
            color: 0x25272a,
            emissive: 0x151719,
            emissiveIntensity: 0.8,
            metalness: 0.32,
            roughness: 0.55,
            wireframe: true,
        });
        const nucleus = new THREE.Mesh(nucleusGeometry, nucleusMaterial);
        group.add(nucleus);

        const innerNucleus = new THREE.Mesh(
            new THREE.SphereGeometry(0.48, 24, 24),
            new THREE.MeshBasicMaterial({ color: 0x202327, transparent: true, opacity: 0.88 }),
        );
        group.add(innerNucleus);

        const orbit = new THREE.Mesh(
            new THREE.TorusGeometry(3.05, 0.012, 8, 128),
            new THREE.MeshBasicMaterial({ color: 0x6f6b63, transparent: true, opacity: 0.28 }),
        );
        orbit.scale.y = 0.74;
        orbit.rotation.z = 0.12;
        group.add(orbit);

        const providerMeshes = [];
        const providerGlows = [];
        const providerLines = [];
        const inactiveLineColor = new THREE.Color(0x77736c);
        const namespaceGeometry = new THREE.OctahedronGeometry(0.16, 0);

        PROVIDERS.forEach((provider, index) => {
            const color = new THREE.Color(provider.color);
            const position = new THREE.Vector3(...PROVIDER_POSITIONS[index]);
            const namespacePosition = new THREE.Vector3(...NAMESPACE_POSITIONS[index]);

            const providerMesh = new THREE.Mesh(
                new THREE.SphereGeometry(0.29, 24, 24),
                new THREE.MeshStandardMaterial({
                    color,
                    emissive: color,
                    emissiveIntensity: 0.72,
                    metalness: 0.05,
                    roughness: 0.48,
                }),
            );
            providerMesh.position.copy(position);
            group.add(providerMesh);
            providerMeshes.push(providerMesh);

            const glow = new THREE.Mesh(
                new THREE.SphereGeometry(0.48, 20, 20),
                new THREE.MeshBasicMaterial({
                    color,
                    transparent: true,
                    opacity: 0.11,
                    side: THREE.BackSide,
                    depthWrite: false,
                }),
            );
            glow.position.copy(position);
            group.add(glow);
            providerGlows.push(glow);

            const namespaceNode = new THREE.Mesh(
                namespaceGeometry,
                new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.82 }),
            );
            namespaceNode.position.copy(namespacePosition);
            group.add(namespaceNode);

            const providerLineMaterial = new THREE.LineBasicMaterial({
                color: 0x77736c,
                transparent: true,
                opacity: 0.3,
            });
            const providerLine = new THREE.Line(
                new THREE.BufferGeometry().setFromPoints([position, namespacePosition]),
                providerLineMaterial,
            );
            group.add(providerLine);
            providerLines.push({ material: providerLineMaterial, color });

            const registryLine = new THREE.Line(
                new THREE.BufferGeometry().setFromPoints([namespacePosition, new THREE.Vector3(0, 0, 0)]),
                new THREE.LineBasicMaterial({ color: 0x77736c, transparent: true, opacity: 0.22 }),
            );
            group.add(registryLine);
        });

        const particlesGeometry = new THREE.BufferGeometry();
        particlesGeometry.setAttribute('position', new THREE.BufferAttribute(buildParticlePositions(92), 3));
        const particles = new THREE.Points(
            particlesGeometry,
            new THREE.PointsMaterial({
                color: 0x4f4d49,
                size: 0.035,
                transparent: true,
                opacity: 0.42,
                depthWrite: false,
            }),
        );
        group.add(particles);

        let visible = true;
        let documentVisible = !document.hidden;
        const intersection = new IntersectionObserver((entries) => {
            visible = entries[0]?.isIntersecting ?? true;
        }, { threshold: 0.05 });
        intersection.observe(mount);

        const onVisibility = () => {
            documentVisible = !document.hidden;
        };
        document.addEventListener('visibilitychange', onVisibility);

        const resize = () => {
            const width = Math.max(mount.clientWidth, 320);
            const height = Math.max(mount.clientHeight, 390);
            renderer.setSize(width, height, false);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
        };
        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(mount);
        resize();

        const onContextLost = (event) => {
            event.preventDefault();
            setWebglFailed(true);
        };
        renderer.domElement.addEventListener('webglcontextlost', onContextLost);

        const clock = new THREE.Clock();
        let frameId = 0;
        const render = () => {
            frameId = window.requestAnimationFrame(render);
            if (!visible || !documentVisible) return;
            const elapsed = clock.getElapsedTime();
            if (!pausedRef.current) {
                group.rotation.y = elapsed * 0.075;
                nucleus.rotation.x = elapsed * 0.13;
                nucleus.rotation.y = elapsed * 0.18;
                particles.rotation.z = elapsed * 0.018;
            }

            providerMeshes.forEach((mesh, index) => {
                const selected = index === activeProviderRef.current;
                const pulse = selected && !pausedRef.current ? 1 + Math.sin(elapsed * 3.8) * 0.11 : 1;
                mesh.scale.setScalar(pulse);
                mesh.material.emissiveIntensity = selected ? 1.25 : 0.52;
                providerGlows[index].scale.setScalar(selected ? 1.32 + Math.sin(elapsed * 3.8) * 0.08 : 1);
                providerGlows[index].material.opacity = selected ? 0.2 : 0.08;
                providerLines[index].material.color.copy(selected ? providerLines[index].color : inactiveLineColor);
                providerLines[index].material.opacity = selected ? 0.92 : 0.25;
            });
            renderer.render(scene, camera);
        };
        render();

        return () => {
            window.cancelAnimationFrame(frameId);
            intersection.disconnect();
            resizeObserver.disconnect();
            document.removeEventListener('visibilitychange', onVisibility);
            renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
            disposeObject(scene);
            renderer.dispose();
            renderer.forceContextLoss();
            renderer.domElement.remove();
        };
    }, [staticMode]);

    if (staticMode) return <CapabilityMeshFallback />;

    const current = PROVIDERS[activeProvider];
    return (
        <figure
            className="relative overflow-hidden border border-foreground/70 bg-card"
            aria-labelledby={`${titleId} ${captionId}`}
        >
            <div className="flex items-center justify-between border-b border-border px-4 py-2">
                <span id={titleId} className="font-evidence text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    Figure 01 · provider mesh
                </span>
                <button
                    type="button"
                    onClick={() => setPaused((value) => !value)}
                    className="inline-flex items-center gap-2 font-evidence text-[10px] text-teal"
                    aria-pressed={paused}
                >
                    <span className="relative flex h-1.5 w-1.5">
                        {!paused && <span className="absolute h-full w-full animate-ping rounded-full bg-teal opacity-50" />}
                        <span className="relative h-1.5 w-1.5 rounded-full bg-teal" />
                    </span>
                    {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                    {paused ? 'resume mesh' : `invoking ${current.namespace}`}
                </button>
            </div>
            <div ref={mountRef} className="h-[25rem] w-full lg:h-[31rem]" />
            <div className="pointer-events-none absolute inset-x-4 bottom-[4.25rem] grid grid-cols-5 gap-1" aria-hidden="true">
                {PROVIDERS.map((provider, index) => (
                    <div key={provider.id} className={`border-t pt-2 text-center transition-opacity ${index === activeProvider ? 'border-foreground opacity-100' : 'border-border opacity-50'}`}>
                        <span className="font-evidence text-[8px] font-semibold uppercase tracking-[0.08em]">{provider.name}</span>
                    </div>
                ))}
            </div>
            <figcaption id={captionId} className="border-t border-border px-4 py-3 text-xs leading-relaxed text-muted-foreground">
                The active path brightens as a named capability crosses its provider boundary.
            </figcaption>
        </figure>
    );
}
