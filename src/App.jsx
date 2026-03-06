import React, { useRef, useState, useEffect } from 'react';
import { VisualizerScene } from './VisualizerScene';
import { engine } from './AudioEngine';
import './index.css';

function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [fileName, setFileName] = useState("No file selected");
  const audioRef = useRef(null);

  // High-Tech adjustable visual parameters (future expansion could hook these to shaders)
  const [bloomIntensity, setBloomIntensity] = useState(2.5);
  const [particleScaleMultiplier, setParticleScaleMultiplier] = useState(1.0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Auto-play / pause logic connecting audio element to state
  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.play();
        // Start the animation loop pulling data from engine immediately when playing
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

  // Handle the initial user gesture required to start the Web Audio Context
  const handleStart = async () => {
    if (audioRef.current) {
      engine.init(audioRef.current);
      if (engine.audioContext.state === 'suspended') {
        await engine.audioContext.resume();
      }
      setIsPlaying(true);
      setHasStarted(true);
    }
  };

  // Handle local MP3 file upload and Pre-Analysis
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (file) {
      setFileName(file.name);
      setIsAnalyzing(true);
      if (isPlaying) setIsPlaying(false);

      // Initialize engine to get AudioContext so we can decode the file
      engine.init(audioRef.current);
      if (engine.audioContext.state === 'suspended') {
        await engine.audioContext.resume();
      }

      // Pre-analyze the track (heavy compute)
      await engine.analyzeTrack(file);

      const fileUrl = URL.createObjectURL(file);
      if (audioRef.current) {
        audioRef.current.src = fileUrl;
      }

      setIsAnalyzing(false);
      setHasStarted(true);
      setIsPlaying(true);
    }
  };

  return (
    <div className="app-container">
      {/* Hidden Audio Element driving the Web Audio Context */}
      <audio ref={audioRef} crossOrigin="anonymous" loop />

      {/* R3F Canvas Layer (Background) */}
      <div className="canvas-wrapper">
        <VisualizerScene />
      </div>

      {/* Modern High-Tech UI Overlay (Foreground) */}
      <div className="ui-overlay">
        <header className="header">
          <h1 className="title">EPIC_VISUALIZER.JS</h1>
          <p className="subtitle">Grand Particles // Laser Core</p>
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
            <div className="playback-controls">
              <button className="cyber-button play-btn" onClick={() => setIsPlaying(!isPlaying)}>
                {isPlaying ? '|| PAUSE' : '> PLAY'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
