import React from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { EffectComposer, Bloom, ChromaticAberration, Vignette } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import { Particles } from './Particles';
import { Lasers } from './Lasers';
import { Waveforms } from './Waveform';
import { Orbs } from './Orbs';
import { Spaceship } from './Spaceship';

export function VisualizerScene() {
    return (
        <Canvas
            camera={{ position: [0, 0, 15], fov: 60 }}
            gl={{ antialias: false, powerPreference: 'high-performance' }} // Optimize for post-processing
            dpr={[1, 2]} // Max 2x pixel ratio for performance
        >
            <color attach="background" args={['#050510']} /> {/* Very dark space blue background */}

            {/* Basic ambient light, though shaders will emit their own light */}
            <ambientLight intensity={0.2} />

            {/* 
        Elements to render. 
        Particles for Bass, Lasers for Melody. 
      */}
            <Particles />
            <Lasers />
            <Waveforms />
            <Orbs />
            <Spaceship />

            {/* Orbit controls disabled to allow the Spaceship's Chase Cam to control the viewport */}
            {/* 
            <OrbitControls
                makeDefault
                enableDamping
                dampingFactor={0.05}
                enablePan={false}
                enableZoom={false}
                minPolarAngle={Math.PI / 2.5}
                maxPolarAngle={Math.PI / 1.5}
            />
            */}

            {/* 
        Post-Processing is crucial for the "Epic" feel. 
        Bloom makes high emission values glow intensely. 
      */}
            <EffectComposer disableNormalPass multisampling={4}>
                <Bloom
                    luminanceThreshold={0.5}
                    luminanceSmoothing={0.9}
                    intensity={2.5}
                    mipmapBlur // Better looking bloom
                />
                <ChromaticAberration
                    blendFunction={BlendFunction.NORMAL} // blend mode
                    offset={[0.002, 0.002]} // color offset
                />
                <Vignette eskil={false} offset={0.1} darkness={1.1} />
            </EffectComposer>
        </Canvas>
    );
}
