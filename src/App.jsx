import React, { useRef, useState, useEffect, useCallback } from 'react';
import { VisualizerScene } from './VisualizerScene';
import { engine } from './AudioEngine';
import { gameState } from './GameState';
import './index.css';

function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [fileName, setFileName] = useState("No file selected");
  const [game, setGame] = useState({ health: 5, maxHealth: 5, score: 0, combo: 1, wave: 1, kills: 0, weaponLevel: 1 });
  const audioRef = useRef(null);

  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // HUD flash states
  const [nearMissFlash, setNearMissFlash] = useState(null);
  const [waveFlash, setWaveFlash] = useState(null);
  const [repairFlash, setRepairFlash] = useState(false);
  const [killFlash, setKillFlash] = useState(false);
  const [powerUpFlash, setPowerUpFlash] = useState(null);

  // Track last processed flash to avoid re-triggering
  const lastFlashTime = useRef(0);

  // Subscribe to game state changes
  useEffect(() => {
    const unsubscribe = gameState.subscribe((state) => {
      setGame({
        health: state.health,
        maxHealth: state.maxHealth,
        score: state.score,
        combo: state.combo,
        wave: state.wave,
        kills: state.kills,
        weaponLevel: state.weaponLevel,
      });

      // Process HUD flash events
      if (state.hudFlash && state.hudFlash.time !== lastFlashTime.current) {
        lastFlashTime.current = state.hudFlash.time;

        if (state.hudFlash.type === 'near-miss') {
          setNearMissFlash({ combo: state.hudFlash.value });
          setTimeout(() => setNearMissFlash(null), 1200);
        } else if (state.hudFlash.type === 'wave') {
          setWaveFlash({ wave: state.hudFlash.value });
          setTimeout(() => setWaveFlash(null), 2500);
        } else if (state.hudFlash.type === 'repair') {
          setRepairFlash(true);
          setTimeout(() => setRepairFlash(false), 1500);
        } else if (state.hudFlash.type === 'kill') {
          setKillFlash(true);
          setTimeout(() => setKillFlash(false), 1000);
        } else if (state.hudFlash.type === 'powerup') {
          setPowerUpFlash({ level: state.hudFlash.value });
          setTimeout(() => setPowerUpFlash(null), 1500);
        }
      }
    });
    return unsubscribe;
  }, []);

  // Auto-play / pause logic
  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.play();
        const updateLoop = () => {
          if (isPlaying) {
            engine.update();
            requestAnimationFrame(updateLoop);
          }
        };
        requestAnimationFrame(updateLoop);
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying]);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (file) {
      setFileName(file.name);
      setIsAnalyzing(true);
      if (isPlaying) setIsPlaying(false);

      engine.init(audioRef.current);
      if (engine.audioContext.state === 'suspended') {
        await engine.audioContext.resume();
      }

      await engine.analyzeTrack(file);

      const fileUrl = URL.createObjectURL(file);
      if (audioRef.current) {
        audioRef.current.src = fileUrl;
        audioRef.current.load();
      }

      setIsAnalyzing(false);
      setHasStarted(true);
      setIsPlaying(true);
      gameState.reset();
    }
  };

  const handleRestart = () => {
    gameState.reset();
  };

  return (
    <div className="app-container">
      <audio ref={audioRef} crossOrigin="anonymous" loop />

      <div className="canvas-wrapper">
        <VisualizerScene />
      </div>

      {/* Center-screen flash overlays */}
      {nearMissFlash && (
        <div className="hud-center-flash near-miss-flash">
          <div className="flash-text">NEAR MISS!</div>
          {nearMissFlash.combo > 1 && (
            <div className="flash-combo">x{nearMissFlash.combo} COMBO</div>
          )}
        </div>
      )}

      {waveFlash && (
        <div className="hud-center-flash wave-flash">
          <div className="wave-text">WAVE {waveFlash.wave}</div>
        </div>
      )}

      {repairFlash && (
        <div className="hud-center-flash repair-flash">
          <div className="flash-text">REPAIRED</div>
        </div>
      )}

      {killFlash && (
        <div className="hud-center-flash kill-flash">
          <div className="flash-text">ENEMY DESTROYED</div>
        </div>
      )}

      {powerUpFlash && (
        <div className="hud-center-flash powerup-flash">
          <div className="flash-text">WEAPON LEVEL {powerUpFlash.level}</div>
        </div>
      )}

      <div className="ui-overlay">
        <header className="header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 className="title">EPIC_VISUALIZER.JS</h1>
              <p className="subtitle">Grand Particles // Laser Core</p>
            </div>

            {/* Score + Combo + Health */}
            {hasStarted && (
              <div className="hud-right">
                <div className="score-display">{Math.floor(game.score).toLocaleString()}</div>
                {game.combo > 1 && (
                  <div className="combo-display">x{game.combo} COMBO</div>
                )}
                <div className="wave-display">WAVE {game.wave} | KILLS {game.kills} | WPN LV{game.weaponLevel}</div>
                <div className="health-container">
                  {Array.from({ length: game.maxHealth }).map((_, i) => (
                    <span key={i} className={`heart ${i >= game.health ? 'empty' : ''}`}>
                      {i >= game.health ? '\u2661' : '\u2665'}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </header>

        <div className="control-panel glass-panel">
          <div className="file-upload-section">
            <label className="cyber-button upload-btn">
              {isAnalyzing ? '[ ANALYZING TRACK... ]' : '[ LOAD TRACK ]'}
              <input
                type="file"
                accept="audio/*"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
                disabled={isAnalyzing}
              />
            </label>
            <span className="file-name">{fileName}</span>
          </div>

          {!hasStarted && !isAnalyzing && (
            <p className="subtitle" style={{ textAlign: "center" }}>Please load an audio file to begin.</p>
          )}

          {hasStarted && !isAnalyzing && (
            <>
              <div className="playback-controls">
                <button className="cyber-button play-btn" onClick={() => setIsPlaying(!isPlaying)}>
                  {isPlaying ? '|| PAUSE' : '> PLAY'}
                </button>
              </div>

              {game.health <= 0 && (
                <div className="game-status">
                  <div className="game-over-text">SHIP CRITICAL</div>
                  <div className="final-score">SCORE: {Math.floor(game.score).toLocaleString()}</div>
                  <button className="cyber-button primary-btn" onClick={handleRestart}>
                    [ REPAIR & RESTART ]
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
