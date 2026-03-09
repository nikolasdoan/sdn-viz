import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { engine } from './AudioEngine';

const COLOR_BASS = new THREE.Color("#8800ff");  // Purple
const COLOR_MID = new THREE.Color("#ff0066");   // Hot Pink
const COLOR_HIGH = new THREE.Color("#ffcc00");  // Gold

export function SingleWaveform({ sideX = -20 }) {
    const materialsRef = useRef([]);
    const MAX_POINTS = 600;

    // Explicitly create geometry to share among multiple line instances for thickness
    const geometry = useMemo(() => {
        const geo = new THREE.BufferGeometry();
        // Float32Array initialized to 0. Length: 600 points * 3 coordinates
        const positions = new Float32Array(MAX_POINTS * 3);
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        return geo;
    }, []);

    // History array tracks the "envelope" of the waveform data flying towards the camera
    // Pre-allocate pool to avoid per-frame object creation
    const history = useRef([]);
    const historyPool = useRef(Array.from({ length: MAX_POINTS }, () => ({ z: 0, y: 0 })));
    const poolIndex = useRef(0);
    const frameCount = useRef(0);

    useFrame((state, delta) => {
        frameCount.current += 1;

        const bass = engine.averageBass || 0;
        const mid = engine.averageMid || 0;
        const high = engine.averageHighs || 0;
        const edmState = engine.currentState;

        let flightSpeed = 100.0;
        let intensityMultiplier = 1.0;

        // Sync the waveform flight speed exactly to the starfield/beam speed
        if (edmState === 'chill') {
            flightSpeed = 20.0;
            intensityMultiplier = 0.5;
        } else if (edmState === 'buildup') {
            flightSpeed = 150.0;
            intensityMultiplier = 1.5;
        } else if (edmState === 'drop') {
            flightSpeed = 400.0; // Warp speed
            intensityMultiplier = 3.0;
        }

        const td = engine.timeDataArray;
        let peak = 0;
        if (td && td.length > 0) {
            for (let i = 0; i < td.length; i++) {
                // time domain is 0-255, center 128
                const val = Math.abs((td[i] - 128) / 128.0);
                if (val > peak) peak = val;
            }
        }

        // Bass severely distorts/amplifies the waveform height based on user request ("intensity mimicking base")
        const amplitude = peak * (2.0 + bass * 35.0) * intensityMultiplier;

        // Alternate sign to create a true zig-zag soundwave look instead of just a positive envelope shape
        const sign = (frameCount.current % 2 === 0) ? 1 : -1;
        const yValue = amplitude * sign;

        // Spawn new audio chunk — reuse pooled object to avoid GC pressure
        const obj = historyPool.current[poolIndex.current];
        poolIndex.current = (poolIndex.current + 1) % MAX_POINTS;
        obj.z = -200;
        obj.y = yValue;
        history.current.unshift(obj);

        // Advance all history points forward (+Z) towards the camera
        for (let i = 0; i < history.current.length; i++) {
            history.current[i].z += delta * flightSpeed;
        }

        // Remove points that have successfully flown completely past the camera (Z > 50)
        while (history.current.length > 0 && history.current[history.current.length - 1].z > 50) {
            history.current.pop();
        }

        if (history.current.length > MAX_POINTS) {
            history.current.length = MAX_POINTS;
        }

        // Apply calculated tracking to the Line's BufferGeometry
        const posAttr = geometry.attributes.position;
        const arr = posAttr.array;

        let writeLength = history.current.length;
        for (let i = 0; i < MAX_POINTS; i++) {
            if (i < writeLength) {
                const pt = history.current[i];

                // Add a slight outward flare to the very front tip so it's wider and more aggressive
                const isLeadingEdge = i < 15; // The newest 15 points
                const flare = isLeadingEdge ? (15 - i) * 0.5 * Math.sign(sideX) : 0;

                arr[i * 3 + 0] = sideX + flare;
                arr[i * 3 + 1] = pt.y; // Up/down amplitude
                arr[i * 3 + 2] = pt.z; // Flight trail depth
            } else {
                // Push remaining unused vertex coordinates far out of view
                arr[i * 3 + 0] = sideX;
                arr[i * 3 + 1] = 0;
                arr[i * 3 + 2] = 100;
            }
        }

        geometry.setDrawRange(0, writeLength);
        posAttr.needsUpdate = true;

        // Dynamic Color Matching dominant frequency layer
        let dominantColor = COLOR_BASS;
        let dominantScale = bass;
        if (mid > bass && mid > high) {
            dominantColor = COLOR_MID;
            dominantScale = mid;
        } else if (high > bass && high > mid) {
            dominantColor = COLOR_HIGH;
            dominantScale = high;
        }

        // Match intensity to bass amplitude
        // Reduction: Lowered the bassPulse multiplier significantly from 100.0
        const bassPulse = Math.pow(bass, 6) * 15.0;
        const glow = (0.2 + bassPulse) * intensityMultiplier;

        // Update all materials in the line bundle so they all glow simultaneously
        materialsRef.current.forEach(mat => {
            if (mat) {
                mat.color.setRGB(
                    dominantColor.r * glow,
                    dominantColor.g * glow,
                    dominantColor.b * glow
                );
            }
        });
    });

    const offsets = [-1.0, 0, 1.0]; // Spacing to create "fat" rendering via multiple lines

    return (
        <group>
            {offsets.map((offset, idx) => (
                <line key={idx} geometry={geometry} position={[offset, 0, 0]}>
                    <lineBasicMaterial
                        ref={(el) => materialsRef.current[idx] = el}
                        color="#ffffff"
                        transparent={true}
                        opacity={1.0} // Make all lines in the bundle fully opaque so the tip is extremely bright
                        blending={THREE.AdditiveBlending}
                        depthWrite={false}
                    />
                </line>
            ))}
        </group>
    );
}

// Epic audio-synchronized laser waveforms that fly towards the camera alongside the lasers
export function Waveforms() {
    return (
        <group>
            {/* Stage Left Waveform */}
            <SingleWaveform sideX={-120} />

            {/* Stage Right Waveform */}
            <SingleWaveform sideX={120} />
        </group>
    );
}
