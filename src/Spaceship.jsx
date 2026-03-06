import React, { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Trail } from '@react-three/drei';
import * as THREE from 'three';
import { engine } from './AudioEngine';
import { gameState } from './GameState';

// Manual exhaust trail config
const EXHAUST_TRAIL_LEN = 25;
const EXHAUST_SPEED = 60; // how fast exhaust particles drift backward

export function Spaceship() {
    const shipRef = useRef();
    const leftThrusterRef = useRef();
    const rightThrusterRef = useRef();
    const explosionFlashRef = useRef();
    const exhaustGroupRef = useRef();
    const { camera } = useThree();

    const [isInvincible, setIsInvincible] = useState(false);
    const explosionIntensity = useRef(0);

    // Input state — added Space for shooting
    const keys = useRef({
        ArrowUp: false,
        ArrowDown: false,
        ArrowLeft: false,
        ArrowRight: false,
        ' ': false,
    });

    const velocity = useRef({ x: 0, y: 0 });
    const logicalPos = useRef({ x: 0, y: -4 });

    // Shooting cooldown
    const shootCooldown = useRef(0);
    const SHOOT_RATE = 0.12; // seconds between shots

    // Exhaust trail data: 3 streams (left, right, center) x EXHAUST_TRAIL_LEN dots
    const exhaustData = useMemo(() => {
        const streams = [
            { offset: [-0.4, 0, 1.1] },   // left engine
            { offset: [0.4, 0, 1.1] },     // right engine
            { offset: [0, -0.05, 1.2] },   // center engine
        ];
        return streams.map(stream => ({
            offset: stream.offset,
            positions: Array.from({ length: EXHAUST_TRAIL_LEN }, () => ({
                pos: new THREE.Vector3(0, 0, -9999),
                age: 999,
            })),
            spawnIndex: 0,
            spawnTimer: 0,
        }));
    }, []);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (keys.current.hasOwnProperty(e.key)) keys.current[e.key] = true;
        };
        const handleKeyUp = (e) => {
            if (keys.current.hasOwnProperty(e.key)) keys.current[e.key] = false;
        };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        const onExplode = () => {
            explosionIntensity.current = 5.0;
        };
        window.addEventListener('ship-explosion', onExplode);

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
        // Cockpit glass — bright cyan emissive
        { geo: new THREE.BoxGeometry(0.8, 0.2, 0.6), pos: [0, 0.25, -0.4], color: "#00ffff", emissive: "#00ffff", emissiveIntensity: 2 },
        // Left wing
        { geo: new THREE.BoxGeometry(2, 0.1, 1), pos: [-1.4, -0.05, 0.2], rotation: [0, 0, -0.1], color: "#222222" },
        // Right wing
        { geo: new THREE.BoxGeometry(2, 0.1, 1), pos: [1.4, -0.05, 0.2], rotation: [0, 0, 0.1], color: "#222222" },
        // Left fin
        { geo: new THREE.BoxGeometry(0.1, 0.6, 0.8), pos: [-2.4, 0.2, 0.5], color: "#333333" },
        // Right fin
        { geo: new THREE.BoxGeometry(0.1, 0.6, 0.8), pos: [2.4, 0.2, 0.5], color: "#333333" },
    ], []);

    // Neon edge strip geometry
    const neonStrips = useMemo(() => [
        // Hull top edge — forward-facing neon line
        { geo: new THREE.BoxGeometry(1.3, 0.05, 0.05), pos: [0, 0.22, -1.0], color: "#00ffff", intensity: 3 },
        // Left wing leading edge
        { geo: new THREE.BoxGeometry(0.05, 0.05, 1.05), pos: [-2.38, -0.05, 0.2], color: "#00ffff", intensity: 2.5 },
        // Right wing leading edge
        { geo: new THREE.BoxGeometry(0.05, 0.05, 1.05), pos: [2.38, -0.05, 0.2], color: "#00ffff", intensity: 2.5 },
        // Left wing tip glow
        { geo: new THREE.BoxGeometry(0.15, 0.08, 0.15), pos: [-2.4, 0.0, -0.3], color: "#ff007f", intensity: 4 },
        // Right wing tip glow
        { geo: new THREE.BoxGeometry(0.15, 0.08, 0.15), pos: [2.4, 0.0, -0.3], color: "#ff007f", intensity: 4 },
        // Underglow strip (centered under hull)
        { geo: new THREE.BoxGeometry(1.0, 0.04, 1.8), pos: [0, -0.22, 0], color: "#00aaff", intensity: 2 },
        // Left fin edge
        { geo: new THREE.BoxGeometry(0.12, 0.62, 0.04), pos: [-2.4, 0.2, 0.1], color: "#00ffff", intensity: 2 },
        // Right fin edge
        { geo: new THREE.BoxGeometry(0.12, 0.62, 0.04), pos: [2.4, 0.2, 0.1], color: "#00ffff", intensity: 2 },
    ], []);

    useFrame((state, delta) => {
        if (!shipRef.current) return;

        const time = state.clock.getElapsedTime();
        const bass = engine.averageBass || 0;
        const edmState = engine.currentState;

        gameState.updateShipPosition(shipRef.current.position);
        gameState.updateFrame(delta, edmState);

        // 1. Collision Detection (Missiles + Enemy Lasers)
        const shipPos = shipRef.current.position;
        gameState.missilePositions.forEach((missilePos) => {
            const dist = shipPos.distanceTo(missilePos);
            if (dist < 1.8) {
                gameState.takeDamage();
            }
        });
        gameState.enemyLaserPositions.forEach((laserPos) => {
            const dist = shipPos.distanceTo(laserPos);
            if (dist < 1.5) {
                gameState.takeDamage();
            }
        });

        // 2. Shooting
        shootCooldown.current -= delta;
        if (keys.current[' '] && shootCooldown.current <= 0 && gameState.health > 0) {
            shootCooldown.current = SHOOT_RATE;
            gameState.fireBullet(shipPos.x, shipPos.y, shipPos.z);
        }

        // 3. Physics
        const acceleration = 70;
        const friction = 0.94;
        const maxSpeed = 45;

        if (keys.current.ArrowLeft) velocity.current.x -= acceleration * delta;
        if (keys.current.ArrowRight) velocity.current.x += acceleration * delta;
        if (keys.current.ArrowUp) velocity.current.y += acceleration * delta;
        if (keys.current.ArrowDown) velocity.current.y -= acceleration * delta;

        velocity.current.x *= friction;
        velocity.current.y *= friction;

        const speed = Math.sqrt(velocity.current.x ** 2 + velocity.current.y ** 2);
        if (speed > maxSpeed) {
            const scale = maxSpeed / speed;
            velocity.current.x *= scale;
            velocity.current.y *= scale;
        }

        logicalPos.current.x += velocity.current.x * delta;
        logicalPos.current.y += velocity.current.y * delta;

        logicalPos.current.x = THREE.MathUtils.clamp(logicalPos.current.x, -80, 80);
        logicalPos.current.y = THREE.MathUtils.clamp(logicalPos.current.y, -50, 50);

        if (Math.abs(logicalPos.current.x) >= 80) velocity.current.x *= 0.5;
        if (Math.abs(logicalPos.current.y) >= 50) velocity.current.y *= 0.5;

        // 4. Movement & Banking
        shipRef.current.position.x = logicalPos.current.x + Math.cos(time * 1.5) * 0.1;
        shipRef.current.position.y = logicalPos.current.y + Math.sin(time * 2) * 0.15;

        const tiltZ = -velocity.current.x * 0.02;
        const tiltX = velocity.current.y * 0.01;
        shipRef.current.rotation.z = THREE.MathUtils.lerp(shipRef.current.rotation.z, tiltZ + Math.sin(time * 1.5) * 0.02, 0.1);
        shipRef.current.rotation.x = THREE.MathUtils.lerp(shipRef.current.rotation.x, tiltX, 0.1);

        // 5. Invincibility Flicker
        if (isInvincible) {
            shipRef.current.visible = Math.floor(time * 20) % 2 === 0;
        } else {
            shipRef.current.visible = true;
        }

        // 6. Thruster & Explosion Flash
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

        // 7. Manual Exhaust Trail Update
        if (exhaustGroupRef.current) {
            const shipWorldPos = shipRef.current.position;
            let dotIdx = 0;

            for (let s = 0; s < exhaustData.length; s++) {
                const stream = exhaustData[s];

                // Spawn new particle
                stream.spawnTimer += delta;
                if (stream.spawnTimer > 0.02) {
                    stream.spawnTimer = 0;
                    const dot = stream.positions[stream.spawnIndex];
                    dot.pos.set(
                        shipWorldPos.x + stream.offset[0],
                        shipWorldPos.y + stream.offset[1],
                        shipWorldPos.z + stream.offset[2]
                    );
                    dot.age = 0;
                    stream.spawnIndex = (stream.spawnIndex + 1) % EXHAUST_TRAIL_LEN;
                }

                // Update all dots: drift backward (+Z) and fade
                const exhaustSpd = EXHAUST_SPEED + bass * 40;
                for (let d = 0; d < EXHAUST_TRAIL_LEN; d++) {
                    const dot = stream.positions[d];
                    dot.age += delta;
                    // Drift backward (positive Z = behind the ship in flight direction)
                    dot.pos.z += exhaustSpd * delta;
                    // Slight spread based on velocity (opposite direction)
                    dot.pos.x -= velocity.current.x * delta * 0.3;
                    dot.pos.y -= velocity.current.y * delta * 0.3;

                    // Update mesh
                    const mesh = exhaustGroupRef.current.children[dotIdx];
                    if (mesh) {
                        mesh.position.copy(dot.pos);
                        const life = 1 - Math.min(dot.age / 0.8, 1); // fade over 0.8s
                        mesh.scale.setScalar(Math.max(life * 0.5, 0.02));
                        mesh.material.opacity = life * 0.9;
                        mesh.visible = dot.age < 0.8;
                    }
                    dotIdx++;
                }
            }
        }

        // 8. Chase Camera
        const targetCamPos = new THREE.Vector3(
            logicalPos.current.x * 0.8,
            logicalPos.current.y + 4,
            shipRef.current.position.z + 10
        );
        camera.position.lerp(targetCamPos, 0.1);
        camera.lookAt(logicalPos.current.x, logicalPos.current.y + 1, shipRef.current.position.z - 5);
    });

    return (
        <>
            {/* Exhaust trail dots — world space, outside ship group so they don't bank with it */}
            <group ref={exhaustGroupRef}>
                {exhaustData.map((stream, s) =>
                    Array.from({ length: EXHAUST_TRAIL_LEN }, (_, d) => (
                        <mesh key={`${s}-${d}`} visible={false}>
                            <sphereGeometry args={[0.3, 4, 4]} />
                            <meshStandardMaterial
                                color="#00ccff"
                                emissive="#00aaff"
                                emissiveIntensity={4}
                                transparent
                                opacity={0.8}
                                blending={THREE.AdditiveBlending}
                                depthWrite={false}
                            />
                        </mesh>
                    ))
                )}
            </group>

            <group ref={shipRef} position={[0, -4, 5]}>
                <pointLight ref={explosionFlashRef} color="#ffaa00" distance={10} intensity={0} />

                {/* Ship self-illumination — point light so you can always see the hull */}
                <pointLight color="#00aaff" distance={8} intensity={1.5} position={[0, 0.5, 0]} />

                {/* Ship body parts */}
                {shipParts.map((part, i) => (
                    <mesh key={i} position={part.pos} rotation={part.rotation || [0, 0, 0]}>
                        <primitive object={part.geo} attach="geometry" />
                        <meshStandardMaterial
                            color={part.color}
                            metalness={0.8}
                            roughness={0.2}
                            emissive={part.emissive || "#000000"}
                            emissiveIntensity={part.emissiveIntensity || 0}
                        />
                    </mesh>
                ))}

                {/* Neon edge strips */}
                {neonStrips.map((strip, i) => (
                    <mesh key={`neon-${i}`} position={strip.pos}>
                        <primitive object={strip.geo} attach="geometry" />
                        <meshStandardMaterial
                            color={strip.color}
                            emissive={strip.color}
                            emissiveIntensity={strip.intensity}
                            transparent
                            opacity={0.9}
                            blending={THREE.AdditiveBlending}
                        />
                    </mesh>
                ))}

                {/* Wingtip trails — follow X/Y movement direction */}
                <group position={[-2.4, 0.2, 0.5]}>
                    <Trail width={1.5} length={8} color="#ff007f" attenuation={(t) => t * t}>
                        <mesh visible={false} />
                    </Trail>
                </group>
                <group position={[2.4, 0.2, 0.5]}>
                    <Trail width={1.5} length={8} color="#ff007f" attenuation={(t) => t * t}>
                        <mesh visible={false} />
                    </Trail>
                </group>

                {/* Left thruster cone */}
                <mesh ref={leftThrusterRef} position={[-0.4, 0, 1.1]} rotation={[Math.PI / 2, 0, 0]}>
                    <cylinderGeometry args={[0.08, 0.02, 1, 12]} />
                    <meshStandardMaterial color="#000000" emissive="#00ffff" emissiveIntensity={1} transparent opacity={0.6} blending={THREE.AdditiveBlending} />
                </mesh>

                {/* Right thruster cone */}
                <mesh ref={rightThrusterRef} position={[0.4, 0, 1.1]} rotation={[Math.PI / 2, 0, 0]}>
                    <cylinderGeometry args={[0.08, 0.02, 1, 12]} />
                    <meshStandardMaterial color="#000000" emissive="#00ffff" emissiveIntensity={1} transparent opacity={0.6} blending={THREE.AdditiveBlending} />
                </mesh>
            </group>
        </>
    );
}
