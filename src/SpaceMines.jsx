import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { engine } from './AudioEngine';
import { gameState } from './GameState';

const MAX_MINES = 15;
const MINE_DRIFT_SPEED = 25;

// Shared geometries — spiky bomb shape
const _bodyGeo = new THREE.SphereGeometry(1.2, 8, 8); // round central body
const _spikeGeo = new THREE.ConeGeometry(0.45, 1.8, 5); // chunky rounded spikes
const _tipGeo = new THREE.ConeGeometry(0.2, 0.4, 5); // pointed spike tips
// glow and core spheres removed

// Spike directions — 8 spikes radiating outward like the reference image
const SPIKE_DIRS = [
    [0, 1, 0],       // top
    [0, -1, 0],      // bottom
    [1, 0, 0],       // right
    [-1, 0, 0],      // left
    [0, 0, 1],       // front
    [0, 0, -1],      // back
    [0.7, 0.7, 0],   // top-right diagonal
    [-0.7, -0.7, 0], // bottom-left diagonal
];

const _tempVec = new THREE.Vector3();

export function SpaceMines() {
    const groupRef = useRef();

    const mineData = useMemo(() => {
        return Array.from({ length: MAX_MINES }, (_, i) => ({
            id: i,
            active: false,
            life: 0,
            spinPhase: Math.random() * Math.PI * 2,
            _collisionPos: new THREE.Vector3(),
        }));
    }, []);

    useFrame((state, rawDelta) => {
        if (!groupRef.current) return;
        if (gameState.paused) return;
        const delta = Math.min(rawDelta, 0.05);
        const time = state.clock.elapsedTime;
        const bass = engine.averageBass || 0;
        const children = groupRef.current.children;

        // Consume mine spawn queue
        while (gameState.mineSpawnQueue.length > 0) {
            let idx = -1;
            for (let i = 0; i < MAX_MINES; i++) {
                if (!mineData[i].active) { idx = i; break; }
            }
            if (idx === -1) break;

            const spawn = gameState.mineSpawnQueue.shift();
            const data = mineData[idx];
            const mesh = children[idx];

            data.active = true;
            data.life = 0;
            mesh.position.set(spawn.x, spawn.y, spawn.z);
            mesh.visible = true;
        }

        // Update active mines
        for (let i = 0; i < MAX_MINES; i++) {
            const data = mineData[i];
            const mesh = children[i];

            if (!data.active) {
                mesh.visible = false;
                gameState.removeMine(data.id);
                continue;
            }

            data.life += delta;

            // Drift toward player slowly
            _tempVec.copy(gameState.shipPosition).sub(mesh.position).normalize();
            mesh.position.addScaledVector(_tempVec, MINE_DRIFT_SPEED * delta * 0.3);
            // Also drift forward (toward player z)
            mesh.position.z += MINE_DRIFT_SPEED * delta;

            // Slow tumble
            mesh.rotation.x += delta * 0.8;
            mesh.rotation.y += delta * 1.2 + data.spinPhase * 0.01;

            // Body pulse [0] — throb with music
            const body = mesh.children[0];
            if (body && body.material) {
                body.material.emissiveIntensity = 0.6 + bass * 2 + Math.sin(time * 5 + i) * 0.5;
            }

            // Deactivate if past player or expired
            if (mesh.position.z > 20 || data.life > 12) {
                data.active = false;
                mesh.visible = false;
                gameState.removeMine(data.id);
                continue;
            }

            // Collision with player
            const dist = mesh.position.distanceTo(gameState.shipPosition);
            if (dist < 3.5) {
                // Explode!
                data.active = false;
                mesh.visible = false;
                gameState.removeMine(data.id);
                gameState.takeDamage();
                window.dispatchEvent(new CustomEvent('enemy-explosion', {
                    detail: { position: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z } }
                }));
                continue;
            }

            // Player bullets can destroy mines
            for (const [bulletId, bulletPos] of gameState.bulletPositions) {
                if (mesh.position.distanceTo(bulletPos) < 4.0) {
                    data.active = false;
                    mesh.visible = false;
                    gameState.removeMine(data.id);
                    gameState.score += 50 * gameState.combo;
                    window.dispatchEvent(new CustomEvent('enemy-explosion', {
                        detail: { position: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z } }
                    }));
                    break;
                }
            }

            // Report position
            if (data.active) {
                data._collisionPos.copy(mesh.position);
                gameState.updateMinePosition(data.id, data._collisionPos);
            }
        }
    });

    return (
        <group ref={groupRef}>
            {Array.from({ length: MAX_MINES }, (_, i) => (
                <group key={i} visible={false}>
                    {/* [0] Central body — dark round bomb */}
                    <mesh geometry={_bodyGeo}>
                        <meshStandardMaterial
                            color="#080808"
                            emissive="#ff2200"
                            emissiveIntensity={0.6}
                            metalness={0.7}
                            roughness={0.3}
                        />
                    </mesh>
                    {/* 8 spikes with rounded tips */}
                    {SPIKE_DIRS.map((dir, j) => {
                        const len = Math.sqrt(dir[0]*dir[0] + dir[1]*dir[1] + dir[2]*dir[2]);
                        const nx = dir[0]/len, ny = dir[1]/len, nz = dir[2]/len;
                        const spikeLen = 1.8;
                        const px = nx * (1.2 + spikeLen * 0.5);
                        const py = ny * (1.2 + spikeLen * 0.5);
                        const pz = nz * (1.2 + spikeLen * 0.5);
                        const tipPx = nx * (1.2 + spikeLen + 0.15);
                        const tipPy = ny * (1.2 + spikeLen + 0.15);
                        const tipPz = nz * (1.2 + spikeLen + 0.15);
                        // Rotation to point cone outward from center
                        const up = new THREE.Vector3(0, 1, 0);
                        const target = new THREE.Vector3(nx, ny, nz);
                        const quat = new THREE.Quaternion().setFromUnitVectors(up, target);
                        const euler = new THREE.Euler().setFromQuaternion(quat);
                        return (
                            <group key={j}>
                                <mesh geometry={_spikeGeo} position={[px, py, pz]} rotation={[euler.x, euler.y, euler.z]}>
                                    <meshStandardMaterial color="#0a0a0a" emissive="#ff2200" emissiveIntensity={1.2} metalness={0.8} roughness={0.3} />
                                </mesh>
                                <mesh geometry={_tipGeo} position={[tipPx, tipPy, tipPz]} rotation={[euler.x, euler.y, euler.z]}>
                                    <meshStandardMaterial color="#111111" emissive="#ff4400" emissiveIntensity={2} metalness={0.6} roughness={0.4} />
                                </mesh>
                            </group>
                        );
                    })}
                </group>
            ))}
        </group>
    );
}
