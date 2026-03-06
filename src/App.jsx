import React, { useRef, useState, useEffect } from 'react';
import { VisualizerScene } from './VisualizerScene';
import { engine } from './AudioEngine';
import { gameState } from './GameState';
import './index.css';

function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [fileName, setFileName] = useState("No file selected");
  const [game, setGame] = useState({ health: 5, maxHealth: 5 });
  const audioRef = useRef(null);

  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Subscribe to game state changes (health, etc.)
  useEffect(() => {
    const unsubscribe = gameState.subscribe((state) => {
      setGame({ health: state.health, maxHealth: state.maxHealth });
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
        audioRef.current.load(); // Ensure source is loaded
      }

      setIsAnalyzing(false);
      setHasStarted(true);
      setIsPlaying(true);
      gameState.reset(); // Reset game state on new track
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

      <div className="ui-overlay">
        <header className="header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 className="title">EPIC_VISUALIZER.JS</h1>
              <p className="subtitle">Grand Particles // Laser Core</p>
            </div>

            {/* Health Indicators (Hearts) */}
            {hasStarted && (
              <div className="health-container">
                {Array.from({ length: game.maxHealth }).map((_, i) => (
                  <span key={i} className={`heart ${i >= game.health ? 'empty' : ''}`}>
                    {i >= game.health ? '♡' : '♥'}
                  </span>
                ))}
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
