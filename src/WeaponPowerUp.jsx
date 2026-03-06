import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { gameState } from './GameState';

const MAX_POWERUPS = 6;

export function WeaponPowerUps() {
    const groupRef = useRef();

    const powerUpData = useMemo(() => {
        return Array.from({ length: MAX_POWERUPS }, (_, i) => ({
            id: i,
            active: false,
            velocity: new THREE.Vector3(0, 0, 40),
            life: 0,
            spinPhase: Math.random() * Math.PI * 2,
        }));
    }, []);

    useFrame((state, delta) => {
        if (!groupRef.current) return;

        const time = state.clock.elapsedTime;
        const children = groupRef.current.children;

        // Consume power-up spawn queue
        while (gameState.powerUpQueue.length > 0) {
            let idx = -1;
            for (let i = 0; i < MAX_POWERUPS; i++) {
                if (!powerUpData[i].active) { idx = i; break; }
            }
            if (idx === -1) break;

            const spawn = gameState.powerUpQueue.shift();
            const data = powerUpData[idx];
            const mesh = children[idx];

            data.active = true;
            data.life = 0;
            data.velocity.set(0, 0, 40);
            mesh.position.set(spawn.x, spawn.y, spawn.z);
            mesh.visible = true;
        }

        // Update active power-ups
        const shipPos = gameState.shipPosition;
        for (let i = 0; i < MAX_POWERUPS; i++) {
            const data = powerUpData[i];
            const mesh = children[i];

            if (!data.active) {
                mesh.visible = false;
                continue;
            }

            data.life += delta;
            mesh.position.addScaledVector(data.velocity, delta);

            // Spin and bob
            mesh.rotation.y = time * 3 + data.spinPhase;
            mesh.rotation.z = Math.sin(time * 2 + data.spinPhase) * 0.3;

            // Pulse scale
            const pulse = 1 + Math.sin(time * 6 + data.spinPhase) * 0.15;
            mesh.scale.setScalar(pulse);

            // Pickup collision
            const dist = mesh.position.distanceTo(shipPos);
            if (dist < 3.0) {
                data.active = false;
                mesh.visible = false;
                gameState.weaponPowerUp();
                continue;
            }

            // Deactivate if past player
            if (mesh.position.z > 25 || data.life > 8) {
                data.active = false;
                mesh.visible = false;
            }

            // Update inner glow
            const inner = mesh.children[1];
            if (inner && inner.material) {
                inner.material.emissiveIntensity = 4 + Math.sin(time * 10 + data.spinPhase) * 2;
            }
        }
    });

    return (
        <group ref={groupRef}>
            {Array.from({ length: MAX_POWERUPS }, (_, i) => (
                <group key={i} visible={false}>
                    {/* Outer ring — cyan */}
                    <mesh>
                        <torusGeometry args={[1.0, 0.15, 8, 16]} />
                        <meshStandardMaterial
                            color="#00ffff"
                            emissive="#00ffff"
                            emissiveIntensity={3}
                            transparent
                            opacity={0.8}
                            blending={THREE.AdditiveBlending}
                        />
                    </mesh>
                    {/* Inner core — bright green */}
                    <mesh>
                        <octahedronGeometry args={[0.5, 0]} />
                        <meshStandardMaterial
                            color="#00ff88"
                            emissive="#00ff44"
                            emissiveIntensity={5}
                        />
                    </mesh>
                    {/* Arrow indicator — up chevron */}
                    <mesh position={[0, 1.4, 0]}>
                        <coneGeometry args={[0.3, 0.6, 4]} />
                        <meshStandardMaterial
                            color="#00ffaa"
                            emissive="#00ff66"
                            emissiveIntensity={4}
                            transparent
                            opacity={0.9}
                            blending={THREE.AdditiveBlending}
                        />
                    </mesh>
                    <pointLight color="#00ff88" distance={10} intensity={2} />
                </group>
            ))}
        </group>
    );
}
