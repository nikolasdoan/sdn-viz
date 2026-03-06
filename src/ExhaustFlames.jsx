import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { engine } from './AudioEngine';
import { gameState } from './GameState';

// Each engine has 3 layered flame cones: core (white-hot), mid (cyan), outer (blue)
// They scale/flicker independently for a burning look
export function ExhaustFlames({ shipRef }) {
    const leftCoreRef = useRef();
    const leftMidRef = useRef();
    const leftOuterRef = useRef();
    const rightCoreRef = useRef();
    const rightMidRef = useRef();
    const rightOuterRef = useRef();
    const leftGlowRef = useRef();
    const rightGlowRef = useRef();

    const beatPulse = useRef(0);
    const flickerTime = useRef(0);

    useFrame((state, rawDelta) => {
        if (!shipRef.current) return;
        const delta = Math.min(rawDelta, 0.05);
        const time = state.clock.elapsedTime;

        const bass = engine.averageBass || 0;
        const edmState = engine.currentState;

        // Beat pulse with decay
        if (engine.isBeat) beatPulse.current = 1.0;
        beatPulse.current *= 0.84;
        const bp = beatPulse.current;

        // Flicker noise — random per-frame jitter for fire look
        flickerTime.current += delta;
        const flicker1 = 0.7 + Math.sin(time * 30) * 0.15 + Math.sin(time * 47) * 0.1 + Math.random() * 0.1;
        const flicker2 = 0.7 + Math.sin(time * 35 + 1) * 0.15 + Math.cos(time * 53) * 0.1 + Math.random() * 0.1;

        // EDM multiplier
        let stateScale = 1.0;
        if (edmState === 'buildup') stateScale = 1.6;
        else if (edmState === 'drop') stateScale = 2.5;

        // Base flame size — always burning
        const baseLen = 1.0 + bass * 2.0 + bp * 4.0;
        const baseWidth = 0.8 + bass * 0.3 + bp * 0.5;

        // Position flames at ship's engine exhaust
        const shipPos = shipRef.current.position;
        const shipRot = shipRef.current.rotation;

        // Update both engine flames
        const engines = [
            { core: leftCoreRef, mid: leftMidRef, outer: leftOuterRef, glow: leftGlowRef, offsetX: -0.4, flicker: flicker1 },
            { core: rightCoreRef, mid: rightMidRef, outer: rightOuterRef, glow: rightGlowRef, offsetX: 0.4, flicker: flicker2 },
        ];

        for (const eng of engines) {
            const f = eng.flicker;

            // Core flame — white-hot, tight, longest
            if (eng.core.current) {
                const coreLen = baseLen * 1.2 * f * stateScale;
                eng.core.current.scale.set(baseWidth * 0.4, coreLen, baseWidth * 0.4);
                eng.core.current.material.emissiveIntensity = (3 + bass * 10 + bp * 15) * stateScale;
                eng.core.current.material.opacity = 0.6 + bp * 0.3;
            }

            // Mid flame — cyan, wider, slightly shorter
            if (eng.mid.current) {
                const midLen = baseLen * 0.9 * f * stateScale;
                eng.mid.current.scale.set(baseWidth * 0.7, midLen, baseWidth * 0.7);
                eng.mid.current.material.emissiveIntensity = (2 + bass * 6 + bp * 10) * stateScale;
                eng.mid.current.material.opacity = 0.4 + bp * 0.25;
            }

            // Outer flame — blue, widest, shortest, most flicker
            if (eng.outer.current) {
                const outerFlicker = f * (0.8 + Math.sin(time * 20 + eng.offsetX * 10) * 0.2);
                const outerLen = baseLen * 0.6 * outerFlicker * stateScale;
                eng.outer.current.scale.set(baseWidth * 1.0, outerLen, baseWidth * 1.0);
                eng.outer.current.material.emissiveIntensity = (1.5 + bass * 4 + bp * 6) * stateScale;
                eng.outer.current.material.opacity = 0.25 + bp * 0.2;
            }

            // Glow light
            if (eng.glow.current) {
                eng.glow.current.intensity = (2 + bass * 8 + bp * 12) * stateScale * f;
            }
        }
    });

    return (
        <group>
            {/* Left engine flames */}
            <group position={[-0.4, 0, 1.3]} rotation={[Math.PI / 2, 0, 0]}>
                {/* Core — white-hot */}
                <mesh ref={leftCoreRef}>
                    <coneGeometry args={[0.12, 2.0, 6]} />
                    <meshStandardMaterial
                        color="#000000" emissive="#ffffff" emissiveIntensity={5}
                        transparent opacity={0.7}
                        blending={THREE.AdditiveBlending} depthWrite={false}
                    />
                </mesh>
                {/* Mid — cyan */}
                <mesh ref={leftMidRef}>
                    <coneGeometry args={[0.18, 1.6, 6]} />
                    <meshStandardMaterial
                        color="#000000" emissive="#00ffff" emissiveIntensity={3}
                        transparent opacity={0.5}
                        blending={THREE.AdditiveBlending} depthWrite={false}
                    />
                </mesh>
                {/* Outer — blue */}
                <mesh ref={leftOuterRef}>
                    <coneGeometry args={[0.25, 1.2, 6]} />
                    <meshStandardMaterial
                        color="#000000" emissive="#0044ff" emissiveIntensity={2}
                        transparent opacity={0.3}
                        blending={THREE.AdditiveBlending} depthWrite={false}
                    />
                </mesh>
            </group>
            <pointLight ref={leftGlowRef} color="#00ffff" distance={15} intensity={3} position={[-0.4, 0, 2.5]} />

            {/* Right engine flames */}
            <group position={[0.4, 0, 1.3]} rotation={[Math.PI / 2, 0, 0]}>
                <mesh ref={rightCoreRef}>
                    <coneGeometry args={[0.12, 2.0, 6]} />
                    <meshStandardMaterial
                        color="#000000" emissive="#ffffff" emissiveIntensity={5}
                        transparent opacity={0.7}
                        blending={THREE.AdditiveBlending} depthWrite={false}
                    />
                </mesh>
                <mesh ref={rightMidRef}>
                    <coneGeometry args={[0.18, 1.6, 6]} />
                    <meshStandardMaterial
                        color="#000000" emissive="#00ffff" emissiveIntensity={3}
                        transparent opacity={0.5}
                        blending={THREE.AdditiveBlending} depthWrite={false}
                    />
                </mesh>
                <mesh ref={rightOuterRef}>
                    <coneGeometry args={[0.25, 1.2, 6]} />
                    <meshStandardMaterial
                        color="#000000" emissive="#0044ff" emissiveIntensity={2}
                        transparent opacity={0.3}
                        blending={THREE.AdditiveBlending} depthWrite={false}
                    />
                </mesh>
            </group>
            <pointLight ref={rightGlowRef} color="#00ffff" distance={15} intensity={3} position={[0.4, 0, 2.5]} />
        </group>
    );
}
