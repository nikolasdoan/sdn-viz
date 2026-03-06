import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { gameState } from './GameState';

const MAX_ORBS = 3;
const SPAWN_INTERVAL = 25; // seconds between spawns

export function RepairOrbs() {
    const groupRef = useRef();
    const spawnTimer = useRef(15); // first orb spawns after 15s

    const orbData = useMemo(() => {
        return Array.from({ length: MAX_ORBS }, () => ({
            active: false,
            speed: 30 + Math.random() * 20,
        }));
    }, []);

    const spawnOrb = (mesh, data) => {
        const spreadX = (Math.random() - 0.5) * 60;
        const spreadY = (Math.random() - 0.5) * 40;
        mesh.position.set(spreadX, spreadY, -250 - Math.random() * 100);
        data.active = true;
        data.speed = 30 + Math.random() * 20;
    };

    useFrame((state, delta) => {
        if (!groupRef.current) return;
        if (gameState.health <= 0) return;

        const time = state.clock.elapsedTime;
        const children = groupRef.current.children;

        // Spawn timer
        spawnTimer.current += delta;
        if (spawnTimer.current >= SPAWN_INTERVAL) {
            spawnTimer.current = 0;
            // Find an inactive orb to spawn
            for (let i = 0; i < MAX_ORBS; i++) {
                if (!orbData[i].active) {
                    spawnOrb(children[i], orbData[i]);
                    break;
                }
            }
        }

        const shipPos = gameState.shipPosition;

        for (let i = 0; i < MAX_ORBS; i++) {
            const mesh = children[i];
            const data = orbData[i];

            if (!data.active) {
                mesh.visible = false;
                continue;
            }

            mesh.visible = true;

            // Fly straight toward camera (positive Z)
            mesh.position.z += data.speed * delta;

            // Rotate for visual flair
            mesh.rotation.x += delta * 2;
            mesh.rotation.y += delta * 3;

            // Pulsing scale
            const pulse = 1.0 + Math.sin(time * 5) * 0.2;
            mesh.scale.setScalar(pulse);

            // Collision with ship
            const dist = mesh.position.distanceTo(shipPos);
            if (dist < 3.0) {
                const repaired = gameState.repair();
                if (repaired) {
                    data.active = false;
                    mesh.visible = false;
                    continue;
                }
            }

            // Flew past camera
            if (mesh.position.z > 30) {
                data.active = false;
                mesh.visible = false;
            }
        }
    });

    return (
        <group ref={groupRef}>
            {Array.from({ length: MAX_ORBS }, (_, i) => (
                <mesh key={i} visible={false}>
                    <icosahedronGeometry args={[1.2, 1]} />
                    <meshStandardMaterial
                        color="#00ff66"
                        emissive="#00ff44"
                        emissiveIntensity={4}
                        transparent
                        opacity={0.85}
                        blending={THREE.AdditiveBlending}
                        wireframe
                    />
                </mesh>
            ))}
        </group>
    );
}
