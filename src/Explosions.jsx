import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { gameState } from './GameState';

const MAX_EXPLOSIONS = 8;
const PARTICLES_PER = 12;
const TOTAL_PARTICLES = MAX_EXPLOSIONS * PARTICLES_PER;

// Shield hit bursts — smaller, faster, gold
const MAX_SHIELD_HITS = 10;
const SHIELD_PARTICLES_PER = 5;
const TOTAL_SHIELD_PARTICLES = MAX_SHIELD_HITS * SHIELD_PARTICLES_PER;

// Shared geometries
const _explosionGeo = new THREE.IcosahedronGeometry(0.8, 0);
const _shieldHitGeo = new THREE.IcosahedronGeometry(0.5, 0);

// Color palettes
const ENEMY_COLORS = [
    new THREE.Color('#ff4400'),
    new THREE.Color('#ff8800'),
    new THREE.Color('#ffcc00'),
    new THREE.Color('#ff0044'),
    new THREE.Color('#ff6600'),
    new THREE.Color('#ffff00'),
];

const PLAYER_COLORS = [
    new THREE.Color('#00ffff'),
    new THREE.Color('#0088ff'),
    new THREE.Color('#ff00ff'),
    new THREE.Color('#ff007f'),
    new THREE.Color('#8800ff'),
    new THREE.Color('#00ff88'),
];

const SHIELD_COLORS = [
    new THREE.Color('#ffcc00'),
    new THREE.Color('#ff8800'),
    new THREE.Color('#ffee44'),
    new THREE.Color('#ffaa00'),
];

export function Explosions() {
    const groupRef = useRef();
    const shieldGroupRef = useRef();

    // --- Death/Hit explosions ---
    const explosionData = useMemo(() => {
        return Array.from({ length: MAX_EXPLOSIONS }, () => ({
            active: false,
            life: 0,
            maxLife: 1.5,
            origin: new THREE.Vector3(),
            isPlayer: false,
            particles: Array.from({ length: PARTICLES_PER }, () => ({
                pos: new THREE.Vector3(),
                vel: new THREE.Vector3(),
                color: new THREE.Color(),
                scale: 1,
                baseSpeed: 0,
            })),
        }));
    }, []);

    // --- Shield hit bursts ---
    const shieldHitData = useMemo(() => {
        return Array.from({ length: MAX_SHIELD_HITS }, () => ({
            active: false,
            life: 0,
            maxLife: 0.4,
            particles: Array.from({ length: SHIELD_PARTICLES_PER }, () => ({
                pos: new THREE.Vector3(),
                vel: new THREE.Vector3(),
                color: new THREE.Color(),
                scale: 1,
            })),
        }));
    }, []);

    const spawnExplosion = (x, y, z, isPlayer) => {
        for (let e = 0; e < MAX_EXPLOSIONS; e++) {
            if (!explosionData[e].active) {
                const exp = explosionData[e];
                exp.active = true;
                exp.life = 0;
                exp.maxLife = isPlayer ? 1.8 : 1.0;
                exp.origin.set(x, y, z);
                exp.isPlayer = isPlayer;

                const colors = isPlayer ? PLAYER_COLORS : ENEMY_COLORS;
                const speed = isPlayer ? 100 : 60;

                for (let p = 0; p < PARTICLES_PER; p++) {
                    const part = exp.particles[p];
                    part.pos.set(x, y, z);
                    const theta = Math.random() * Math.PI * 2;
                    const phi = Math.acos(2 * Math.random() - 1);
                    const spd = speed * (0.3 + Math.random() * 0.7);
                    part.vel.set(
                        Math.sin(phi) * Math.cos(theta) * spd,
                        Math.sin(phi) * Math.sin(theta) * spd,
                        Math.cos(phi) * spd
                    );
                    part.color.copy(colors[Math.floor(Math.random() * colors.length)]);
                    part.scale = isPlayer ? 3.0 + Math.random() * 4 : 2.0 + Math.random() * 3;
                    part.baseSpeed = spd;
                }
                return;
            }
        }
    };

    const spawnShieldHit = (x, y, z) => {
        for (let e = 0; e < MAX_SHIELD_HITS; e++) {
            if (!shieldHitData[e].active) {
                const hit = shieldHitData[e];
                hit.active = true;
                hit.life = 0;
                hit.maxLife = 0.4;

                for (let p = 0; p < SHIELD_PARTICLES_PER; p++) {
                    const part = hit.particles[p];
                    part.pos.set(x, y, z);
                    const theta = Math.random() * Math.PI * 2;
                    const phi = Math.acos(2 * Math.random() - 1);
                    const spd = 30 + Math.random() * 40;
                    part.vel.set(
                        Math.sin(phi) * Math.cos(theta) * spd,
                        Math.sin(phi) * Math.sin(theta) * spd,
                        Math.cos(phi) * spd
                    );
                    part.color.copy(SHIELD_COLORS[Math.floor(Math.random() * SHIELD_COLORS.length)]);
                    part.scale = 0.8 + Math.random() * 1.2;
                }
                return;
            }
        }
    };

    useEffect(() => {
        const onPlayerExplode = () => {
            const pos = gameState.shipPosition;
            spawnExplosion(pos.x, pos.y, pos.z, true);
        };
        window.addEventListener('ship-explosion', onPlayerExplode);

        const onEnemyDeath = (e) => {
            if (e.detail && e.detail.position) {
                const p = e.detail.position;
                spawnExplosion(p.x, p.y, p.z, false);
            }
        };
        window.addEventListener('enemy-explosion', onEnemyDeath);

        const onShieldHit = (e) => {
            if (e.detail && e.detail.position) {
                const p = e.detail.position;
                spawnShieldHit(p.x, p.y, p.z);
            }
        };
        window.addEventListener('shield-hit', onShieldHit);

        return () => {
            window.removeEventListener('ship-explosion', onPlayerExplode);
            window.removeEventListener('enemy-explosion', onEnemyDeath);
            window.removeEventListener('shield-hit', onShieldHit);
        };
    }, []);

    useFrame((state, rawDelta) => {
        const delta = Math.min(rawDelta, 0.05);

        // --- Update death/hit explosions ---
        if (groupRef.current) {
            let meshIdx = 0;
            const children = groupRef.current.children;

            for (let e = 0; e < MAX_EXPLOSIONS; e++) {
                const exp = explosionData[e];

                if (!exp.active) {
                    for (let p = 0; p < PARTICLES_PER; p++) {
                        if (children[meshIdx]) children[meshIdx].visible = false;
                        meshIdx++;
                    }
                    continue;
                }

                exp.life += delta;
                if (exp.life >= exp.maxLife) {
                    exp.active = false;
                    for (let p = 0; p < PARTICLES_PER; p++) {
                        if (children[meshIdx]) children[meshIdx].visible = false;
                        meshIdx++;
                    }
                    continue;
                }

                const progress = exp.life / exp.maxLife;
                const fadeOut = 1 - progress;
                const drag = Math.pow(0.96, delta * 60);

                for (let p = 0; p < PARTICLES_PER; p++) {
                    const part = exp.particles[p];
                    const mesh = children[meshIdx];

                    if (mesh) {
                        part.vel.multiplyScalar(drag);
                        part.pos.addScaledVector(part.vel, delta);

                        mesh.position.copy(part.pos);
                        mesh.visible = true;

                        const s = part.scale * fadeOut;
                        mesh.scale.setScalar(Math.max(s, 0.01));

                        if (mesh.material) {
                            mesh.material.color.copy(part.color);
                            mesh.material.emissive.copy(part.color);
                            mesh.material.opacity = fadeOut * 0.95;
                            mesh.material.emissiveIntensity = 5 + (1 - progress) * 8;
                        }
                    }
                    meshIdx++;
                }
            }
        }

        // --- Update shield hit bursts ---
        if (shieldGroupRef.current) {
            let meshIdx = 0;
            const children = shieldGroupRef.current.children;

            for (let e = 0; e < MAX_SHIELD_HITS; e++) {
                const hit = shieldHitData[e];

                if (!hit.active) {
                    for (let p = 0; p < SHIELD_PARTICLES_PER; p++) {
                        if (children[meshIdx]) children[meshIdx].visible = false;
                        meshIdx++;
                    }
                    continue;
                }

                hit.life += delta;
                if (hit.life >= hit.maxLife) {
                    hit.active = false;
                    for (let p = 0; p < SHIELD_PARTICLES_PER; p++) {
                        if (children[meshIdx]) children[meshIdx].visible = false;
                        meshIdx++;
                    }
                    continue;
                }

                const progress = hit.life / hit.maxLife;
                const fadeOut = 1 - progress;
                const drag = Math.pow(0.93, delta * 60);

                for (let p = 0; p < SHIELD_PARTICLES_PER; p++) {
                    const part = hit.particles[p];
                    const mesh = children[meshIdx];

                    if (mesh) {
                        part.vel.multiplyScalar(drag);
                        part.pos.addScaledVector(part.vel, delta);

                        mesh.position.copy(part.pos);
                        mesh.visible = true;

                        const s = part.scale * fadeOut;
                        mesh.scale.setScalar(Math.max(s, 0.01));

                        if (mesh.material) {
                            mesh.material.color.copy(part.color);
                            mesh.material.emissive.copy(part.color);
                            mesh.material.opacity = fadeOut * 0.9;
                            mesh.material.emissiveIntensity = 6 + fadeOut * 6;
                        }
                    }
                    meshIdx++;
                }
            }
        }
    });

    return (
        <>
            {/* Death/hit explosion particles */}
            <group ref={groupRef}>
                {Array.from({ length: TOTAL_PARTICLES }, (_, i) => (
                    <mesh key={i} visible={false} geometry={_explosionGeo}>
                        <meshStandardMaterial
                            color="#ffffff"
                            emissive="#ffffff"
                            emissiveIntensity={5}
                            transparent
                            opacity={0.9}
                            blending={THREE.AdditiveBlending}
                            depthWrite={false}
                        />
                    </mesh>
                ))}
            </group>

            {/* Shield hit burst particles */}
            <group ref={shieldGroupRef}>
                {Array.from({ length: TOTAL_SHIELD_PARTICLES }, (_, i) => (
                    <mesh key={i} visible={false} geometry={_shieldHitGeo}>
                        <meshStandardMaterial
                            color="#ffcc00"
                            emissive="#ff8800"
                            emissiveIntensity={6}
                            transparent
                            opacity={0.9}
                            blending={THREE.AdditiveBlending}
                            depthWrite={false}
                        />
                    </mesh>
                ))}
            </group>
        </>
    );
}
