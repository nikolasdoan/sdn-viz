import React, { useRef, useState, useEffect, useCallback } from 'react';
import { VisualizerScene } from './VisualizerScene';
import { engine } from './AudioEngine';
import { gameState } from './GameState';
import './index.css';

const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [fileName, setFileName] = useState("No file selected");
  const [game, setGame] = useState({ health: 5, maxHealth: 5, score: 0, combo: 1, wave: 1, kills: 0, weaponLevel: 1 });
  const audioRef = useRef(null);

  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Capture mode state
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureStatus, setCaptureStatus] = useState(null); // 'listening' | 'playing' | null
  const [capturePaused, setCapturePaused] = useState(false);
  const captureLoopRef = useRef(null);

  // Countdown state
  const [countdown, setCountdown] = useState(null); // 3, 2, 1, 'GO' or null

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

  // Auto-play / pause logic (file mode)
  useEffect(() => {
    if (isCapturing) return; // capture mode handles its own loop
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
  }, [isPlaying, isCapturing]);

  const sampleTracks = [
    { name: 'One Love', file: '/songs/WINARTA - One Love [NCS].mp3' },
    { name: 'Burn it Down', file: '/songs/Robin Hustin & Jessica Chertock - Burn it Down [NCS].mp3' },
    { name: 'Light It Up', file: '/songs/Robin Hustin x TobiMorrow - Light It Up (feat. Jex) [NCS].mp3' },
  ];

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (file) {
      // Stop capture mode if active
      if (isCapturing) stopCapture();

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

  const startCountdown = () => {
    return new Promise((resolve) => {
      setCountdown(3);
      setTimeout(() => setCountdown(2), 1000);
      setTimeout(() => setCountdown(1), 2000);
      setTimeout(() => {
        setCountdown('GO');
        setTimeout(() => {
          setCountdown(null);
          resolve();
        }, 500);
      }, 3000);
    });
  };

  const handleSampleTrack = async (track) => {
    if (isCapturing) stopCapture();

    setFileName(track.name);
    setIsAnalyzing(true);
    if (isPlaying) setIsPlaying(false);

    engine.init(audioRef.current);
    if (engine.audioContext.state === 'suspended') {
      await engine.audioContext.resume();
    }

    // Fetch the file for pre-analysis
    const response = await fetch(track.file);
    const blob = await response.blob();
    const file = new File([blob], track.name, { type: blob.type });
    await engine.analyzeTrack(file);

    if (audioRef.current) {
      audioRef.current.src = track.file;
      audioRef.current.load();
    }

    setIsAnalyzing(false);
    setHasStarted(true);
    gameState.reset();

    // Countdown then play
    await startCountdown();
    setIsPlaying(true);
  };

  // --- Capture Mode ---
  const handleCapture = async () => {
    try {
      // Set up song detection callbacks
      engine.onSongStart = () => {
        setCaptureStatus('playing');
        gameState.reset();
        setHasStarted(true);
      };

      engine.onSongEnd = () => {
        setCaptureStatus('listening');
        // Game pauses — player sees their score, can wait for next song
      };

      await engine.initCapture();

      // Start active — song detection needs audio flowing to detect playback
      setIsCapturing(true);
      setIsPlaying(false);
      setCapturePaused(false);
      setCaptureStatus('listening');
      setFileName('System Audio');

      // Start the capture update loop
      const loop = () => {
        if (engine.isCaptureMode && engine.isInitialized) {
          engine.update();
          captureLoopRef.current = requestAnimationFrame(loop);
        }
      };
      captureLoopRef.current = requestAnimationFrame(loop);

    } catch (err) {
      console.error('Capture failed:', err);
      setCaptureStatus(null);
      setIsCapturing(false);
    }
  };

  const stopCapture = () => {
    if (captureLoopRef.current) {
      cancelAnimationFrame(captureLoopRef.current);
      captureLoopRef.current = null;
    }
    engine.stopCapture();
    engine.onSongStart = null;
    engine.onSongEnd = null;
    setIsCapturing(false);
    setCaptureStatus(null);
    setCapturePaused(false);
  };

  const toggleCapturePause = () => {
    if (!engine.captureStream) return;
    const tracks = engine.captureStream.getAudioTracks();
    if (capturePaused) {
      tracks.forEach(t => { t.enabled = true; });
      setCapturePaused(false);
    } else {
      tracks.forEach(t => { t.enabled = false; });
      setCapturePaused(true);
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

      {countdown !== null && (
        <div className="countdown-overlay">
          <div className="countdown-number">{countdown}</div>
        </div>
      )}

      <div className="ui-overlay">
        <header className="header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 className="title">SOUND_VOYAGE.JS</h1>
              <p className="subtitle"><a href="https://www.tecxmate.com" target="_blank" rel="noopener noreferrer" className="tecxmate-link">By TECXMATE.COM</a></p>
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
                    <span key={i} className={`health-prism ${i >= game.health ? 'empty' : ''}`}>
                      ◆
                    </span>
                  ))}
                </div>
                <div className="item-legend">
                  <span className="legend-item"><span className="legend-icon repair">◆</span> REPAIR</span>
                  <span className="legend-item"><span className="legend-icon powerup">◎</span> POWER UP</span>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Mobile: hide panel during active gameplay */}
        {isMobile && hasStarted && isPlaying && game.health > 0 ? null : (
          <>
            {/* Capture mode playing — minimal controls */}
            {isCapturing && captureStatus === 'playing' ? (
              <div className="control-panel glass-panel" style={{ padding: '0.8rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <button className="cyber-button capture-btn active" onClick={stopCapture} style={{ padding: '0.5rem 1rem', fontSize: '0.75rem' }}>
                    [ STOP CAPTURE ]
                  </button>
                  <button className="cyber-button play-btn" onClick={toggleCapturePause} style={{ padding: '0.5rem 1rem', fontSize: '0.75rem' }}>
                    {capturePaused ? '> PLAY' : '|| PAUSE'}
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
              </div>
            ) : isMobile && hasStarted && game.health <= 0 ? (
              /* Mobile game-over: show restart + track select */
              <div className="control-panel glass-panel mobile">
                <div className="game-status">
                  <div className="game-over-text">SHIP CRITICAL</div>
                  <div className="final-score">SCORE: {Math.floor(game.score).toLocaleString()}</div>
                  <button className="cyber-button primary-btn" onClick={handleRestart}>
                    [ REPAIR & RESTART ]
                  </button>
                </div>
                <div className="input-section">
                  <div className="section-label">SELECT A TRACK</div>
                  <div className="section-row" style={{ flexDirection: 'column' }}>
                    {sampleTracks.map((track, i) => (
                      <button key={i} className="cyber-button sample-btn mobile-sample-btn" onClick={() => handleSampleTrack(track)}>
                        {track.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* Default panel */
              <div className={`control-panel glass-panel ${isMobile ? 'mobile' : ''}`}>
                {isMobile ? (
                  <>
                    <div className="input-section">
                      <div className="section-label">SELECT A TRACK</div>
                      <div className="section-row" style={{ flexDirection: 'column' }}>
                        {sampleTracks.map((track, i) => (
                          <button key={i} className="cyber-button sample-btn mobile-sample-btn" onClick={() => handleSampleTrack(track)} disabled={isAnalyzing}>
                            {isAnalyzing ? '[ ANALYZING... ]' : track.name}
                          </button>
                        ))}
                      </div>
                      <div className="mobile-hint">Touch to move ship — auto-fires</div>
                    </div>
                    {!hasStarted && !isAnalyzing && (
                      <p className="subtitle" style={{ textAlign: "center" }}>Pick a song to start playing</p>
                    )}
                  </>
                ) : (
                  <>
                    <div className="input-section">
                      <div className="section-label">FILE MODE</div>
                      <div className="section-row">
                        <label className="cyber-button upload-btn">
                          {isAnalyzing ? '[ ANALYZING... ]' : 'LOCAL TRACK [BEST]'}
                          <input type="file" accept="audio/*" onChange={handleFileUpload} style={{ display: 'none' }} disabled={isAnalyzing} />
                        </label>
                        <span className="section-divider">or try</span>
                        {sampleTracks.map((track, i) => (
                          <button key={i} className="cyber-button sample-btn" onClick={() => handleSampleTrack(track)} disabled={isAnalyzing}>
                            {track.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="input-section">
                      <div className="section-label">CAPTURE MODE <span className="section-note">CHROME ONLY</span></div>
                      <div className="section-row">
                        {!isCapturing ? (
                          <button className="cyber-button capture-btn" onClick={handleCapture}>CAPTURE AUDIO</button>
                        ) : (
                          <button className="cyber-button capture-btn active" onClick={stopCapture}>[ STOP CAPTURE ]</button>
                        )}
                      </div>
                      <div className="capture-instructions">
                        <div>1. Open a recommended track below in another tab</div>
                        <div>2. Click CAPTURE AUDIO and select that tab (check "Share audio")</div>
                        <div>3. Come back here and press PLAY when ready</div>
                      </div>
                      {!hasStarted && !isAnalyzing && !isCapturing && (
                        <div className="recommended-tracks">
                          <div className="recommended-label">RECOMMENDED TRACKS</div>
                          <div className="recommended-list">
                            <a href="https://www.youtube.com/watch?v=fg8dZH5VDAs" target="_blank" rel="noopener noreferrer">IÖN - Starlights</a>
                            <a href="https://www.youtube.com/watch?v=Y2Sv_V7czgo" target="_blank" rel="noopener noreferrer">Trivecta - Ghost in the Machine</a>
                            <a href="https://www.youtube.com/watch?v=9vKAt6FT3Qg" target="_blank" rel="noopener noreferrer">Kaskade - Obvious</a>
                            <a href="https://www.youtube.com/watch?v=U9kaaBTzBCA" target="_blank" rel="noopener noreferrer">Atmosphere</a>
                            <a href="https://www.youtube.com/watch?v=UKou-bIHgYA" target="_blank" rel="noopener noreferrer">Nu Aspect - Sweet Release</a>
                            <a href="https://www.youtube.com/watch?v=c2t0UljO_AY" target="_blank" rel="noopener noreferrer">Virtual Self - a.i.ngel</a>
                          </div>
                        </div>
                      )}
                    </div>

                    <span className="file-name">{fileName}</span>

                    {isCapturing && captureStatus === 'listening' && (
                      <p className="subtitle capture-listening" style={{ textAlign: "center" }}>Listening for audio... Play a song to begin.</p>
                    )}

                    {!hasStarted && !isAnalyzing && !isCapturing && (
                      <p className="subtitle" style={{ textAlign: "center" }}>Please load an audio file or capture system audio to begin.</p>
                    )}
                  </>
                )}

                {hasStarted && !isAnalyzing && !isCapturing && !isMobile && (
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
                        <button className="cyber-button primary-btn" onClick={handleRestart}>[ REPAIR & RESTART ]</button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}
        {hasStarted && !isMobile && (
          <div className="controls-hint">
            <div>ARROW KEYS — Move</div>
            <div>SPACE — Fire</div>
          </div>
        )}
        {hasStarted && isMobile && (
          <div className="controls-hint">
            <div>TOUCH — Move & Fire</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
