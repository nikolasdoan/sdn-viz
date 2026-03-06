import React from 'react';
import { Canvas } from '@react-three/fiber';
import { EffectComposer, Bloom, ChromaticAberration, Vignette } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import { Particles } from './Particles';
import { Lasers } from './Lasers';
import { Waveforms } from './Waveform';
import { Missiles } from './Missiles';
import { RepairOrbs } from './RepairOrb';
import { PlayerBullets } from './PlayerBullets';
import { EnemyShips } from './EnemyShips';
import { Spaceship } from './Spaceship';
import { WeaponPowerUps } from './WeaponPowerUp';
import { EnemyLasers } from './EnemyLasers';
import { Explosions } from './Explosions';

export function VisualizerScene() {
    return (
        <Canvas
            camera={{ position: [0, 0, 15], fov: 60 }}
            gl={{ antialias: false, powerPreference: 'high-performance' }}
            dpr={[1, 2]}
        >
            <color attach="background" args={['#050510']} />
            <ambientLight intensity={0.2} />

            <Particles />
            <Lasers />
            <Waveforms />
            <Missiles />
            <RepairOrbs />
            <EnemyShips />
            <PlayerBullets />
            <WeaponPowerUps />
            <EnemyLasers />
            <Explosions />
            <Spaceship />

            <EffectComposer disableNormalPass multisampling={4}>
                <Bloom
                    luminanceThreshold={0.5}
                    luminanceSmoothing={0.9}
                    intensity={2.5}
                    mipmapBlur
                />
                <ChromaticAberration
                    blendFunction={BlendFunction.NORMAL}
                    offset={[0.002, 0.002]}
                />
                <Vignette eskil={false} offset={0.1} darkness={1.1} />
            </EffectComposer>
        </Canvas>
    );
}
