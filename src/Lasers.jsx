import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { engine } from './AudioEngine';

// Color Palette: Ethereal Deep Space
const COLOR_BASS = new THREE.Color("#0033ff");   // Deep Ocean Blue
const COLOR_MID = new THREE.Color("#00ff66");    // Emerald Green 
const COLOR_HIGH = new THREE.Color("#ffffff");   // Crisp White

function HyperspeedBeams({ count = 60, baseLength = 80 }) {
    const groupRef = useRef();

    // We store cumulative time ourselves so we can dynamically change speed 
    // without jumping positions wildly when speed multiplies
    const cumulativeTime = useRef(0);

    // Create an array of laser beam meshes
    const lasersData = useMemo(() => {
        return Array.from({ length: count }, (_, i) => {
            // Distribute stars in a massive long bounding box
            let x = (Math.random() - 0.5) * 150;
            let y = (Math.random() - 0.5) * 150;

            // Keep the center cockpit area clear so they zip PAST us, not THROUGH us
            if (Math.abs(x) < 15 && Math.abs(y) < 15) {
                x += (x > 0 ? 15 : -15);
                y += (y > 0 ? 15 : -15);
            }

            const z = (Math.random() - 0.5) * 500; // -250 to 250 initial distribution

            return {
                initialZ: z,
                position: [x, y, 0], // Z will be calculated in the frame loop
                randomSeed: Math.random() // For strobing variation
            };
        });
    }, [count]);

    useFrame((state, delta) => {
        if (!groupRef.current) return;

        // Grab current audio data
        const bass = engine.averageBass;
        const mid = engine.averageMid;
        const high = engine.averageHighs;

        // Grab pre-analyzed EDM State
        const edmState = engine.currentState;

        // Define base behavior multipliers based on the State Machine
        let flightSpeed = 100.0;
        let intensityMultiplier = 1.0;
        let scaleMultiplier = 1.0;

        if (edmState === 'chill') {
            flightSpeed = 20.0; // Slow, lazy passing lights like distant traffic
            intensityMultiplier = 0.5; // Dimmer
            scaleMultiplier = 0.5; // Thinner
        } else if (edmState === 'buildup') {
            flightSpeed = 150.0; // Fast panic warp
            intensityMultiplier = 1.0; // Normal brightness
            scaleMultiplier = 1.0;
        } else if (edmState === 'drop') {
            flightSpeed = 400.0; // Hyper-drive maximum speed
            intensityMultiplier = 1.5; // Reduced from 4.0 to prevent blowout
            scaleMultiplier = 2.0; // Reduced from 3.0
        }

        // Apply Time-based forward movement (+Z)
        cumulativeTime.current += delta * flightSpeed;

        // Determine the "base" color to use based on the loudest frequency
        let dominantColor = COLOR_BASS;
        let dominantIntensity = bass;
        let dominantScale = bass;

        if (mid > bass && mid > high) {
            dominantColor = COLOR_MID;
            dominantIntensity = mid;
            dominantScale = mid;
        } else if (high > bass && high > mid) {
            dominantColor = COLOR_HIGH;
            dominantIntensity = high;
            dominantScale = high;
        }

        const children = groupRef.current.children;

        // Apply movement and color to individual passing beams
        for (let i = 0; i < children.length; i++) {
            const mesh = children[i];
            const data = lasersData[i];
            const mat = mesh.material;

            // Calculate absolute Z position moving forward
            let currentZ = data.initialZ + cumulativeTime.current;

            // Wrap around at the camera (Z = 50) back to the deep background (Z = -450)
            currentZ = ((currentZ + 450) % 500) - 450;

            mesh.position.z = currentZ;

            // Add a slight barrel roll twirl to the beams as they fly past
            mesh.rotation.y += delta * 2.0;

            // Strobe effect: Only light up certain beams based on time and index, or almost all in Drop
            const strobeOn = (Math.sin(cumulativeTime.current * 0.1 + i + data.randomSeed * 10) > 0) || (edmState === 'drop' && Math.random() > 0.1);

            if (strobeOn) {
                mat.emissive.copy(dominantColor);
                mat.emissiveIntensity = (0.5 + (dominantIntensity * 6.0)) * intensityMultiplier;

                // Because we rotated the mesh X-axis 90 degrees, its local Y is now the world Z.
                // So scaling Y stretches the length, scaling X/Z thickens the radius.
                mesh.scale.x = 1 + (dominantScale * 1.5 * scaleMultiplier); // Beam thickness
                mesh.scale.z = 1 + (dominantScale * 1.5 * scaleMultiplier); // Beam thickness

                // Stretch length immensely during high speed drops for light-trail effect
                mesh.scale.y = 1 + (flightSpeed / 100.0);
            } else {
                mat.emissiveIntensity = 0.05; // Ghostly dim off state
                mesh.scale.x = 0.5;
                mesh.scale.z = 0.5;
                mesh.scale.y = 1.0;
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

// Epic Lasers now exports the Hyperspeed Beams that zip past the camera
export function Lasers() {
    return (
        <group>
            {/* The infinite tunnel of passing light trails */}
            <HyperspeedBeams count={100} baseLength={150} />
        </group>
    );
}
