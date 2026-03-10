import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { gameState } from './GameState';

const MAX_BULLETS = 30;
const BULLET_SPEED = 250;
const BULLET_MAX_DIST = 300;

// Shared geometries — created once, reused by all bullets
const _coreGeo = new THREE.CylinderGeometry(0.4, 0.4, 5, 6);
const _haloGeo = new THREE.CylinderGeometry(0.8, 0.8, 4, 6);
const _auraGeo = new THREE.CylinderGeometry(1.2, 1.2, 3, 6);

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

    useFrame((state, rawDelta) => {
        if (!groupRef.current) return;
        if (gameState.paused) return;
        const delta = Math.min(rawDelta, 0.05);

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
                continue;
            }

            mesh.position.addScaledVector(data.velocity, delta);

            if (mesh.position.z < data.spawnZ - BULLET_MAX_DIST) {
                data.active = false;
                mesh.visible = false;
                gameState.removeBullet(data.id);
                continue;
            }

            // Check collision with enemies — larger radius when shield is up
            let hitEnemy = false;
            for (const [enemyId, enemy] of gameState.enemyPositions) {
                const hitRadius = enemy.shieldHealth > 0 ? 16.0 : 8.0;
                if (mesh.position.distanceTo(enemy.pos) < hitRadius) {
                    hitEnemy = true;
                    window.dispatchEvent(new CustomEvent('enemy-hit', { detail: { enemyId } }));
                    data.active = false;
                    mesh.visible = false;
                    gameState.removeBullet(data.id);
                    break;
                }
            }

            if (data.active) {
                gameState.updateBulletPosition(data.id, mesh.position);

                // Pulsing glow on core
                const core = mesh.children[0];
                if (core && core.material) {
                    core.material.emissiveIntensity = 8 + Math.sin(time * 30) * 3;
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
                    {/* Bright inner core */}
                    <mesh geometry={_coreGeo}>
                        <meshStandardMaterial
                            color="#00ffff"
                            emissive="#00ffff"
                            emissiveIntensity={10}
                            transparent
                            opacity={0.95}
                            blending={THREE.AdditiveBlending}
                        />
                    </mesh>
                    {/* Wide glow halo */}
                    <mesh geometry={_haloGeo}>
                        <meshStandardMaterial
                            color="#0088ff"
                            emissive="#0066ff"
                            emissiveIntensity={5}
                            transparent
                            opacity={0.5}
                            blending={THREE.AdditiveBlending}
                            depthWrite={false}
                        />
                    </mesh>
                    {/* Outer aura */}
                    <mesh geometry={_auraGeo}>
                        <meshStandardMaterial
                            color="#4400ff"
                            emissive="#2200ff"
                            emissiveIntensity={2}
                            transparent
                            opacity={0.2}
                            blending={THREE.AdditiveBlending}
                            depthWrite={false}
                        />
                    </mesh>
                </group>
            ))}
        </group>
    );
}
