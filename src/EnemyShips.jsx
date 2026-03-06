import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { engine } from './AudioEngine';
import { gameState } from './GameState';

const MAX_ENEMIES = 6;
const SPAWN_INTERVAL = 8;
const ENEMY_SPEED = 25;

export function EnemyShips() {
    const groupRef = useRef();
    const spawnTimer = useRef(3);
    const flashTimers = useRef(new Array(MAX_ENEMIES).fill(0));

    // Per-enemy fire cooldown (prevents spamming on every beat)
    const fireCooldowns = useRef(new Array(MAX_ENEMIES).fill(0));

    const enemyData = useMemo(() => {
        return Array.from({ length: MAX_ENEMIES }, (_, i) => ({
            id: i,
            active: false,
            health: 3,
            maxHealth: 3,
            speed: ENEMY_SPEED + Math.random() * 10,
            strafePhase: Math.random() * Math.PI * 2,
            strafeSpeed: 0.5 + Math.random() * 0.5,
            strafeRadius: 5 + Math.random() * 10,
        }));
    }, []);

    useEffect(() => {
        const onHit = (e) => {
            const { enemyId } = e.detail;
            const data = enemyData[enemyId];
            if (!data || !data.active) return;

            data.health -= 1;
            flashTimers.current[enemyId] = 0.15;

            if (data.health <= 0) {
                const mesh = groupRef.current?.children[enemyId];
                const pos = mesh ? mesh.position.clone() : null;
                data.active = false;
                gameState.removeEnemy(data.id);
                gameState.enemyDestroyed(pos);
            }
        };
        window.addEventListener('enemy-hit', onHit);
        return () => window.removeEventListener('enemy-hit', onHit);
    }, [enemyData]);

    const spawnEnemy = (mesh, data) => {
        const spreadX = (Math.random() - 0.5) * 60;
        const spreadY = (Math.random() - 0.5) * 30;
        const spawnZ = -350 - Math.random() * 100;

        mesh.position.set(spreadX, spreadY, spawnZ);
        data.active = true;
        data.health = data.maxHealth;
        data.speed = ENEMY_SPEED + Math.random() * 10 + (gameState.wave - 1) * 3;
        data.strafePhase = Math.random() * Math.PI * 2;
        flashTimers.current[data.id] = 0;
        fireCooldowns.current[data.id] = 1.0; // don't fire immediately after spawning
    };

    useFrame((state, delta) => {
        if (!groupRef.current) return;
        if (gameState.health <= 0) return;

        const time = state.clock.elapsedTime;
        const children = groupRef.current.children;
        const isBeat = engine.isBeat;
        const edmState = engine.currentState;

        // Spawn timer
        spawnTimer.current += delta;
        const interval = Math.max(SPAWN_INTERVAL - (gameState.wave - 1) * 0.8, 3);
        if (spawnTimer.current >= interval) {
            spawnTimer.current = 0;
            for (let i = 0; i < MAX_ENEMIES; i++) {
                if (!enemyData[i].active) {
                    spawnEnemy(children[i], enemyData[i]);
                    break;
                }
            }
        }

        for (let i = 0; i < MAX_ENEMIES; i++) {
            const mesh = children[i];
            const data = enemyData[i];

            if (!data.active) {
                mesh.visible = false;
                gameState.removeEnemy(data.id);
                continue;
            }

            mesh.visible = true;

            // Fly toward player
            mesh.position.z += data.speed * delta;

            // Strafe sideways
            data.strafePhase += data.strafeSpeed * delta;
            mesh.position.x += Math.sin(data.strafePhase) * data.strafeRadius * delta;
            mesh.position.y += Math.cos(data.strafePhase * 0.7) * data.strafeRadius * 0.5 * delta;

            mesh.rotation.x = Math.PI * 0.1;

            // Reset if flew past player
            if (mesh.position.z > 25) {
                data.active = false;
                gameState.removeEnemy(data.id);
                continue;
            }

            // Report position
            gameState.updateEnemyPosition(data.id, mesh.position.clone(), data.health);

            // === FIRE MISSILES ON BEAT ===
            fireCooldowns.current[i] -= delta;
            if (isBeat && fireCooldowns.current[i] <= 0 && mesh.position.z < 0) {
                // Fire! Queue a missile spawn at this enemy's position
                gameState.missileSpawnQueue.push({
                    x: mesh.position.x,
                    y: mesh.position.y,
                    z: mesh.position.z,
                });

                // During drops, enemies fire more aggressively (shorter cooldown)
                const cooldown = edmState === 'drop' ? 0.3 : edmState === 'buildup' ? 0.5 : 0.8;
                fireCooldowns.current[i] = cooldown;

                // Visual: flash engines on fire
                flashTimers.current[i] = 0.08;
            }

            // Hit flash / fire flash effect
            if (flashTimers.current[i] > 0) {
                flashTimers.current[i] -= delta;
                const hull = mesh.children[0];
                if (hull && hull.material) {
                    hull.material.emissiveIntensity = 8;
                }
            } else {
                const hull = mesh.children[0];
                if (hull && hull.material) {
                    hull.material.emissiveIntensity = 0.5;
                }
            }

            // Pulsing engine glow — reacts to bass
            const engineL = mesh.children[3];
            const engineR = mesh.children[4];
            const bass = engine.averageBass || 0;
            const pulse = 3 + bass * 4 + Math.sin(time * 10 + i) * 1.5;
            if (engineL && engineL.material) engineL.material.emissiveIntensity = pulse;
            if (engineR && engineR.material) engineR.material.emissiveIntensity = pulse;

            // Neon strips pulse with music
            const neonTop = mesh.children[5];
            const neonBot = mesh.children[6];
            const neonPulse = 2 + bass * 3 + Math.sin(time * 6 + i * 2) * 1;
            if (neonTop && neonTop.material) neonTop.material.emissiveIntensity = neonPulse;
            if (neonBot && neonBot.material) neonBot.material.emissiveIntensity = neonPulse;
        }
    });

    return (
        <group ref={groupRef}>
            {Array.from({ length: MAX_ENEMIES }, (_, i) => (
                <group key={i} visible={false} scale={[2.2, 2.2, 2.2]}>
                    {/* [0] Hull */}
                    <mesh>
                        <boxGeometry args={[1.5, 0.3, 2.5]} />
                        <meshStandardMaterial
                            color="#331111"
                            emissive="#ff2200"
                            emissiveIntensity={0.5}
                            metalness={0.9}
                            roughness={0.2}
                        />
                    </mesh>
                    {/* [1] Left wing */}
                    <mesh position={[-1.5, 0, 0.3]} rotation={[0, 0, 0.15]}>
                        <boxGeometry args={[1.8, 0.08, 0.8]} />
                        <meshStandardMaterial color="#220000" metalness={0.9} roughness={0.3} />
                    </mesh>
                    {/* [2] Right wing */}
                    <mesh position={[1.5, 0, 0.3]} rotation={[0, 0, -0.15]}>
                        <boxGeometry args={[1.8, 0.08, 0.8]} />
                        <meshStandardMaterial color="#220000" metalness={0.9} roughness={0.3} />
                    </mesh>
                    {/* [3] Left engine */}
                    <mesh position={[-0.5, 0, 1.3]}>
                        <cylinderGeometry args={[0.15, 0.05, 0.5, 8]} />
                        <meshStandardMaterial
                            color="#ff4400"
                            emissive="#ff2200"
                            emissiveIntensity={3}
                            transparent opacity={0.8}
                            blending={THREE.AdditiveBlending}
                        />
                    </mesh>
                    {/* [4] Right engine */}
                    <mesh position={[0.5, 0, 1.3]}>
                        <cylinderGeometry args={[0.15, 0.05, 0.5, 8]} />
                        <meshStandardMaterial
                            color="#ff4400"
                            emissive="#ff2200"
                            emissiveIntensity={3}
                            transparent opacity={0.8}
                            blending={THREE.AdditiveBlending}
                        />
                    </mesh>
                    {/* [5] Top neon strip */}
                    <mesh position={[0, 0.18, 0]}>
                        <boxGeometry args={[1.6, 0.04, 0.04]} />
                        <meshStandardMaterial
                            color="#ff0000" emissive="#ff0000" emissiveIntensity={2}
                            blending={THREE.AdditiveBlending} transparent opacity={0.9}
                        />
                    </mesh>
                    {/* [6] Bottom neon strip */}
                    <mesh position={[0, -0.18, 0]}>
                        <boxGeometry args={[1.6, 0.04, 0.04]} />
                        <meshStandardMaterial
                            color="#ff4400" emissive="#ff4400" emissiveIntensity={2}
                            blending={THREE.AdditiveBlending} transparent opacity={0.9}
                        />
                    </mesh>
                    <pointLight color="#ff2200" distance={12} intensity={2} />
                </group>
            ))}
        </group>
    );
}
