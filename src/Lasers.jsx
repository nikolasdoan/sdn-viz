import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { engine } from './AudioEngine';

// Rich color palette — each beam picks its own color
const BEAM_COLORS = [
    new THREE.Color("#6600ff"), // Electric Purple
    new THREE.Color("#aa00ff"), // Violet
    new THREE.Color("#ff0088"), // Hot Pink
    new THREE.Color("#ff0044"), // Crimson
    new THREE.Color("#ff4400"), // Orange Red
    new THREE.Color("#ff8800"), // Orange
    new THREE.Color("#ffaa00"), // Golden
    new THREE.Color("#ffee00"), // Yellow
    new THREE.Color("#00ffcc"), // Teal Cyan
    new THREE.Color("#00ff88"), // Mint
    new THREE.Color("#00aaff"), // Sky Blue
    new THREE.Color("#0066ff"), // Blue
];

function HyperspeedBeams({ count = 60, baseLength = 80 }) {
    const groupRef = useRef();
    const cumulativeTime = useRef(0);
    const beatPulse = useRef(0);

    const lasersData = useMemo(() => {
        return Array.from({ length: count }, (_, i) => {
            const angle = Math.random() * Math.PI * 2;
            const radius = 120 + Math.random() * 130;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            const z = (Math.random() - 0.5) * 500;

            return {
                initialZ: z,
                position: [x, y, 0],
                randomSeed: Math.random(),
                // Each beam gets its own color from the palette
                color: BEAM_COLORS[Math.floor(Math.random() * BEAM_COLORS.length)].clone(),
            };
        });
    }, [count]);

    useFrame((state, delta) => {
        if (!groupRef.current) return;

        const bass = engine.averageBass;
        const mid = engine.averageMid;
        const high = engine.averageHighs;
        const edmState = engine.currentState;

        // Beat pulse with smooth decay
        if (engine.isBeat) beatPulse.current = 1.0;
        beatPulse.current *= 0.87;
        const bp = beatPulse.current;

        let flightSpeed = 100.0;
        let intensityMultiplier = 1.0;
        let scaleMultiplier = 1.0;

        if (edmState === 'chill') {
            flightSpeed = 20.0;
            intensityMultiplier = 0.3;
            scaleMultiplier = 0.5;
        } else if (edmState === 'buildup') {
            flightSpeed = 150.0;
            intensityMultiplier = 0.6;
            scaleMultiplier = 1.0;
        } else if (edmState === 'drop') {
            flightSpeed = 400.0;
            intensityMultiplier = 0.8;
            scaleMultiplier = 1.5;
        }

        cumulativeTime.current += delta * flightSpeed;

        const dominantIntensity = Math.max(bass, mid, high);
        const dominantScale = dominantIntensity;

        const children = groupRef.current.children;

        for (let i = 0; i < children.length; i++) {
            const mesh = children[i];
            const data = lasersData[i];
            const mat = mesh.material;

            let currentZ = data.initialZ + cumulativeTime.current;
            currentZ = ((currentZ + 450) % 500) - 450;
            mesh.position.z = currentZ;

            mesh.rotation.y += delta * 2.0;

            // Strobe — during drops, only ~40% of beams lit (down from 90%)
            const strobeWave = Math.sin(cumulativeTime.current * 0.1 + i + data.randomSeed * 10);
            const strobeOn = (strobeWave > 0) || (edmState === 'drop' && strobeWave > -0.6);

            if (strobeOn) {
                // Use this beam's own color, shifted slightly by time for shimmer
                const timeShift = Math.sin(cumulativeTime.current * 0.03 + i * 0.5) * 0.15;
                mat.emissive.copy(data.color);
                mat.emissive.r = Math.min(1, mat.emissive.r + timeShift);
                mat.emissive.g = Math.min(1, mat.emissive.g + timeShift * 0.5);

                // Intensity reacts to beat pulse + audio
                mat.emissiveIntensity = (0.3 + dominantIntensity * 3.0 + bp * 2.5) * intensityMultiplier;

                mesh.scale.x = 1 + (dominantScale * 1.5 + bp * 0.8) * scaleMultiplier;
                mesh.scale.z = 1 + (dominantScale * 1.5 + bp * 0.8) * scaleMultiplier;
                mesh.scale.y = 1 + (flightSpeed / 100.0) + bp * 0.5;

                mat.opacity = 0.5 + dominantIntensity * 0.3 + bp * 0.15;
            } else {
                mat.emissiveIntensity = 0.03;
                mesh.scale.x = 0.5;
                mesh.scale.z = 0.5;
                mesh.scale.y = 1.0;
                mat.opacity = 0.2;
            }
        }
    });

    return (
        <group ref={groupRef}>
            {lasersData.map((data, i) => (
                <mesh key={i} position={[data.position[0], data.position[1], data.initialZ]} rotation={[Math.PI / 2, 0, 0]}>
                    <cylinderGeometry args={[0.08, 0.08, baseLength, 6]} />
                    <meshStandardMaterial
                        color="#000000"
                        emissive="#ffffff"
                        emissiveIntensity={1.0}
                        transparent
                        opacity={0.8}
                        blending={THREE.AdditiveBlending}
                        depthWrite={false}
                    />
                </mesh>
            ))}
        </group>
    );
}

export function Lasers() {
    return (
        <group>
            <HyperspeedBeams count={80} baseLength={350} />
        </group>
    );
}
