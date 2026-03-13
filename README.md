# Sound Voyage

An audio-reactive 3D space shooter that runs in the browser. Fly a neon spaceship through a starfield that pulses to the music while fighting waves of enemies. Built with React, Three.js, and the Web Audio API.

**Live site:** [soundvoyage.io](https://soundvoyage.io) (or wherever deployed)

## Getting Started

```bash
npm install
npm run dev
```

Other scripts:

| Command | Description |
|---|---|
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint |

No environment variables or backend required — the app is a fully static SPA.

## Tech Stack

- **React 19** + **Vite 7**
- **Three.js** via `@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing`
- **Web Audio API** for real-time FFT analysis and beat detection
- **Custom GLSL shaders** for the starfield particle system
- JavaScript (no TypeScript)

## Project Structure

```
src/
├── main.jsx              # React root
├── App.jsx               # All UI: HUD, menus, audio controls, game-over screen
├── index.css             # Global styles (cyberpunk dark theme, CSS variables)
│
├── AudioEngine.js        # Web Audio API singleton — FFT, beat detection, capture mode
├── GameState.js          # Game state singleton — score, health, waves, pub/sub
│
├── VisualizerScene.jsx   # Three.js Canvas, camera, lighting, post-processing
├── Particles.jsx         # 5000-particle starfield (custom GLSL vertex/fragment shaders)
├── Waveform.jsx          # Audio waveform trail ribbons
├── Lasers.jsx            # Environmental laser beams (visual only, music-reactive)
│
├── Spaceship.jsx         # Player ship: input, physics, shooting, chase camera
├── PlayerBullets.jsx     # Player projectile pool + collision detection
├── ExhaustFlames.jsx     # Engine exhaust particles
│
├── EnemyShips.jsx        # Enemy pool (8 max): AI, weapons, shields, health bars
├── Missiles.jsx          # Homing missile pool (fired by enemies on beat)
├── EnemyLasers.jsx       # Enemy laser bolt pool
├── SpaceMines.jsx        # Drifting mines dropped by enemies
│
├── RepairOrb.jsx         # Health pickup
├── WeaponPowerUp.jsx     # Weapon level upgrade pickup
└── Explosions.jsx        # Pooled particle explosions (deaths, shield hits)

public/songs/             # 3 bundled NCS sample tracks
```

## Architecture Overview

### Audio Pipeline (`AudioEngine.js`)

A singleton that wraps the Web Audio API. Two input modes:

1. **File mode** — creates a `MediaElementSource` from an `<audio>` element (local file upload or bundled sample tracks)
2. **Capture mode** — uses `getDisplayMedia` to capture system/tab audio as a `MediaStreamSource` (Chromium-only)

Runs a 2048-sample FFT every frame to compute bass/mid/high averages. Beat detection works by tracking transient bass spikes. For uploaded tracks, a pre-analysis pass classifies segments into an EDM state machine (`chill` / `buildup` / `drop`) that drives starfield speed and enemy aggression.

### Game State (`GameState.js`)

A singleton with a lightweight pub/sub pattern (`subscribe` / `notify`). Manages health, score, combo multiplier, wave progression, bullet/missile/mine queues, enemy positions, weapon level, and difficulty presets. High score and difficulty are persisted in `localStorage`.

### Rendering

All 3D components use `useFrame` (React Three Fiber's per-frame hook) for game logic and animation. Key performance patterns:

- **Object pooling** everywhere — bullets, missiles, mines, enemies, explosions. No runtime allocation during gameplay.
- **Pre-allocated vectors** — reused `THREE.Vector3` instances to avoid GC pressure.
- **Delta clamping** at 50ms to prevent physics explosions after frame spikes.
- **`useMemo`** on all geometries and materials.
- **Manual Three.js chunking** in Vite config to keep the main bundle lean.

Post-processing uses Bloom and Vignette via `@react-three/postprocessing`.

### UI (`App.jsx`)

All UI lives in a single component: audio source selection, playback controls, HUD (health, score, combo, wave), flash notifications (near-miss, kills, power-ups), countdown overlay, pause/game-over screens, difficulty picker, and a mobile-block screen.

## How Gameplay Works

1. Player selects an audio source (upload a file, pick a sample track, or capture system audio)
2. Audio analysis drives the visuals — starfield speed, colors, waveform intensity
3. Enemies spawn in waves with increasing difficulty. They fire homing missiles on beat, laser bolts on timers, and drop space mines.
4. Player moves with WASD/arrows, shoots with Space
5. Destroyed enemies drop weapon power-ups (5 levels with spread patterns) and repair orbs
6. Near-misses from missiles grant combo multiplier bonuses
7. Game ends when health reaches zero; high score is saved to `localStorage`

## Browser Compatibility

- **Recommended:** Chromium browsers (Chrome, Edge, Brave) — required for capture mode (`getDisplayMedia` with audio)
- **Supported:** Firefox, Safari — file/sample modes work, capture mode unavailable
- **Desktop only** — mobile devices are blocked with a redirect message

## Deployment

The `dist/` output from `npm run build` is a static site. Deploy to any static host (Vercel, Netlify, Cloudflare Pages, GitHub Pages, etc.). No server-side configuration needed.

## Key Files for Common Tasks

| Task | Where to look |
|---|---|
| Tweak difficulty / enemy behavior | `GameState.js` (difficulty presets), `EnemyShips.jsx` |
| Adjust audio sensitivity / beat detection | `AudioEngine.js` |
| Modify starfield visuals | `Particles.jsx` (GLSL shaders) |
| Change post-processing effects | `VisualizerScene.jsx` |
| Edit UI / HUD | `App.jsx`, `index.css` |
| Add new weapon types | `Spaceship.jsx` (firing), `PlayerBullets.jsx` (projectiles) |
| Add new enemy attack patterns | `EnemyShips.jsx`, `Missiles.jsx`, `EnemyLasers.jsx`, `SpaceMines.jsx` |
