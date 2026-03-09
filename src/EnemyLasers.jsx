import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { gameState } from './GameState';

const MAX_LASERS = 30;
const LASER_SPEED = 180;
const WAVE_SEGMENTS = 20;

const _dir = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export function EnemyLasers() {
    const groupRef = useRef();

    const laserData = useMemo(() => {
        return Array.from({ length: MAX_LASERS }, (_, i) => ({
            id: i,
            active: false,
            velocity: new THREE.Vector3(),
            life: 0,
            _collisionPos: new THREE.Vector3(),
            wigglePhase: Math.random() * Math.PI * 2,
        }));
    }, []);

    // Pre-build shared buffer geometry for the wave trail
    const waveGeo = useMemo(() => {
        const points = [];
        for (let s = 0; s < WAVE_SEGMENTS; s++) {
            points.push(new THREE.Vector3(0, 0, 0));
        }
        return new THREE.BufferGeometry().setFromPoints(points);
    }, []);

    useFrame((state, rawDelta) => {
        if (!groupRef.current) return;
        if (gameState.paused) return;
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

            _dir.set(spawn.tx - spawn.x, spawn.ty - spawn.y, spawn.tz - spawn.z).normalize();

            data.active = true;
            data.life = 0;
            data.velocity.copy(_dir).multiplyScalar(LASER_SPEED);
            mesh.position.set(spawn.x, spawn.y, spawn.z);
            mesh.visible = true;

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

            if (mesh.position.z > 20 || data.life > 3) {
                data.active = false;
                mesh.visible = false;
                gameState.removeEnemyLaser(data.id);
                continue;
            }

            // Pulsing glow on core [0]
            const core = mesh.children[0];
            if (core && core.material) {
                core.material.emissiveIntensity = 8 + Math.sin(time * 40 + i) * 4;
            }

            // Wiggling wave trail [2] — update vertex positions
            const waveLine = mesh.children[2];
            if (waveLine && waveLine.geometry) {
                const posAttr = waveLine.geometry.attributes.position;
                for (let s = 0; s < WAVE_SEGMENTS; s++) {
                    const t = s / (WAVE_SEGMENTS - 1);
                    const yPos = -3 - t * 10;
                    const amplitude = (1 - t * 0.6) * 1.4;
                    const xPos = Math.sin(time * 20 + t * 12 + data.wigglePhase) * amplitude;
                    posAttr.setXYZ(s, xPos, yPos, 0);
                }
                posAttr.needsUpdate = true;
            }

            // Collision reporting
            if (mesh.position.z > -50 && mesh.position.z < 15) {
                data._collisionPos.copy(mesh.position);
                gameState.updateEnemyLaserPosition(data.id, data._collisionPos);
            } else {
                gameState.removeEnemyLaser(data.id);
            }
        }
    });

    return (
        <group ref={groupRef}>
            {Array.from({ length: MAX_LASERS }, (_, i) => (
                <group key={i} visible={false}>
                    {/* [0] Laser bolt core — bright red */}
                    <mesh>
                        <cylinderGeometry args={[0.15, 0.15, 6, 6]} />
                        <meshStandardMaterial
                            color="#ff3300"
                            emissive="#ff2200"
                            emissiveIntensity={10}
                            transparent
                            opacity={0.95}
                            blending={THREE.AdditiveBlending}
                        />
                    </mesh>
                    {/* [1] Outer glow — wider */}
                    <mesh>
                        <cylinderGeometry args={[0.35, 0.35, 5, 6]} />
                        <meshStandardMaterial
                            color="#ff6600"
                            emissive="#ff4400"
                            emissiveIntensity={4}
                            transparent
                            opacity={0.3}
                            blending={THREE.AdditiveBlending}
                            depthWrite={false}
                        />
                    </mesh>
                    {/* [2] Wiggling wave trail line */}
                    <line geometry={waveGeo.clone()}>
                        <lineBasicMaterial
                            color="#ff4400"
                            transparent
                            opacity={0.8}
                            blending={THREE.AdditiveBlending}
                            depthWrite={false}
                            linewidth={1}
                        />
                    </line>
                </group>
            ))}
        </group>
    );
}
