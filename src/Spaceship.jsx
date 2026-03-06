import React, { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { engine } from './AudioEngine';
import { gameState } from './GameState';

export function Spaceship() {
    const shipRef = useRef();
    const leftThrusterRef = useRef();
    const rightThrusterRef = useRef();
    const explosionFlashRef = useRef();
    const { camera } = useThree();

    // Visual state for damage/explosions
    const [isInvincible, setIsInvincible] = useState(false);
    const explosionIntensity = useRef(0);

    // Store input state
    const keys = useRef({
        ArrowUp: false,
        ArrowDown: false,
        ArrowLeft: false,
        ArrowRight: false
    });

    // Physics state: Velocity and Position
    const velocity = useRef({ x: 0, y: 0 });
    const logicalPos = useRef({ x: 0, y: -4 });

    useEffect(() => {
        const handleKeyDown = (e) => { if (keys.current.hasOwnProperty(e.key)) keys.current[e.key] = true; };
        const handleKeyUp = (e) => { if (keys.current.hasOwnProperty(e.key)) keys.current[e.key] = false; };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        // Listen for internal explosion events
        const onExplode = () => {
            explosionIntensity.current = 5.0; // Flash intensity spike
        };
        window.addEventListener('ship-explosion', onExplode);

        // Sync invincibility state for visual flickering
        const unsubscribe = gameState.subscribe((state) => {
            setIsInvincible(state.isInvincible);
        });

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('ship-explosion', onExplode);
            unsubscribe();
        };
    }, []);

    // Ship parts facing forward (-Z)
    const shipParts = useMemo(() => [
        // Main hull
        { geo: new THREE.BoxGeometry(1.2, 0.4, 2), pos: [0, 0, 0], color: "#111111" },
        // Cockpit glass
        { geo: new THREE.BoxGeometry(0.8, 0.2, 0.6), pos: [0, 0.25, -0.4], color: "#00ffff" },
        // Left wing
        { geo: new THREE.BoxGeometry(2, 0.1, 1), pos: [-1.4, -0.05, 0.2], rotation: [0, 0, -0.1], color: "#222222" },
        // Right wing
        { geo: new THREE.BoxGeometry(2, 0.1, 1), pos: [1.4, -0.05, 0.2], rotation: [0, 0, 0.1], color: "#222222" },
        // Left fin
        { geo: new THREE.BoxGeometry(0.1, 0.6, 0.8), pos: [-2.4, 0.2, 0.5], color: "#333333" },
        // Right fin
        { geo: new THREE.BoxGeometry(0.1, 0.6, 0.8), pos: [2.4, 0.2, 0.5], color: "#333333" },
    ], []);

    useFrame((state, delta) => {
        if (!shipRef.current) return;

        const time = state.clock.getElapsedTime();
        const bass = engine.averageBass || 0;
        const edmState = engine.currentState;

        // 1. Collision Detection Logic
        // We iterate through tracked orb positions in gameState
        const shipBox = new THREE.Vector3(logicalPos.current.x, logicalPos.current.y, shipRef.current.position.z);

        gameState.orbPositions.forEach((orbPos, index) => {
            // Precise Z distance check (avoiding math on distant orbs)
            const distZ = Math.abs(orbPos.z - shipBox.z);
            if (distZ < 2.0) {
                const distXY = Math.sqrt(
                    Math.pow(orbPos.x - shipBox.x, 2) +
                    Math.pow(orbPos.y - shipBox.y, 2)
                );

                // If ship is within the hitbox (orbs are roughly scale-based radius)
                if (distXY < 2.5) {
                    gameState.takeDamage();
                }
            }
        });

        // 2. Physics Engine (Acceleration and Friction)
        const acceleration = 70;
        const friction = 0.94;

        if (keys.current.ArrowLeft) velocity.current.x -= acceleration * delta;
        if (keys.current.ArrowRight) velocity.current.x += acceleration * delta;
        if (keys.current.ArrowUp) velocity.current.y += acceleration * delta;
        if (keys.current.ArrowDown) velocity.current.y -= acceleration * delta;

        velocity.current.x *= friction;
        velocity.current.y *= friction;

        logicalPos.current.x += velocity.current.x * delta;
        logicalPos.current.y += velocity.current.y * delta;

        logicalPos.current.x = THREE.MathUtils.clamp(logicalPos.current.x, -50, 50);
        logicalPos.current.y = THREE.MathUtils.clamp(logicalPos.current.y, -30, 30);

        // 3. Movement & Banking
        shipRef.current.position.x = logicalPos.current.x + Math.cos(time * 1.5) * 0.1;
        shipRef.current.position.y = logicalPos.current.y + Math.sin(time * 2) * 0.15;

        const tiltZ = -velocity.current.x * 0.02;
        const tiltX = velocity.current.y * 0.01;
        shipRef.current.rotation.z = THREE.MathUtils.lerp(shipRef.current.rotation.z, tiltZ + Math.sin(time * 1.5) * 0.02, 0.1);
        shipRef.current.rotation.x = THREE.MathUtils.lerp(shipRef.current.rotation.x, tiltX, 0.1);

        // 4. Invincibility Flicker Effect
        if (isInvincible) {
            shipRef.current.visible = Math.floor(time * 20) % 2 === 0;
        } else {
            shipRef.current.visible = true;
        }

        // 5. Thruster & Explosion Flash Logic
        explosionIntensity.current = THREE.MathUtils.lerp(explosionIntensity.current, 0, 0.05);
        if (explosionFlashRef.current) {
            explosionFlashRef.current.intensity = explosionIntensity.current * 10;
        }

        let thrusterLengthScale = 0.15 + (bass * 0.6);
        let thrusterIntensity = 0.4 + (bass * 1.5) + explosionIntensity.current;

        if (edmState === 'buildup') {
            thrusterLengthScale *= 1.5;
            thrusterIntensity *= 1.5;
        } else if (edmState === 'drop') {
            thrusterLengthScale *= 2.5;
            thrusterIntensity *= 2.5;
        }

        if (leftThrusterRef.current) {
            leftThrusterRef.current.scale.set(0.5, thrusterLengthScale, 0.5);
            leftThrusterRef.current.material.emissiveIntensity = thrusterIntensity;
        }
        if (rightThrusterRef.current) {
            rightThrusterRef.current.scale.set(0.5, thrusterLengthScale, 0.5);
            rightThrusterRef.current.material.emissiveIntensity = thrusterIntensity;
        }

        // 6. Chase Camera
        const targetCamPos = new THREE.Vector3(
            logicalPos.current.x * 0.8,
            logicalPos.current.y + 4,
            shipRef.current.position.z + 10
        );
        camera.position.lerp(targetCamPos, 0.1);
        camera.lookAt(logicalPos.current.x, logicalPos.current.y + 1, shipRef.current.position.z - 5);
    });

    return (
        <group ref={shipRef} position={[0, -4, 5]}>
            <pointLight ref={explosionFlashRef} color="#ffaa00" distance={10} intensity={0} />

            {shipParts.map((part, i) => (
                <mesh key={i} position={part.pos} rotation={part.rotation || [0, 0, 0]}>
                    <primitive object={part.geo} attach="geometry" />
                    <meshStandardMaterial color={part.color} metalness={0.8} roughness={0.2} />
                </mesh>
            ))}

            <mesh ref={leftThrusterRef} position={[-0.4, 0, 1.1]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.08, 0.02, 1, 12]} />
                <meshStandardMaterial color="#000000" emissive="#00ffff" emissiveIntensity={1} transparent opacity={0.6} blending={THREE.AdditiveBlending} />
            </mesh>

            <mesh ref={rightThrusterRef} position={[0.4, 0, 1.1]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.08, 0.02, 1, 12]} />
                <meshStandardMaterial color="#000000" emissive="#00ffff" emissiveIntensity={1} transparent opacity={0.6} blending={THREE.AdditiveBlending} />
            </mesh>
        </group>
    );
}
