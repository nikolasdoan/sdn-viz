import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { engine } from './AudioEngine';
import { gameState } from './GameState';

export function Missiles() {
    const groupRef = useRef();
    const _pos = new THREE.Vector3();
    const _target = new THREE.Vector3();

    const MAX_COUNT = 30; // Fewer but more dangerous

    const missileData = useMemo(() => {
        return Array.from({ length: MAX_COUNT }, (_, i) => {
            // Missile geometry: pointy cylinder
            const bodyGeo = new THREE.CylinderGeometry(0.2, 0.4, 3, 8);
            const noseGeo = new THREE.SphereGeometry(0.3, 8, 8);

            const color = new THREE.Color("#ff4400"); // Standard missile red/orange

            return {
                id: i,
                active: false,
                position: new THREE.Vector3(0, 0, -500),
                velocity: new THREE.Vector3(0, 0, 0),
                speed: 50 + Math.random() * 50,
                turnSpeed: 0.02 + Math.random() * 0.03,
                bodyGeo,
                noseGeo,
                color
            };
        });
    }, []);

    useFrame((state, delta) => {
        if (!groupRef.current) return;

        const progress = engine.duration > 0 ? (engine.currentTime / engine.duration) : 0;
        const activeCount = Math.floor(5 + progress * 20); // Scale up to 25 missiles
        const children = groupRef.current.children;

        _target.copy(gameState.shipPosition);

        for (let i = 0; i < children.length; i++) {
            const mesh = children[i];
            const data = missileData[i];

            if (i >= activeCount) {
                mesh.visible = false;
                gameState.missilePositions.delete(data.id);
                continue;
            }

            mesh.visible = true;

            // Simple Homing Logic
            // If missile is too far behind or too far past, reset it
            if (mesh.position.z > 20) {
                // Reset to background
                const angle = Math.random() * Math.PI * 2;
                const dist = 50 + Math.random() * 50;
                mesh.position.set(
                    Math.cos(angle) * dist,
                    Math.sin(angle) * dist,
                    -800 - Math.random() * 200
                );
                data.velocity.set(0, 0, 100); // Initial forward punch
            }

            // Direction toward player
            const toPlayer = _target.clone().sub(mesh.position).normalize();

            // Influence velocity (Turn toward player)
            data.velocity.lerp(toPlayer.multiplyScalar(data.speed + progress * 100), data.turnSpeed);

            mesh.position.addScaledVector(data.velocity, delta);

            // Orient missile toward velocity
            mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), data.velocity.clone().normalize());

            // Report position for collision
            if (mesh.position.z > -50 && mesh.position.z < 10) {
                gameState.updateMissilePosition(data.id, mesh.position.clone());
            } else {
                gameState.missilePositions.delete(data.id);
            }

            // Visual pulsing of the nose (warhead)
            const warhead = mesh.children[1];
            warhead.material.emissiveIntensity = 2.0 + Math.sin(state.clock.elapsedTime * 10) * 1.5;
        }
    });

    return (
        <group ref={groupRef}>
            {missileData.map((data, i) => (
                <group key={i}>
                    {/* Body */}
                    <mesh geometry={data.bodyGeo}>
                        <meshStandardMaterial color="#222222" metalness={0.9} roughness={0.1} />
                    </mesh>
                    {/* Glowing Nose */}
                    <mesh geometry={data.noseGeo} position={[0, 1.5, 0]}>
                        <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={2} />
                    </mesh>
                    {/* Engine Glow */}
                    <mesh position={[0, -1.5, 0]}>
                        <cylinderGeometry args={[0.3, 0.1, 0.4, 8]} />
                        <meshStandardMaterial color="#00ffff" emissive="#00ffff" emissiveIntensity={5} transparent opacity={0.8} />
                    </mesh>
                </group>
            ))}
        </group>
    );
}
