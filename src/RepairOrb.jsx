import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { gameState } from './GameState';

const MAX_ORBS = 3;
const SPAWN_INTERVAL = 25;

export function RepairOrbs() {
    const groupRef = useRef();
    const spawnTimer = useRef(15);

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
            mesh.position.z += data.speed * delta;

            // Slow elegant tumble
            mesh.rotation.x += delta * 1.2;
            mesh.rotation.y += delta * 1.8;
            mesh.rotation.z += delta * 0.8;

            // Pulsing scale
            const pulse = 1.0 + Math.sin(time * 4) * 0.15;
            mesh.scale.setScalar(pulse);

            // Update materials — prism wireframe pulses green
            const prism = mesh.children[0];
            if (prism && prism.material) {
                prism.material.emissiveIntensity = 3 + Math.sin(time * 6) * 1.5;
            }
            // Inner solid prism glows
            const inner = mesh.children[1];
            if (inner && inner.material) {
                inner.material.emissiveIntensity = 2 + Math.sin(time * 8 + 1) * 1;
            }
            // Cross piece
            const cross = mesh.children[2];
            if (cross && cross.material) {
                cross.material.emissiveIntensity = 4 + Math.sin(time * 5) * 2;
            }

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
                <group key={i} visible={false}>
                    {/* Outer prism wireframe — green crystal */}
                    <mesh>
                        <octahedronGeometry args={[1.5, 0]} />
                        <meshStandardMaterial
                            color="#00ff66"
                            emissive="#00ff44"
                            emissiveIntensity={3}
                            transparent
                            opacity={0.7}
                            blending={THREE.AdditiveBlending}
                            wireframe
                        />
                    </mesh>
                    {/* Inner solid prism — smaller, brighter */}
                    <mesh>
                        <octahedronGeometry args={[0.8, 0]} />
                        <meshStandardMaterial
                            color="#00ff88"
                            emissive="#00ff66"
                            emissiveIntensity={2}
                            transparent
                            opacity={0.5}
                        />
                    </mesh>
                    {/* Cross / plus sign — health symbol */}
                    <mesh>
                        <boxGeometry args={[0.2, 1.2, 0.2]} />
                        <meshStandardMaterial
                            color="#ffffff"
                            emissive="#00ff88"
                            emissiveIntensity={5}
                            blending={THREE.AdditiveBlending}
                            transparent
                            opacity={0.9}
                        />
                    </mesh>
                    <mesh>
                        <boxGeometry args={[1.2, 0.2, 0.2]} />
                        <meshStandardMaterial
                            color="#ffffff"
                            emissive="#00ff88"
                            emissiveIntensity={5}
                            blending={THREE.AdditiveBlending}
                            transparent
                            opacity={0.9}
                        />
                    </mesh>
                    <pointLight color="#00ff66" distance={12} intensity={3} />
                </group>
            ))}
        </group>
    );
}
