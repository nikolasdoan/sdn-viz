import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { gameState } from './GameState';

const MAX_LASERS = 30;
const LASER_SPEED = 180;

// Shared geometries — star-comet shape
const _starPointGeo = new THREE.SphereGeometry(1, 8, 8); // stretched into 4-point star
const _tailGeo = new THREE.ConeGeometry(0.6, 8, 6); // long tapered tail
const _tailGlowGeo = new THREE.ConeGeometry(1.0, 6, 6); // outer glow tail

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

            // Star point pulse [0],[1]
            const starV = mesh.children[0];
            const starH = mesh.children[1];
            const pulse = 6 + Math.sin(time * 30 + i) * 3;
            if (starV && starV.material) starV.material.emissiveIntensity = pulse;
            if (starH && starH.material) starH.material.emissiveIntensity = pulse;

            // Spin the star head
            const spin = time * 6 + data.wigglePhase;
            if (starV) starV.rotation.y = spin;
            if (starH) starH.rotation.y = spin;

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
                    {/* [0] Vertical star point — stretched sphere */}
                    <mesh geometry={_starPointGeo} scale={[0.2, 1.5, 0.2]} position={[0, 1, 0]}>
                        <meshStandardMaterial
                            color="#ff3300"
                            emissive="#ff2200"
                            emissiveIntensity={8}
                            transparent opacity={0.9}
                            blending={THREE.AdditiveBlending}
                        />
                    </mesh>
                    {/* [1] Horizontal star point — perpendicular */}
                    <mesh geometry={_starPointGeo} scale={[1.5, 0.2, 0.2]} position={[0, 1, 0]}>
                        <meshStandardMaterial
                            color="#ff3300"
                            emissive="#ff2200"
                            emissiveIntensity={8}
                            transparent opacity={0.9}
                            blending={THREE.AdditiveBlending}
                        />
                    </mesh>
                    {/* [2] Tapered tail — long cone trailing behind */}
                    <mesh geometry={_tailGeo} position={[0, -3.5, 0]}>
                        <meshStandardMaterial
                            color="#ff4400"
                            emissive="#ff2200"
                            emissiveIntensity={6}
                            transparent opacity={0.85}
                            blending={THREE.AdditiveBlending}
                        />
                    </mesh>
                    {/* [3] Outer tail glow — softer wider */}
                    <mesh geometry={_tailGlowGeo} position={[0, -2.5, 0]}>
                        <meshStandardMaterial
                            color="#ff6600"
                            emissive="#ff4400"
                            emissiveIntensity={3}
                            transparent opacity={0.2}
                            blending={THREE.AdditiveBlending}
                            depthWrite={false}
                        />
                    </mesh>
                </group>
            ))}
        </group>
    );
}
