import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Trail } from '@react-three/drei';
import * as THREE from 'three';
import { engine } from './AudioEngine';
import { gameState } from './GameState';
import { ExhaustFlames } from './ExhaustFlames';

export function Spaceship() {
    const shipRef = useRef();
    const explosionFlashRef = useRef();
    const { camera } = useThree();

    const isInvincible = useRef(false);
    const explosionIntensity = useRef(0);

    // Cached vectors to avoid GC pressure from per-frame allocations
    const _camTarget = useRef(new THREE.Vector3());
    const _lookTarget = useRef(new THREE.Vector3());
    const _smoothLook = useRef(new THREE.Vector3(0, -3, 0));

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
            isInvincible.current = state.isInvincible;
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
        // Hull top edge — forward-facing neon line (nose)
        { geo: new THREE.BoxGeometry(1.3, 0.06, 0.06), pos: [0, 0.22, -1.0], color: "#00ffff", intensity: 4 },
        // Hull rear edge
        { geo: new THREE.BoxGeometry(1.3, 0.06, 0.06), pos: [0, 0.22, 1.0], color: "#00ffff", intensity: 3 },
        // Hull left side edge (full length)
        { geo: new THREE.BoxGeometry(0.06, 0.06, 2.1), pos: [-0.62, 0.22, 0], color: "#00ffff", intensity: 3 },
        // Hull right side edge (full length)
        { geo: new THREE.BoxGeometry(0.06, 0.06, 2.1), pos: [0.62, 0.22, 0], color: "#00ffff", intensity: 3 },
        // Hull bottom left side edge
        { geo: new THREE.BoxGeometry(0.06, 0.06, 2.1), pos: [-0.62, -0.22, 0], color: "#00aaff", intensity: 2.5 },
        // Hull bottom right side edge
        { geo: new THREE.BoxGeometry(0.06, 0.06, 2.1), pos: [0.62, -0.22, 0], color: "#00aaff", intensity: 2.5 },
        // Left wing leading edge
        { geo: new THREE.BoxGeometry(2.05, 0.06, 0.06), pos: [-1.4, -0.05, -0.3], color: "#00ffff", intensity: 3 },
        // Right wing leading edge
        { geo: new THREE.BoxGeometry(2.05, 0.06, 0.06), pos: [1.4, -0.05, -0.3], color: "#00ffff", intensity: 3 },
        // Left wing trailing edge
        { geo: new THREE.BoxGeometry(2.05, 0.06, 0.06), pos: [-1.4, -0.05, 0.7], color: "#00aaff", intensity: 2 },
        // Right wing trailing edge
        { geo: new THREE.BoxGeometry(2.05, 0.06, 0.06), pos: [1.4, -0.05, 0.7], color: "#00aaff", intensity: 2 },
        // Left wing outer edge (spanwise)
        { geo: new THREE.BoxGeometry(0.06, 0.06, 1.05), pos: [-2.38, -0.05, 0.2], color: "#00ffff", intensity: 3 },
        // Right wing outer edge (spanwise)
        { geo: new THREE.BoxGeometry(0.06, 0.06, 1.05), pos: [2.38, -0.05, 0.2], color: "#00ffff", intensity: 3 },
        // Left wing tip glow
        { geo: new THREE.BoxGeometry(0.18, 0.1, 0.18), pos: [-2.4, 0.0, -0.3], color: "#ff007f", intensity: 5 },
        // Right wing tip glow
        { geo: new THREE.BoxGeometry(0.18, 0.1, 0.18), pos: [2.4, 0.0, -0.3], color: "#ff007f", intensity: 5 },
        // Underglow strip (centered under hull, wider)
        { geo: new THREE.BoxGeometry(1.2, 0.04, 2.0), pos: [0, -0.22, 0], color: "#00aaff", intensity: 2.5 },
        // Left fin front edge
        { geo: new THREE.BoxGeometry(0.12, 0.62, 0.06), pos: [-2.4, 0.2, 0.1], color: "#00ffff", intensity: 3 },
        // Right fin front edge
        { geo: new THREE.BoxGeometry(0.12, 0.62, 0.06), pos: [2.4, 0.2, 0.1], color: "#00ffff", intensity: 3 },
        // Left fin top edge
        { geo: new THREE.BoxGeometry(0.12, 0.06, 0.8), pos: [-2.4, 0.5, 0.5], color: "#ff007f", intensity: 3 },
        // Right fin top edge
        { geo: new THREE.BoxGeometry(0.12, 0.06, 0.8), pos: [2.4, 0.5, 0.5], color: "#ff007f", intensity: 3 },
        // Nose tip accent
        { geo: new THREE.BoxGeometry(0.3, 0.15, 0.1), pos: [0, 0.1, -1.05], color: "#00ffff", intensity: 5 },
    ], []);

    useFrame((state, rawDelta) => {
        if (!shipRef.current) return;

        // Clamp delta to prevent huge jumps after frame spikes (kills, explosions)
        const delta = Math.min(rawDelta, 0.05); // cap at 50ms (~20fps minimum)

        const time = state.clock.getElapsedTime();
        const bass = engine.averageBass || 0;
        const edmState = engine.currentState;

        gameState.updateShipPosition(shipRef.current.position);
        gameState.updateFrame(delta, edmState);

        // 1. Collision Detection (Missiles + Enemy Lasers) — no closures
        const shipPos = shipRef.current.position;
        for (const missilePos of gameState.missilePositions.values()) {
            if (shipPos.distanceTo(missilePos) < 1.8) {
                gameState.takeDamage();
                break; // only one hit per frame
            }
        }
        for (const laserPos of gameState.enemyLaserPositions.values()) {
            if (shipPos.distanceTo(laserPos) < 1.5) {
                gameState.takeDamage();
                break;
            }
        }

        // 2. Shooting
        shootCooldown.current -= delta;
        if (keys.current[' '] && shootCooldown.current <= 0 && gameState.health > 0) {
            shootCooldown.current = SHOOT_RATE;
            gameState.fireBullet(shipPos.x, shipPos.y, shipPos.z);
        }

        // 3. Physics
        const acceleration = 70;
        const friction = Math.pow(0.94, delta * 60); // frame-rate independent
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
        if (isInvincible.current) {
            shipRef.current.visible = Math.floor(time * 20) % 2 === 0;
        } else {
            shipRef.current.visible = true;
        }

        // 6. Thruster & Explosion Flash
        explosionIntensity.current = THREE.MathUtils.lerp(explosionIntensity.current, 0, 0.05);
        if (explosionFlashRef.current) {
            explosionFlashRef.current.intensity = explosionIntensity.current * 10;
        }

        // 7. Chase Camera — smooth both position AND lookAt to prevent jitter
        const lerpFactor = 1 - Math.pow(0.001, delta); // frame-rate independent smoothing

        _camTarget.current.set(
            logicalPos.current.x * 0.8,
            logicalPos.current.y + 4,
            shipRef.current.position.z + 10
        );
        camera.position.lerp(_camTarget.current, lerpFactor);

        _lookTarget.current.set(
            logicalPos.current.x,
            logicalPos.current.y + 1,
            shipRef.current.position.z - 5
        );
        _smoothLook.current.lerp(_lookTarget.current, lerpFactor);
        camera.lookAt(_smoothLook.current);
    });

    return (
        <>
            <group ref={shipRef} position={[0, -4, 5]}>
                <pointLight ref={explosionFlashRef} color="#ffaa00" distance={10} intensity={0} />

                {/* Ship self-illumination — point lights so you can always see the hull */}
                <pointLight color="#00aaff" distance={12} intensity={3} position={[0, 0.5, 0]} />
                <pointLight color="#00ffff" distance={6} intensity={2} position={[0, -0.3, -0.5]} />
                <pointLight color="#ff007f" distance={8} intensity={1.5} position={[0, 0.3, 0.8]} />

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

                {/* Engine exhaust trails — purple neon, behind the ship */}
                <group position={[-0.4, 0, 2.0]}>
                    <Trail width={2.5} length={16} color="#aa00ff" attenuation={(t) => t * t}>
                        <mesh visible={false} />
                    </Trail>
                </group>
                <group position={[0.4, 0, 2.0]}>
                    <Trail width={2.5} length={16} color="#aa00ff" attenuation={(t) => t * t}>
                        <mesh visible={false} />
                    </Trail>
                </group>
                {/* Wingtip neon trails — thinner pink accents behind */}
                <group position={[-2.4, 0.2, 0.9]}>
                    <Trail width={1.0} length={10} color="#ff007f" attenuation={(t) => t * t}>
                        <mesh visible={false} />
                    </Trail>
                </group>
                <group position={[2.4, 0.2, 0.9]}>
                    <Trail width={1.0} length={10} color="#ff007f" attenuation={(t) => t * t}>
                        <mesh visible={false} />
                    </Trail>
                </group>

                {/* Left engine nacelle — big horizontal cylinder */}
                <mesh position={[-0.4, 0, 0.5]} rotation={[Math.PI / 2, 0, 0]}>
                    <cylinderGeometry args={[0.3, 0.28, 1.2, 12]} />
                    <meshStandardMaterial color="#1a1a1a" metalness={0.9} roughness={0.2} emissive="#001122" emissiveIntensity={0.3} />
                </mesh>
                {/* Left engine nozzle ring */}
                <mesh position={[-0.4, 0, 1.12]} rotation={[Math.PI / 2, 0, 0]}>
                    <torusGeometry args={[0.28, 0.04, 8, 16]} />
                    <meshStandardMaterial color="#00ffff" emissive="#00ffff" emissiveIntensity={4} transparent opacity={0.9} blending={THREE.AdditiveBlending} />
                </mesh>
                {/* Right engine nacelle — big horizontal cylinder */}
                <mesh position={[0.4, 0, 0.5]} rotation={[Math.PI / 2, 0, 0]}>
                    <cylinderGeometry args={[0.3, 0.28, 1.2, 12]} />
                    <meshStandardMaterial color="#1a1a1a" metalness={0.9} roughness={0.2} emissive="#001122" emissiveIntensity={0.3} />
                </mesh>
                {/* Right engine nozzle ring */}
                <mesh position={[0.4, 0, 1.12]} rotation={[Math.PI / 2, 0, 0]}>
                    <torusGeometry args={[0.28, 0.04, 8, 16]} />
                    <meshStandardMaterial color="#00ffff" emissive="#00ffff" emissiveIntensity={4} transparent opacity={0.9} blending={THREE.AdditiveBlending} />
                </mesh>

                {/* Exhaust flames — separate component with layered cones */}
                <ExhaustFlames shipRef={shipRef} />
            </group>
        </>
    );
}
