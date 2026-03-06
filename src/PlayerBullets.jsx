import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { gameState } from './GameState';

const MAX_BULLETS = 80;
const BULLET_SPEED = 250;
const BULLET_MAX_DIST = 500;

export function PlayerBullets() {
    const groupRef = useRef();

    const bulletData = useMemo(() => {
        return Array.from({ length: MAX_BULLETS }, (_, i) => ({
            id: i,
            active: false,
            velocity: new THREE.Vector3(0, 0, -BULLET_SPEED),
            spawnZ: 0,
        }));
    }, []);

    useFrame((state, delta) => {
        if (!groupRef.current) return;

        const children = groupRef.current.children;
        const time = state.clock.elapsedTime;

        // Process queued bullet spawns
        while (gameState.bulletQueue.length > 0 && findInactive() !== -1) {
            const spawn = gameState.bulletQueue.shift();
            const idx = findInactive();
            if (idx === -1) break;

            const data = bulletData[idx];
            const mesh = children[idx];

            data.active = true;
            data.spawnZ = spawn.z;
            mesh.position.set(spawn.x, spawn.y, spawn.z - 1.5);
            // Support angled shots via dx
            const dx = spawn.dx || 0;
            data.velocity.set(dx * BULLET_SPEED, 0, -BULLET_SPEED);
            mesh.visible = true;
        }

        // Update active bullets
        for (let i = 0; i < MAX_BULLETS; i++) {
            const data = bulletData[i];
            const mesh = children[i];

            if (!data.active) {
                mesh.visible = false;
                gameState.removeBullet(data.id);
                continue;
            }

            mesh.position.addScaledVector(data.velocity, delta);

            // Deactivate if too far
            if (mesh.position.z < data.spawnZ - BULLET_MAX_DIST) {
                data.active = false;
                mesh.visible = false;
                gameState.removeBullet(data.id);
                continue;
            }

            // Check collision with enemies (radius scaled for bigger enemies)
            let hitEnemy = false;
            gameState.enemyPositions.forEach((enemy, enemyId) => {
                if (hitEnemy) return;
                const dist = mesh.position.distanceTo(enemy.pos);
                if (dist < 8.0) {
                    hitEnemy = true;
                    window.dispatchEvent(new CustomEvent('enemy-hit', { detail: { enemyId } }));
                    data.active = false;
                    mesh.visible = false;
                    gameState.removeBullet(data.id);
                }
            });

            if (data.active) {
                gameState.updateBulletPosition(data.id, mesh.position);

                // Pulsing glow
                const glow = mesh.children[0];
                if (glow && glow.material) {
                    glow.material.emissiveIntensity = 4 + Math.sin(time * 30) * 2;
                }
            }
        }

        function findInactive() {
            for (let i = 0; i < MAX_BULLETS; i++) {
                if (!bulletData[i].active) return i;
            }
            return -1;
        }
    });

    return (
        <group ref={groupRef}>
            {Array.from({ length: MAX_BULLETS }, (_, i) => (
                <group key={i} visible={false}>
                    {/* Glowing bullet core — bigger */}
                    <mesh>
                        <cylinderGeometry args={[0.15, 0.15, 2.5, 6]} />
                        <meshStandardMaterial
                            color="#00ffff"
                            emissive="#00ffff"
                            emissiveIntensity={6}
                            transparent
                            opacity={0.9}
                            blending={THREE.AdditiveBlending}
                        />
                    </mesh>
                    {/* Wider glow halo — bigger */}
                    <mesh>
                        <cylinderGeometry args={[0.3, 0.3, 2, 6]} />
                        <meshStandardMaterial
                            color="#0088ff"
                            emissive="#0066ff"
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
