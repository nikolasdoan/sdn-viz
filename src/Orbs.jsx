import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { engine } from './AudioEngine';
import { gameState } from './GameState';

const COLOR_BASS = new THREE.Color("#0033ff");
const COLOR_MID = new THREE.Color("#00ff66");
const COLOR_HIGH = new THREE.Color("#ffffff");

export function Orbs({ count = 12 }) {
    const groupRef = useRef();
    const _pos = new THREE.Vector3();

    // We store cumulative time to match the starfield passing speed
    const cumulativeTime = useRef(0);

    // Create an array of orb data
    const orbsData = useMemo(() => {
        return Array.from({ length: count }, (_, i) => {
            // Distribute orbs dynamically but keep them much further from the flight path
            // to create a massive-scale environment and prevent camera blocking
            let x = (Math.random() - 0.5) * 450;
            let y = (Math.random() - 0.5) * 300;

            // Push them far out of the absolute dead center 
            if (Math.abs(x) < 50) x += (x > 0 ? 50 : -50);
            if (Math.abs(y) < 50) y += (y > 0 ? 50 : -50);

            const z = (Math.random() - 0.5) * 1000; // Spreading them even further along Z

            // Generate an organic, jagged random geometry for each orb
            // Icosahedron with low detail makes for great asteroids/crystals
            const geo = new THREE.IcosahedronGeometry(1, 2);
            const pos = geo.attributes.position;
            const displacement = 0.2 + Math.random() * 0.4; // How spikey/organic
            for (let v = 0; v < pos.count; v++) {
                const vec = new THREE.Vector3().fromBufferAttribute(pos, v);
                vec.multiplyScalar(1.0 + (Math.random() * displacement - displacement / 2));
                pos.setXYZ(v, vec.x, vec.y, vec.z);
            }
            geo.computeVertexNormals();

            // Give each orb a distinct, vibrant color
            const color = new THREE.Color().setHSL(Math.random(), 0.8 + Math.random() * 0.2, 0.5);

            return {
                initialZ: z,
                position: [x, y, 0],
                // Smaller base scale per request (less massive planets, more like large organic debris)
                baseScale: 0.5 + Math.random() * 1.5,
                geometry: geo,
                color: color,
                rotSpeedX: (Math.random() - 0.5) * 2.0,
                rotSpeedY: (Math.random() - 0.5) * 2.0,
            };
        });
    }, [count]);

    useFrame((state, delta) => {
        if (!groupRef.current) return;

        const bass = engine.averageBass;
        const mid = engine.averageMid;
        const high = engine.averageHighs;
        const edmState = engine.currentState;

        // Match flight speed to the rest of the scene
        let flightSpeed = 100.0;
        let scaleMultiplier = 1.0;

        if (edmState === 'chill') {
            flightSpeed = 20.0;
            scaleMultiplier = 0.8;
        } else if (edmState === 'buildup') {
            flightSpeed = 150.0;
            scaleMultiplier = 1.2;
        } else if (edmState === 'drop') {
            flightSpeed = 400.0;
            scaleMultiplier = 2.0;
        }

        cumulativeTime.current += delta * flightSpeed;

        // Extreme bass pulsing logic
        const bassPulseScale = Math.pow(bass, 3) * 10.0;

        // Glow is sharp (Pow 10) so it snaps to dark immediately after the beat
        const bassPulseGlow = Math.pow(bass, 10) * 12.0;

        const children = groupRef.current.children;

        // Apply movement, scaling, and glow to each individual orb
        for (let i = 0; i < children.length; i++) {
            const mesh = children[i];
            const data = orbsData[i];
            const mat = mesh.material;

            // Calculate absolute Z position moving forward towards camera
            let currentZ = data.initialZ + cumulativeTime.current;

            // Wrap around at the camera back to deep space
            currentZ = ((currentZ + 980) % 1000) - 980;

            mesh.position.z = currentZ;

            // Apply the aggressive bass scale to "inflate" the orb
            const targetScale = data.baseScale + (bassPulseScale * scaleMultiplier);
            mesh.scale.set(targetScale, targetScale, targetScale);

            // Report position for collision detection (only if relatively near)
            if (currentZ > -100 && currentZ < 50) {
                _pos.set(data.position[0], data.position[1], currentZ);
                gameState.updateOrbPosition(i, _pos.clone(), targetScale * 0.8);
            } else if (currentZ > 50) {
                // Remove from tracking once safely past
                gameState.orbPositions.delete(i);
            }

            // Slightly rotate the orb so the wireframe/texture looks dynamic
            mesh.rotation.y += delta * data.rotSpeedY;
            mesh.rotation.x += delta * data.rotSpeedX;

            // Apply color and glow
            mat.emissive.copy(data.color);
            mat.emissiveIntensity = 0.1 + bassPulseGlow;

            // Fading logic for smooth spawn/despawn
            if (currentZ > 0) {
                mat.opacity = Math.max(0.1, 1.0 - (currentZ / 20.0));
            } else if (currentZ < -800) {
                mat.opacity = Math.max(0.1, (currentZ + 980) / 180.0);
            } else {
                mat.opacity = 0.9;
            }
        }
    });

    return (
        <group ref={groupRef}>
            {orbsData.map((data, i) => (
                <mesh key={i} position={[data.position[0], data.position[1], data.initialZ]} geometry={data.geometry}>
                    <meshStandardMaterial
                        color="#000000"
                        emissive="#ffffff"
                        emissiveIntensity={1.0}
                        transparent
                        opacity={0.9}
                        blending={THREE.AdditiveBlending}
                        depthWrite={false}
                        wireframe={true}
                    />
                </mesh>
            ))}
        </group>
    );
}
