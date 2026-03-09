import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { gameState } from './GameState';

const MAX_POWERUPS = 4;

// Rainbow color cycle
const RAINBOW = [
    new THREE.Color('#ff0000'),
    new THREE.Color('#ff8800'),
    new THREE.Color('#ffff00'),
    new THREE.Color('#00ff44'),
    new THREE.Color('#00aaff'),
    new THREE.Color('#8800ff'),
    new THREE.Color('#ff00ff'),
];

const _color = new THREE.Color();

function getRainbow(t) {
    const idx = ((t % 1) + 1) % 1 * RAINBOW.length;
    const i = Math.floor(idx);
    const f = idx - i;
    const a = RAINBOW[i % RAINBOW.length];
    const b = RAINBOW[(i + 1) % RAINBOW.length];
    _color.copy(a).lerp(b, f);
    return _color;
}

export function WeaponPowerUps() {
    const groupRef = useRef();

    const powerUpData = useMemo(() => {
        return Array.from({ length: MAX_POWERUPS }, (_, i) => ({
            id: i,
            active: false,
            velocity: new THREE.Vector3(0, 0, 40),
            life: 0,
            spinPhase: Math.random() * Math.PI * 2,
        }));
    }, []);

    useFrame((state, delta) => {
        if (!groupRef.current) return;
        if (gameState.paused) return;

        const time = state.clock.elapsedTime;
        const children = groupRef.current.children;

        // Consume power-up spawn queue
        while (gameState.powerUpQueue.length > 0) {
            let idx = -1;
            for (let i = 0; i < MAX_POWERUPS; i++) {
                if (!powerUpData[i].active) { idx = i; break; }
            }
            if (idx === -1) break;

            const spawn = gameState.powerUpQueue.shift();
            const data = powerUpData[idx];
            const mesh = children[idx];

            data.active = true;
            data.life = 0;
            data.velocity.set(0, 0, 40);
            mesh.position.set(spawn.x, spawn.y, spawn.z);
            mesh.visible = true;
        }

        // Update active power-ups
        const shipPos = gameState.shipPosition;
        for (let i = 0; i < MAX_POWERUPS; i++) {
            const data = powerUpData[i];
            const mesh = children[i];

            if (!data.active) {
                mesh.visible = false;
                continue;
            }

            data.life += delta;
            mesh.position.addScaledVector(data.velocity, delta);

            // Fast spin
            mesh.rotation.y = time * 4 + data.spinPhase;
            mesh.rotation.x = time * 2.5 + data.spinPhase;
            mesh.rotation.z = Math.sin(time * 3 + data.spinPhase) * 0.5;

            // Pulsing scale — big throb
            const pulse = 1.2 + Math.sin(time * 8 + data.spinPhase) * 0.3;
            mesh.scale.setScalar(pulse);

            // Rainbow cycle — each powerup offset by its phase
            const rainbowT = time * 0.5 + i * 0.15;
            const col = getRainbow(rainbowT);

            // Outer ring [0]
            const ring = mesh.children[0];
            if (ring && ring.material) {
                ring.material.color.copy(col);
                ring.material.emissive.copy(col);
                ring.material.emissiveIntensity = 4 + Math.sin(time * 10 + data.spinPhase) * 2;
            }

            // Inner core [1] — offset rainbow
            const core = mesh.children[1];
            if (core && core.material) {
                const col2 = getRainbow(rainbowT + 0.3);
                core.material.color.copy(col2);
                core.material.emissive.copy(col2);
                core.material.emissiveIntensity = 6 + Math.sin(time * 12 + data.spinPhase) * 3;
            }

            // Arrow [2]
            const arrow = mesh.children[2];
            if (arrow && arrow.material) {
                const col3 = getRainbow(rainbowT + 0.6);
                arrow.material.color.copy(col3);
                arrow.material.emissive.copy(col3);
                arrow.material.emissiveIntensity = 5;
            }

            // Pickup collision — generous radius
            const dist = mesh.position.distanceTo(shipPos);
            if (dist < 6.0) {
                data.active = false;
                mesh.visible = false;
                gameState.weaponPowerUp();
                continue;
            }

            // Deactivate if past player
            if (mesh.position.z > 25 || data.life > 8) {
                data.active = false;
                mesh.visible = false;
            }
        }
    });

    return (
        <group ref={groupRef}>
            {Array.from({ length: MAX_POWERUPS }, (_, i) => (
                <group key={i} visible={false}>
                    {/* [0] Outer ring */}
                    <mesh>
                        <torusGeometry args={[2.0, 0.3, 8, 16]} />
                        <meshStandardMaterial
                            color="#ff0000"
                            emissive="#ff0000"
                            emissiveIntensity={4}
                            transparent
                            opacity={0.9}
                            blending={THREE.AdditiveBlending}
                        />
                    </mesh>
                    {/* [1] Inner core — octahedron */}
                    <mesh>
                        <octahedronGeometry args={[1.0, 0]} />
                        <meshStandardMaterial
                            color="#ffffff"
                            emissive="#ffffff"
                            emissiveIntensity={6}
                        />
                    </mesh>
                    {/* [2] Arrow indicator */}
                    <mesh position={[0, 2.6, 0]}>
                        <coneGeometry args={[0.5, 1.0, 4]} />
                        <meshStandardMaterial
                            color="#ffffff"
                            emissive="#ffffff"
                            emissiveIntensity={5}
                            transparent
                            opacity={0.9}
                            blending={THREE.AdditiveBlending}
                        />
                    </mesh>
                </group>
            ))}
        </group>
    );
}
