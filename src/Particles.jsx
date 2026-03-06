import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { engine } from './AudioEngine';

// Vertex Shader: Infinite forward flight starfield
const vertexShader = `
  uniform float uTime;
  uniform float uBass;
  uniform float uSpeed;
  
  attribute float aScale;
  attribute vec3 aRandomPos;

  varying vec3 vPosition;
  varying float vBassAmount;
  
  void main() {
    vPosition = position;
    vec3 p = position;
    
    // Infinite forward movement (Z axis)
    // The stars move towards the camera (+Z)
    p.z += uTime * uSpeed;
    
    // Modulo math to wrap stars around to the deep background when they pass the camera
    // We assume bounding box from Z = -400 to Z = 100
    p.z = mod(p.z + 400.0, 500.0) - 400.0;
    
    // Bass pushes stars away from the center to create a "tunnel" avoidance effect
    // which makes it feel like you are plunging through them
    vec2 xyDir = normalize(p.xy);
    float distFromCenter = length(p.xy);
    
    // Only push stars that are somewhat near the center
    float pushAmount = smoothstep(100.0, 0.0, distFromCenter) * uBass * 30.0; 
    p.xy += xyDir * pushAmount;
    
    // Add some noise/turbulence driven by time
    p.x += sin(p.z * 0.05 + uTime) * 2.0;
    p.y += cos(p.z * 0.05 + uTime) * 2.0;

    vBassAmount = uBass;
    
    // The size of individual particles also reacts to bass
    float pointSize = aScale * (8.0 + uBass * 20.0);
    
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    
    // Perspective division to make far particles smaller
    gl_PointSize = pointSize * (30.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

// Fragment Shader: Handles particle color, glow, and shape
const fragmentShader = `
  uniform vec3 uColorA; // Deep Space Blue
  uniform vec3 uColorB; // Stardust Magenta
  uniform vec3 uColorC; // Hot Pink / Gold accent
  uniform float uMid;
  uniform float uTime;

  varying float vBassAmount;
  varying vec3 vPosition;

  void main() {
    vec2 cxy = 2.0 * gl_PointCoord - 1.0;
    float r = dot(cxy, cxy);

    if (r > 1.0) {
        discard;
    }

    float alpha = exp(-r * 3.0);

    // Cycle through 3 colors based on position, time, and audio
    float distanceMix = length(vPosition.xy) / 100.0;
    float timeCycle = sin(uTime * 0.3 + vPosition.z * 0.01) * 0.5 + 0.5;

    vec3 colorAB = mix(uColorA, uColorB, distanceMix + uMid * 0.5);
    vec3 finalColor = mix(colorAB, uColorC, timeCycle * 0.4 + vBassAmount * 0.3);

    float brightness = 1.0 + (vBassAmount * 4.0);

    gl_FragColor = vec4(finalColor * brightness, alpha * 0.8);
  }
`;

export function Particles() {
    const pointsRef = useRef();

    const count = 5000;

    // We store cumulative time ourselves so we can dynamically change speed without 
    // jumping positions wildly when speed suddenly multiplies
    const cumulativeTime = useRef(0);

    const { positions, scales, randomPos } = useMemo(() => {
        const positions = new Float32Array(count * 3);
        const scales = new Float32Array(count);
        const randomPos = new Float32Array(count * 3);

        for (let i = 0; i < count; i++) {
            // Distribute stars in a massive long bounding box
            // X, Y: -150 to 150 (Width/Height)
            // Z: -400 to 100 (Depth - mostly in front of camera)

            // Bias stars to not be exactly in the center so we have a flight path
            let x = (Math.random() - 0.5) * 300;
            let y = (Math.random() - 0.5) * 300;

            // Clear out the very center "tube"
            if (Math.abs(x) < 10 && Math.abs(y) < 10) {
                x += (x > 0 ? 10 : -10);
                y += (y > 0 ? 10 : -10);
            }

            const z = (Math.random() - 0.5) * 500; // Total 500 depth

            positions[i * 3 + 0] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;

            randomPos[i * 3 + 0] = Math.random();
            randomPos[i * 3 + 1] = Math.random();
            randomPos[i * 3 + 2] = Math.random();

            // Random base scale
            scales[i] = Math.random() * 0.8 + 0.2;
        }

        return { positions, scales, randomPos };
    }, [count]);

    const uniforms = useMemo(() => ({
        uTime: { value: 0 },
        uSpeed: { value: 1.0 },
        uBass: { value: 0 },
        uMid: { value: 0 },
        uColorA: { value: new THREE.Color("#0a3dff") }, // Deep Blue
        uColorB: { value: new THREE.Color("#ff00aa") }, // Hot Pink
        uColorC: { value: new THREE.Color("#ffaa00") }, // Warm Gold
    }), []);

    useFrame((state, delta) => {
        if (!pointsRef.current) return;

        const edmState = engine.currentState;

        // Define base flight speed based on EDM State
        let targetSpeed = 40.0; // Base chill flight speed

        if (edmState === 'buildup') {
            targetSpeed = 120.0; // Faster hyper-flight
        } else if (edmState === 'drop') {
            targetSpeed = 300.0; // Warp speed
        }

        // Calculate cumulative distance to move the stars smoothly even if speed changes abruptly
        cumulativeTime.current += (delta * targetSpeed) / 100.0;

        pointsRef.current.material.uniforms.uTime.value = cumulativeTime.current;
        pointsRef.current.material.uniforms.uSpeed.value = 100.0; // We baked the variable speed into cumulativeTime

        pointsRef.current.material.uniforms.uBass.value = engine.averageBass;
        pointsRef.current.material.uniforms.uMid.value = engine.averageMid;

        // Add a very slow barrel roll to the entire starfield for disorientation/epicness
        pointsRef.current.rotation.z += delta * 0.05 * (edmState === 'drop' ? 3.0 : 1.0);
    });

    return (
        <points ref={pointsRef}>
            <bufferGeometry>
                <bufferAttribute
                    attach="attributes-position"
                    count={positions.length / 3}
                    array={positions}
                    itemSize={3}
                />
                <bufferAttribute
                    attach="attributes-aScale"
                    count={scales.length}
                    array={scales}
                    itemSize={1}
                />
                <bufferAttribute
                    attach="attributes-aRandomPos"
                    count={randomPos.length / 3}
                    array={randomPos}
                    itemSize={3}
                />
            </bufferGeometry>
            <shaderMaterial
                vertexShader={vertexShader}
                fragmentShader={fragmentShader}
                uniforms={uniforms}
                transparent={true}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
            />
        </points>
    );
}
