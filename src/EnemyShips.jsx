import { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { engine } from './AudioEngine';
import { gameState } from './GameState';

const MAX_ENEMIES = 8;
const SPAWN_INTERVAL = 6;
const ENEMY_SPEED = 20;

export function EnemyShips() {
    const groupRef = useRef();
    const { camera } = useThree();
    const spawnTimer = useRef(2);
    const flashTimers = useRef(new Array(MAX_ENEMIES).fill(0));
    const fireCooldowns = useRef(new Array(MAX_ENEMIES).fill(0));
    const laserCooldowns = useRef(new Array(MAX_ENEMIES).fill(0));

    const enemyData = useMemo(() => {
        return Array.from({ length: MAX_ENEMIES }, (_, i) => ({
            id: i,
            active: false,
            health: 5,
            maxHealth: 5,
            shieldHealth: 3,
            maxShieldHealth: 3,
            speed: ENEMY_SPEED + Math.random() * 10,
            strafePhase: Math.random() * Math.PI * 2,
            strafeSpeed: 0.3 + Math.random() * 0.3,
            strafeRadius: 3 + Math.random() * 6,
        }));
    }, []);

    useEffect(() => {
        const onHit = (e) => {
            const { enemyId } = e.detail;
            const data = enemyData[enemyId];
            if (!data || !data.active) return;

            if (data.shieldHealth > 0) {
                data.shieldHealth -= 1;
                flashTimers.current[enemyId] = 0.12;
            } else {
                data.health -= 1;
                flashTimers.current[enemyId] = 0.15;
            }

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
        const spreadX = (Math.random() - 0.5) * 50;
        const spreadY = (Math.random() - 0.5) * 25;
        const spawnZ = -200 - Math.random() * 80;

        mesh.position.set(spreadX, spreadY, spawnZ);
        data.active = true;
        data.maxHealth = 5 + Math.floor((gameState.wave - 1) * 1.5);
        data.health = data.maxHealth;
        data.maxShieldHealth = 3 + Math.floor((gameState.wave - 1));
        data.shieldHealth = data.maxShieldHealth;
        data.speed = ENEMY_SPEED + Math.random() * 10 + (gameState.wave - 1) * 2;
        data.strafePhase = Math.random() * Math.PI * 2;
        flashTimers.current[data.id] = 0;
        fireCooldowns.current[data.id] = 1.0;
        laserCooldowns.current[data.id] = 2.0;
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
        const interval = Math.max(SPAWN_INTERVAL - (gameState.wave - 1) * 0.5, 2.5);
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

            // Face the player: rotate 180° around Y so cockpit points +Z
            mesh.rotation.set(0, Math.PI, 0);

            // Reset if flew past player
            if (mesh.position.z > 25) {
                data.active = false;
                gameState.removeEnemy(data.id);
                continue;
            }

            // Report position (include shield info)
            gameState.updateEnemyPosition(data.id, mesh.position.clone(), data.health, data.shieldHealth);

            // === FIRE MISSILES ON BEAT ===
            fireCooldowns.current[i] -= delta;
            const waveFactor = Math.min(gameState.wave * 0.15, 0.6); // up to 60% faster
            if (isBeat && fireCooldowns.current[i] <= 0 && mesh.position.z < 0) {
                // Fire more missiles at higher waves
                const shotsPerVolley = Math.min(1 + Math.floor((gameState.wave - 1) / 2), 3);
                for (let s = 0; s < shotsPerVolley; s++) {
                    gameState.missileSpawnQueue.push({
                        x: mesh.position.x + (s - (shotsPerVolley - 1) / 2) * 2,
                        y: mesh.position.y,
                        z: mesh.position.z,
                    });
                }

                const baseCooldown = edmState === 'drop' ? 0.3 : edmState === 'buildup' ? 0.5 : 0.8;
                fireCooldowns.current[i] = baseCooldown * (1 - waveFactor);
                flashTimers.current[i] = 0.08;
            }

            // === FIRE LASER BOLTS (between missile volleys) ===
            laserCooldowns.current[i] -= delta;
            const laserRate = edmState === 'drop' ? 0.2 : edmState === 'buildup' ? 0.4 : 0.6;
            const laserCooldown = laserRate * (1 - waveFactor * 0.5);
            if (laserCooldowns.current[i] <= 0 && mesh.position.z < -5) {
                const shipPos = gameState.shipPosition;
                gameState.enemyLaserQueue.push({
                    x: mesh.position.x,
                    y: mesh.position.y,
                    z: mesh.position.z,
                    tx: shipPos.x,
                    ty: shipPos.y,
                    tz: shipPos.z,
                });
                laserCooldowns.current[i] = laserCooldown;
            }

            // === VISUAL UPDATES ===
            const bass = engine.averageBass || 0;

            // Hit flash effect on hull [0]
            const hull = mesh.children[0];
            if (flashTimers.current[i] > 0) {
                flashTimers.current[i] -= delta;
                if (hull && hull.material) {
                    hull.material.emissiveIntensity = data.shieldHealth > 0 ? 2 : 8;
                }
            } else {
                if (hull && hull.material) {
                    hull.material.emissiveIntensity = 0.5;
                }
            }

            // Pulsing engines [5,6]
            const engineL = mesh.children[5];
            const engineR = mesh.children[6];
            const pulse = 3 + bass * 4 + Math.sin(time * 10 + i) * 1.5;
            if (engineL && engineL.material) engineL.material.emissiveIntensity = pulse;
            if (engineR && engineR.material) engineR.material.emissiveIntensity = pulse;

            // Neon strips [7,8]
            const neonTop = mesh.children[7];
            const neonBot = mesh.children[8];
            const neonPulse = 2 + bass * 3 + Math.sin(time * 6 + i * 2) * 1;
            if (neonTop && neonTop.material) neonTop.material.emissiveIntensity = neonPulse;
            if (neonBot && neonBot.material) neonBot.material.emissiveIntensity = neonPulse;

            // === SHIELD BUBBLE [9] ===
            const shield = mesh.children[9];
            if (shield) {
                if (data.shieldHealth > 0) {
                    shield.visible = true;
                    const shieldPulse = 0.3 + Math.sin(time * 3 + i) * 0.1;
                    shield.material.opacity = shieldPulse;
                    shield.rotation.y = time * 0.5;
                    shield.rotation.z = time * 0.3;
                    // Flash on recent hit
                    if (flashTimers.current[i] > 0) {
                        shield.material.opacity = 0.8;
                        shield.material.emissiveIntensity = 8;
                    } else {
                        shield.material.emissiveIntensity = 2;
                    }
                } else {
                    shield.visible = false;
                }
            }

            // === HEALTH BAR [10] — billboard group ===
            const hpBarGroup = mesh.children[10];
            if (hpBarGroup) {
                // Billboard: face camera
                hpBarGroup.lookAt(camera.position);

                const totalMax = data.maxHealth + data.maxShieldHealth;
                const totalCurrent = data.health + data.shieldHealth;

                // Hull bar [0]
                const hullBar = hpBarGroup.children[0];
                if (hullBar) {
                    const hullFrac = data.health / data.maxHealth;
                    hullBar.scale.x = Math.max(hullFrac, 0.01);
                    hullBar.position.x = -(1 - hullFrac) * 1.5;
                    // Color shifts from green to red
                    if (hullBar.material) {
                        const r = 1 - hullFrac;
                        const g = hullFrac;
                        hullBar.material.color.setRGB(r, g, 0);
                        hullBar.material.emissive.setRGB(r * 0.5, g * 0.3, 0);
                    }
                }

                // Shield bar [1]
                const shieldBar = hpBarGroup.children[1];
                if (shieldBar) {
                    if (data.shieldHealth > 0) {
                        shieldBar.visible = true;
                        const shieldFrac = data.shieldHealth / data.maxShieldHealth;
                        shieldBar.scale.x = Math.max(shieldFrac, 0.01);
                        shieldBar.position.x = -(1 - shieldFrac) * 1.5;
                    } else {
                        shieldBar.visible = false;
                    }
                }

                // Background bar always full width [2]
            }
        }
    });

    return (
        <group ref={groupRef}>
            {Array.from({ length: MAX_ENEMIES }, (_, i) => (
                <group key={i} visible={false} scale={[5, 5, 5]}>
                    {/* [0] Hull — main body */}
                    <mesh>
                        <boxGeometry args={[1.8, 0.4, 3]} />
                        <meshStandardMaterial
                            color="#331111"
                            emissive="#ff2200"
                            emissiveIntensity={0.5}
                            metalness={0.9}
                            roughness={0.2}
                        />
                    </mesh>
                    {/* [1] Left wing */}
                    <mesh position={[-1.8, 0, 0.3]} rotation={[0, 0, 0.12]}>
                        <boxGeometry args={[2, 0.1, 1]} />
                        <meshStandardMaterial color="#220000" metalness={0.9} roughness={0.3} />
                    </mesh>
                    {/* [2] Right wing */}
                    <mesh position={[1.8, 0, 0.3]} rotation={[0, 0, -0.12]}>
                        <boxGeometry args={[2, 0.1, 1]} />
                        <meshStandardMaterial color="#220000" metalness={0.9} roughness={0.3} />
                    </mesh>
                    {/* [3] Cockpit dome */}
                    <mesh position={[0, 0.3, -0.8]}>
                        <sphereGeometry args={[0.4, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
                        <meshStandardMaterial
                            color="#440000"
                            emissive="#ff0000"
                            emissiveIntensity={1}
                            metalness={0.7}
                            roughness={0.3}
                        />
                    </mesh>
                    {/* [4] Weapon turret */}
                    <mesh position={[0, -0.25, -1.2]}>
                        <cylinderGeometry args={[0.15, 0.15, 0.8, 6]} />
                        <meshStandardMaterial
                            color="#550000"
                            emissive="#ff4400"
                            emissiveIntensity={1.5}
                            metalness={0.8}
                            roughness={0.2}
                        />
                    </mesh>
                    {/* [5] Left engine */}
                    <mesh position={[-0.6, 0, 1.5]}>
                        <cylinderGeometry args={[0.2, 0.08, 0.6, 8]} />
                        <meshStandardMaterial
                            color="#ff4400"
                            emissive="#ff2200"
                            emissiveIntensity={3}
                            transparent opacity={0.8}
                            blending={THREE.AdditiveBlending}
                        />
                    </mesh>
                    {/* [6] Right engine */}
                    <mesh position={[0.6, 0, 1.5]}>
                        <cylinderGeometry args={[0.2, 0.08, 0.6, 8]} />
                        <meshStandardMaterial
                            color="#ff4400"
                            emissive="#ff2200"
                            emissiveIntensity={3}
                            transparent opacity={0.8}
                            blending={THREE.AdditiveBlending}
                        />
                    </mesh>
                    {/* [7] Top neon strip */}
                    <mesh position={[0, 0.22, 0]}>
                        <boxGeometry args={[1.9, 0.05, 0.05]} />
                        <meshStandardMaterial
                            color="#ff0000" emissive="#ff0000" emissiveIntensity={2}
                            blending={THREE.AdditiveBlending} transparent opacity={0.9}
                        />
                    </mesh>
                    {/* [8] Bottom neon strip */}
                    <mesh position={[0, -0.22, 0]}>
                        <boxGeometry args={[1.9, 0.05, 0.05]} />
                        <meshStandardMaterial
                            color="#ff4400" emissive="#ff4400" emissiveIntensity={2}
                            blending={THREE.AdditiveBlending} transparent opacity={0.9}
                        />
                    </mesh>
                    {/* [9] Shield bubble */}
                    <mesh>
                        <icosahedronGeometry args={[3.5, 1]} />
                        <meshStandardMaterial
                            color="#00ffff"
                            emissive="#00aaff"
                            emissiveIntensity={2}
                            transparent
                            opacity={0.3}
                            blending={THREE.AdditiveBlending}
                            depthWrite={false}
                            wireframe
                        />
                    </mesh>
                    {/* [10] Health bar group (billboard) */}
                    <group position={[0, 2.2, 0]}>
                        {/* Hull HP bar (red→green) */}
                        <mesh position={[0, 0, 0]}>
                            <boxGeometry args={[3, 0.2, 0.05]} />
                            <meshStandardMaterial
                                color="#00ff00"
                                emissive="#00aa00"
                                emissiveIntensity={1}
                            />
                        </mesh>
                        {/* Shield HP bar (cyan, on top) */}
                        <mesh position={[0, 0.25, 0]}>
                            <boxGeometry args={[3, 0.15, 0.05]} />
                            <meshStandardMaterial
                                color="#00ffff"
                                emissive="#00aaff"
                                emissiveIntensity={2}
                                transparent
                                opacity={0.8}
                            />
                        </mesh>
                        {/* Background bar */}
                        <mesh position={[0, 0, -0.02]}>
                            <boxGeometry args={[3.1, 0.55, 0.03]} />
                            <meshStandardMaterial
                                color="#111111"
                                transparent
                                opacity={0.6}
                            />
                        </mesh>
                    </group>
                    <pointLight color="#ff2200" distance={25} intensity={3} />
                </group>
            ))}
        </group>
    );
}
