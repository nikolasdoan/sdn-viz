import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { engine } from './AudioEngine';
import { gameState } from './GameState';

const TRAIL_LENGTH = 8;

// Shared geometries — Y2K retro-future star
const _starPointGeo = new THREE.SphereGeometry(1, 8, 8); // stretched into elongated diamond points
// center orb removed
// orbital ring removed
const _trailGeo = new THREE.SphereGeometry(0.3, 4, 4);

// Module-scope temp objects to avoid per-frame allocations
const _tempVec = new THREE.Vector3();
const _tempQuat = new THREE.Quaternion();

export function Missiles() {
    const groupRef = useRef();
    const _target = new THREE.Vector3();

    const MAX_COUNT = 20;

    const missileData = useMemo(() => {
        return Array.from({ length: MAX_COUNT }, (_, i) => ({
            id: i,
            active: false,
            velocity: new THREE.Vector3(0, 0, 70),
            baseSpeed: 60 + Math.random() * 40,
            baseTurnSpeed: 0.02 + Math.random() * 0.03,
            life: 0,
            orbitPhase: Math.random() * Math.PI * 2,
            trailPositions: Array.from({ length: TRAIL_LENGTH }, () => new THREE.Vector3(0, 0, -9999)),
            trailIndex: 0,
            trailTimer: 0,
            nearMissChecked: false,
            _collisionPos: new THREE.Vector3(),
        }));
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

    useFrame((state, rawDelta) => {
        if (!groupRef.current) return;
        if (gameState.paused) return;
        const delta = Math.min(rawDelta, 0.05);

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
            _tempVec.copy(data.velocity).normalize();
            mesh.quaternion.setFromUnitVectors(_up, _tempVec);

            // === STAR SPIN + PULSE ===
            // [0] vertical star point, [1] horizontal star point — spin around velocity axis
            const starV = mesh.children[0];
            const starH = mesh.children[1];
            const starSpin = time * 4 + data.orbitPhase;
            if (starV) starV.rotation.y = starSpin;
            if (starH) starH.rotation.y = starSpin;

            // === TRAIL UPDATE ===
            data.trailTimer += delta;
            if (data.trailTimer > 0.025) {
                data.trailTimer = 0;
                data.trailPositions[data.trailIndex].copy(mesh.position);
                data.trailIndex = (data.trailIndex + 1) % TRAIL_LENGTH;
            }

            const trailGroup = mesh.children[2];
            if (trailGroup) {
                for (let t = 0; t < TRAIL_LENGTH; t++) {
                    const trailDot = trailGroup.children[t];
                    if (trailDot) {
                        const idx = (data.trailIndex + t) % TRAIL_LENGTH;
                        const trailPos = data.trailPositions[idx];

                        trailDot.position.copy(trailPos).sub(mesh.position);
                        _tempQuat.copy(mesh.quaternion).invert();
                        trailDot.position.applyQuaternion(_tempQuat);

                        const age = t / TRAIL_LENGTH;
                        trailDot.scale.setScalar(Math.max((1 - age) * 0.7, 0.05));
                        trailDot.material.opacity = (1 - age) * 0.85;
                        trailDot.visible = trailPos.z > -9000;
                    }
                }
            }

            // Collision reporting
            if (mesh.position.z > -80 && mesh.position.z < 15) {
                data._collisionPos.copy(mesh.position);
                gameState.updateMissilePosition(data.id, data._collisionPos);
            } else {
                gameState.missilePositions.delete(data.id);
            }

            // Star point pulse — brighter on beats
            if (starV && starV.material) {
                const beatPulse = engine.isBeat ? 3 : 0;
                starV.material.emissiveIntensity = 4 + Math.sin(time * 10) * 2 + beatPulse;
            }
            if (starH && starH.material) {
                const beatPulse = engine.isBeat ? 3 : 0;
                starH.material.emissiveIntensity = 4 + Math.sin(time * 10 + 1) * 2 + beatPulse;
            }
        }
    });

    return (
        <group ref={groupRef}>
            {missileData.map((data, i) => (
                <group key={i} visible={false}>
                    {/* [0] Vertical star point — stretched sphere */}
                    <mesh geometry={_starPointGeo} scale={[0.25, 2.2, 0.25]}>
                        <meshStandardMaterial
                            color="#ffcc00"
                            emissive="#ffaa00"
                            emissiveIntensity={5}
                            transparent opacity={0.9}
                            blending={THREE.AdditiveBlending}
                        />
                    </mesh>
                    {/* [1] Horizontal star point — stretched sphere, perpendicular */}
                    <mesh geometry={_starPointGeo} scale={[2.2, 0.25, 0.25]}>
                        <meshStandardMaterial
                            color="#ffcc00"
                            emissive="#ffaa00"
                            emissiveIntensity={5}
                            transparent opacity={0.9}
                            blending={THREE.AdditiveBlending}
                        />
                    </mesh>
                    {/* [2] Trail group — glowing star trail */}
                    <group>
                        {Array.from({ length: TRAIL_LENGTH }, (_, t) => (
                            <mesh key={t} geometry={_trailGeo}>
                                <meshStandardMaterial
                                    color="#ffdd00"
                                    emissive="#ffaa00"
                                    emissiveIntensity={6}
                                    transparent opacity={0.8}
                                    blending={THREE.AdditiveBlending}
                                    depthWrite={false}
                                />
                            </mesh>
                        ))}
                    </group>
                </group>
            ))}
        </group>
    );
}
