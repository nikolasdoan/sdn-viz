import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { engine } from './AudioEngine';
import { gameState } from './GameState';

const TRAIL_LENGTH = 20;

export function Missiles() {
    const groupRef = useRef();
    const _target = new THREE.Vector3();

    const MAX_COUNT = 30;

    const missileData = useMemo(() => {
        return Array.from({ length: MAX_COUNT }, (_, i) => {
            const bodyGeo = new THREE.CylinderGeometry(0.35, 0.6, 4, 8);
            const noseGeo = new THREE.SphereGeometry(0.55, 8, 8);
            const orbitGeo = new THREE.SphereGeometry(0.25, 6, 6);

            return {
                id: i,
                active: false,
                velocity: new THREE.Vector3(0, 0, 70),
                baseSpeed: 60 + Math.random() * 40,
                baseTurnSpeed: 0.02 + Math.random() * 0.03,
                life: 0,
                orbitPhase: Math.random() * Math.PI * 2,
                bodyGeo,
                noseGeo,
                orbitGeo,
                trailPositions: Array.from({ length: TRAIL_LENGTH }, () => new THREE.Vector3(0, 0, -9999)),
                trailIndex: 0,
                trailTimer: 0,
                nearMissChecked: false,
            };
        });
    }, []);

    const _dir = new THREE.Vector3();
    const _up = new THREE.Vector3(0, 1, 0);


    const _spawnDir = new THREE.Vector3();

    const spawnMissile = (mesh, data, x, y, z) => {
        mesh.position.set(x, y, z);
        const speed = data.baseSpeed * gameState.getWaveSpeedMultiplier();
        // Aim toward player from spawn position
        _spawnDir.copy(gameState.shipPosition).sub(mesh.position).normalize();
        data.velocity.copy(_spawnDir).multiplyScalar(speed);
        data.active = true;
        data.life = 0;
        data.nearMissChecked = false;

        for (let t = 0; t < TRAIL_LENGTH; t++) {
            data.trailPositions[t].set(0, 0, -9999);
        }
        data.trailIndex = 0;
        data.trailTimer = 0;
    };

    const findInactive = () => {
        for (let i = 0; i < MAX_COUNT; i++) {
            if (!missileData[i].active) return i;
        }
        return -1;
    };

    useFrame((state, delta) => {
        if (!groupRef.current) return;

        const time = state.clock.elapsedTime;
        const bass = engine.averageBass || 0;
        const speedMult = gameState.getWaveSpeedMultiplier();
        const homingMult = gameState.getWaveHomingMultiplier();
        const children = groupRef.current.children;

        _target.copy(gameState.shipPosition);

        // === CONSUME MISSILE SPAWN QUEUE (from enemy ships firing on beat) ===
        while (gameState.missileSpawnQueue.length > 0) {
            const spawn = gameState.missileSpawnQueue.shift();
            const idx = findInactive();
            if (idx === -1) break;
            spawnMissile(children[idx], missileData[idx], spawn.x, spawn.y, spawn.z);
        }

        // === UPDATE ALL ACTIVE MISSILES ===
        for (let i = 0; i < MAX_COUNT; i++) {
            const mesh = children[i];
            const data = missileData[i];

            if (!data.active) {
                mesh.visible = false;
                gameState.missilePositions.delete(data.id);
                continue;
            }

            mesh.visible = true;
            data.life += delta;

            // Reset if missile flew past the player
            if (mesh.position.z > 20) {
                if (!data.nearMissChecked) {
                    data.nearMissChecked = true;
                    gameState.checkNearMiss(mesh.position);
                }
                data.active = false;
                mesh.visible = false;
                gameState.missilePositions.delete(data.id);
                continue;
            }

            // Direction to player
            _dir.copy(_target).sub(mesh.position).normalize();

            // Homing — ramps up after initial straight flight, scales with waves
            const baseHoming = data.life > 0.6
                ? Math.min(data.baseTurnSpeed * 0.8 * homingMult, 0.04)
                : 0;

            const speed = data.baseSpeed * speedMult + bass * 30;
            data.velocity.normalize().lerp(_dir, baseHoming).normalize().multiplyScalar(speed);

            mesh.position.addScaledVector(data.velocity, delta);

            // Orient to face velocity
            mesh.quaternion.setFromUnitVectors(_up, data.velocity.clone().normalize());

            // === TWIRLING ORBIT LIGHTS ===
            const orbitA = mesh.children[3];
            const orbitB = mesh.children[4];
            if (orbitA && orbitB) {
                const orbitRadius = 1.2;
                const phase = time * 8 + data.orbitPhase;

                orbitA.position.set(
                    Math.cos(phase) * orbitRadius,
                    Math.sin(phase * 0.7) * 0.5,
                    Math.sin(phase) * orbitRadius
                );
                orbitB.position.set(
                    Math.cos(phase + Math.PI) * orbitRadius,
                    Math.sin((phase + Math.PI) * 0.7) * 0.5,
                    Math.sin(phase + Math.PI) * orbitRadius
                );

                // Pulse brighter on beats
                const beatBoost = engine.isBeat ? 4 : 0;
                const pulse = 3.0 + Math.sin(time * 15 + data.orbitPhase) * 2.0 + beatBoost;
                orbitA.material.emissiveIntensity = pulse;
                orbitB.material.emissiveIntensity = pulse;
            }

            // === TRAIL UPDATE ===
            data.trailTimer += delta;
            if (data.trailTimer > 0.03) {
                data.trailTimer = 0;
                data.trailPositions[data.trailIndex].copy(mesh.position);
                data.trailIndex = (data.trailIndex + 1) % TRAIL_LENGTH;
            }

            const trailGroup = mesh.children[5];
            if (trailGroup) {
                for (let t = 0; t < TRAIL_LENGTH; t++) {
                    const trailDot = trailGroup.children[t];
                    if (trailDot) {
                        const idx = (data.trailIndex + t) % TRAIL_LENGTH;
                        const trailPos = data.trailPositions[idx];

                        trailDot.position.copy(trailPos).sub(mesh.position);
                        trailDot.position.applyQuaternion(mesh.quaternion.clone().invert());

                        const age = t / TRAIL_LENGTH;
                        trailDot.scale.setScalar(Math.max((1 - age) * 0.6, 0.05));
                        trailDot.material.opacity = (1 - age) * 0.8;
                        trailDot.visible = trailPos.z > -9000;
                    }
                }
            }

            // Collision reporting
            if (mesh.position.z > -80 && mesh.position.z < 15) {
                gameState.updateMissilePosition(data.id, mesh.position.clone());
            } else {
                gameState.missilePositions.delete(data.id);
            }

            // Warhead pulse — brighter on beats
            const warhead = mesh.children[1];
            if (warhead && warhead.material) {
                const beatPulse = engine.isBeat ? 5 : 0;
                warhead.material.emissiveIntensity = 3.0 + Math.sin(time * 12) * 2.0 + beatPulse;
            }
        }
    });

    return (
        <group ref={groupRef}>
            {missileData.map((data, i) => (
                <group key={i} visible={false}>
                    {/* [0] Body — dark with gold tint */}
                    <mesh geometry={data.bodyGeo}>
                        <meshStandardMaterial color="#1a1400" emissive="#332200" emissiveIntensity={0.5} metalness={0.9} roughness={0.1} />
                    </mesh>
                    {/* [1] Glowing Nose / Warhead — bright yellow */}
                    <mesh geometry={data.noseGeo} position={[0, 2, 0]}>
                        <meshStandardMaterial color="#ffdd00" emissive="#ffaa00" emissiveIntensity={6} />
                    </mesh>
                    {/* [2] Engine Glow — orange fire */}
                    <mesh position={[0, -2, 0]}>
                        <cylinderGeometry args={[0.4, 0.15, 0.7, 8]} />
                        <meshStandardMaterial
                            color="#ff6600"
                            emissive="#ff4400"
                            emissiveIntensity={8}
                            transparent opacity={0.9}
                            blending={THREE.AdditiveBlending}
                        />
                    </mesh>
                    {/* [3] Orbit Light A — bright yellow */}
                    <mesh geometry={data.orbitGeo}>
                        <meshStandardMaterial
                            color="#ffee00"
                            emissive="#ffdd00"
                            emissiveIntensity={6}
                            transparent opacity={0.9}
                            blending={THREE.AdditiveBlending}
                        />
                    </mesh>
                    {/* [4] Orbit Light B — warm orange */}
                    <mesh geometry={data.orbitGeo}>
                        <meshStandardMaterial
                            color="#ffaa00"
                            emissive="#ff8800"
                            emissiveIntensity={6}
                            transparent opacity={0.9}
                            blending={THREE.AdditiveBlending}
                        />
                    </mesh>
                    {/* [5] Trail group — golden exhaust */}
                    <group>
                        {Array.from({ length: TRAIL_LENGTH }, (_, t) => (
                            <mesh key={t}>
                                <sphereGeometry args={[0.35, 4, 4]} />
                                <meshStandardMaterial
                                    color="#ffcc00"
                                    emissive="#ff8800"
                                    emissiveIntensity={5}
                                    transparent opacity={0.7}
                                    blending={THREE.AdditiveBlending}
                                    depthWrite={false}
                                />
                            </mesh>
                        ))}
                    </group>
                    {/* Self-illumination so missiles are visible from distance */}
                    <pointLight color="#ffaa00" distance={15} intensity={2} />
                </group>
            ))}
        </group>
    );
}
