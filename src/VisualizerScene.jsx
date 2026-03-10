import React from 'react';
import { Canvas } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
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
import { SpaceMines } from './SpaceMines';

export function VisualizerScene() {
    return (
        <Canvas
            camera={{ position: [0, 0, 15], fov: 60 }}
            gl={{ antialias: false, powerPreference: 'high-performance' }}
            dpr={[1, 1.5]}
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
            <SpaceMines />
            <Explosions />
            <Spaceship />

            <EffectComposer disableNormalPass multisampling={2}>
                <Bloom
                    luminanceThreshold={0.5}
                    luminanceSmoothing={0.9}
                    intensity={2.0}
                    mipmapBlur
                />
                <Vignette eskil={false} offset={0.1} darkness={1.1} />
            </EffectComposer>
        </Canvas>
    );
}
