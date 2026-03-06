import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { gameState } from './GameState';

const MAX_LASERS = 60;
const LASER_SPEED = 180;

export function EnemyLasers() {
    const groupRef = useRef();

    const laserData = useMemo(() => {
        return Array.from({ length: MAX_LASERS }, (_, i) => ({
            id: i,
            active: false,
            velocity: new THREE.Vector3(),
            life: 0,
        }));
    }, []);

    const _dir = new THREE.Vector3();
    const _up = new THREE.Vector3(0, 1, 0);

    useFrame((state, rawDelta) => {
        if (!groupRef.current) return;
        const delta = Math.min(rawDelta, 0.05);

        const children = groupRef.current.children;
        const time = state.clock.elapsedTime;

        // Consume laser spawn queue
        while (gameState.enemyLaserQueue.length > 0) {
            let idx = -1;
            for (let i = 0; i < MAX_LASERS; i++) {
                if (!laserData[i].active) { idx = i; break; }
            }
            if (idx === -1) break;

            const spawn = gameState.enemyLaserQueue.shift();
            const data = laserData[idx];
            const mesh = children[idx];

            // Direction toward player's position at fire time
            _dir.set(spawn.tx - spawn.x, spawn.ty - spawn.y, spawn.tz - spawn.z).normalize();

            data.active = true;
            data.life = 0;
            data.velocity.copy(_dir).multiplyScalar(LASER_SPEED);
            mesh.position.set(spawn.x, spawn.y, spawn.z);
            mesh.visible = true;

            // Orient laser bolt along velocity
            mesh.quaternion.setFromUnitVectors(_up, _dir);
        }

        // Update active lasers
        for (let i = 0; i < MAX_LASERS; i++) {
            const data = laserData[i];
            const mesh = children[i];

            if (!data.active) {
                mesh.visible = false;
                gameState.removeEnemyLaser(data.id);
                continue;
            }

            data.life += delta;
            mesh.position.addScaledVector(data.velocity, delta);

            // Deactivate if too far or past player
            if (mesh.position.z > 20 || data.life > 3) {
                data.active = false;
                mesh.visible = false;
                gameState.removeEnemyLaser(data.id);
                continue;
            }

            // Pulsing glow
            const core = mesh.children[0];
            if (core && core.material) {
                core.material.emissiveIntensity = 5 + Math.sin(time * 40 + i) * 2;
            }

            // Report position for collision
            if (mesh.position.z > -50 && mesh.position.z < 15) {
                gameState.updateEnemyLaserPosition(data.id, mesh.position.clone());
            } else {
                gameState.removeEnemyLaser(data.id);
            }
        }
    });

    return (
        <group ref={groupRef}>
            {Array.from({ length: MAX_LASERS }, (_, i) => (
                <group key={i} visible={false}>
                    {/* Laser bolt core — red/orange */}
                    <mesh>
                        <cylinderGeometry args={[0.12, 0.12, 3, 4]} />
                        <meshStandardMaterial
                            color="#ff3300"
                            emissive="#ff2200"
                            emissiveIntensity={6}
                            transparent
                            opacity={0.95}
                            blending={THREE.AdditiveBlending}
                        />
                    </mesh>
                    {/* Outer glow */}
                    <mesh>
                        <cylinderGeometry args={[0.25, 0.25, 2.5, 4]} />
                        <meshStandardMaterial
                            color="#ff6600"
                            emissive="#ff4400"
                            emissiveIntensity={3}
                            transparent
                            opacity={0.4}
                            blending={THREE.AdditiveBlending}
                            depthWrite={false}
                        />
                    </mesh>
                </group>
            ))}
        </group>
    );
}
