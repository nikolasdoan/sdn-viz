import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { gameState } from './GameState';

const MAX_BULLETS = 80;
const BULLET_SPEED = 250;
const BULLET_MAX_DIST = 500;
const TRAIL_LEN = 8;

export function PlayerBullets() {
    const groupRef = useRef();
    const trailGroupRef = useRef();

    const bulletData = useMemo(() => {
        return Array.from({ length: MAX_BULLETS }, (_, i) => ({
            id: i,
            active: false,
            velocity: new THREE.Vector3(0, 0, -BULLET_SPEED),
            spawnZ: 0,
            trailPositions: Array.from({ length: TRAIL_LEN }, () => new THREE.Vector3(0, 0, -9999)),
            trailIndex: 0,
            trailTimer: 0,
        }));
    }, []);

    useFrame((state, rawDelta) => {
        if (!groupRef.current || !trailGroupRef.current) return;
        const delta = Math.min(rawDelta, 0.05);

        const children = groupRef.current.children;
        const trailChildren = trailGroupRef.current.children;
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

            // Reset trail
            for (let t = 0; t < TRAIL_LEN; t++) {
                data.trailPositions[t].set(0, 0, -9999);
            }
            data.trailIndex = 0;
            data.trailTimer = 0;
        }

        // Update active bullets
        for (let i = 0; i < MAX_BULLETS; i++) {
            const data = bulletData[i];
            const mesh = children[i];

            if (!data.active) {
                mesh.visible = false;
                // Hide trail dots
                for (let t = 0; t < TRAIL_LEN; t++) {
                    const td = trailChildren[i * TRAIL_LEN + t];
                    if (td) td.visible = false;
                }
                continue;
            }

            mesh.position.addScaledVector(data.velocity, delta);

            if (mesh.position.z < data.spawnZ - BULLET_MAX_DIST) {
                data.active = false;
                mesh.visible = false;
                gameState.removeBullet(data.id);
                continue;
            }

            // Check collision with enemies — no closures
            let hitEnemy = false;
            for (const [enemyId, enemy] of gameState.enemyPositions) {
                if (mesh.position.distanceTo(enemy.pos) < 8.0) {
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

                // Trail update
                data.trailTimer += delta;
                if (data.trailTimer > 0.015) {
                    data.trailTimer = 0;
                    data.trailPositions[data.trailIndex].copy(mesh.position);
                    data.trailIndex = (data.trailIndex + 1) % TRAIL_LEN;
                }

                // Render trail dots
                for (let t = 0; t < TRAIL_LEN; t++) {
                    const td = trailChildren[i * TRAIL_LEN + t];
                    if (!td) continue;
                    const idx = (data.trailIndex + t) % TRAIL_LEN;
                    const pos = data.trailPositions[idx];
                    if (pos.z < -9000) {
                        td.visible = false;
                    } else {
                        td.visible = true;
                        td.position.copy(pos);
                        const age = t / TRAIL_LEN;
                        td.scale.setScalar(Math.max((1 - age) * 1.2, 0.1));
                        if (td.material) {
                            td.material.opacity = (1 - age) * 0.7;
                        }
                    }
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
        <>
            {/* Trail dots — world space */}
            <group ref={trailGroupRef}>
                {Array.from({ length: MAX_BULLETS * TRAIL_LEN }, (_, i) => (
                    <mesh key={i} visible={false}>
                        <sphereGeometry args={[0.4, 4, 4]} />
                        <meshStandardMaterial
                            color="#00aaff"
                            emissive="#0066ff"
                            emissiveIntensity={4}
                            transparent
                            opacity={0.6}
                            blending={THREE.AdditiveBlending}
                            depthWrite={false}
                        />
                    </mesh>
                ))}
            </group>

            {/* Bullet heads */}
            <group ref={groupRef}>
                {Array.from({ length: MAX_BULLETS }, (_, i) => (
                    <group key={i} visible={false}>
                        {/* Bright inner core — very large */}
                        <mesh>
                            <cylinderGeometry args={[0.4, 0.4, 5, 6]} />
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
                        <mesh>
                            <cylinderGeometry args={[0.8, 0.8, 4, 6]} />
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
                        <mesh>
                            <cylinderGeometry args={[1.2, 1.2, 3, 6]} />
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
                        <pointLight color="#00ccff" distance={12} intensity={2} />
                    </group>
                ))}
            </group>
        </>
    );
}
