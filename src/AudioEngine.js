export class AudioEngine {
  constructor() {
    this.audioContext = null;
    this.analyser = null;
    this.audioElement = null;
    this.dataArray = null;
    this.timeDataArray = null;
    this.isInitialized = false;

    // Real-time Averages
    this.averageBass = 0;
    this.averageHighs = 0;
    this.averageMid = 0;
    this.averageOverall = 0;

    // Beat detection
    this.prevBass = 0;
    this.beatCooldown = 0;        // prevents double-triggering
    this.isBeat = false;          // true on the frame a beat is detected
    this.beatThreshold = 0.15;    // minimum bass spike to count as beat
    this.beatCooldownTime = 0.12; // minimum seconds between beats

    // Pre-Analysis EDM State Data
    this.energyMap = [];
    this.currentState = 'chill'; // 'chill', 'buildup', 'drop'
    this.chunkDuration = 0.5; // Analyze energy in 0.5 second chunks
    this.duration = 0;
    this.currentTime = 0;

    // Capture mode (system audio)
    this.isCaptureMode = false;
    this.captureStream = null;

    // Song detection for capture mode
    this.songPlaying = false;
    this.silenceTimer = 0;
    this.silenceThreshold = 0.02;   // below this = silence
    this.songStartThreshold = 0.04; // above this = song started
    this.silenceDuration = 2.5;     // seconds of silence before song is "ended"
    this.onSongStart = null;        // callback
    this.onSongEnd = null;          // callback
  }

  // Called when the user clicks Initialize (file mode)
  init(audioElement) {
    if (this.isInitialized) return;

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.audioContext = new AudioContext();

    this.audioElement = audioElement;

    // Create Analyser for real-time reactive visuals
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.85;

    this.source = this.audioContext.createMediaElementSource(this.audioElement);
    this.source.connect(this.analyser);
    this.analyser.connect(this.audioContext.destination);

    const bufferLength = this.analyser.frequencyBinCount;
    this.dataArray = new Uint8Array(bufferLength);
    this.timeDataArray = new Uint8Array(this.analyser.fftSize);

    this.isInitialized = true;
    this.isCaptureMode = false;
  }

  // Called when user clicks Capture Audio (system/tab audio)
  async initCapture() {
    // Clean up previous capture if any
    this.stopCapture();

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    // Request system/tab audio via getDisplayMedia
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,  // required by browser, we ignore it
      audio: true,
    });

    // Stop the video track immediately — we only need audio
    stream.getVideoTracks().forEach(t => t.stop());

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      throw new Error('No audio track selected. Make sure to check "Share audio" when picking a tab.');
    }

    this.captureStream = stream;

    // Create analyser
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.85;

    this.source = this.audioContext.createMediaStreamSource(stream);
    this.source.connect(this.analyser);
    // Don't connect to destination — avoids feedback loop (audio already plays from the source app)

    const bufferLength = this.analyser.frequencyBinCount;
    this.dataArray = new Uint8Array(bufferLength);
    this.timeDataArray = new Uint8Array(this.analyser.fftSize);

    this.isInitialized = true;
    this.isCaptureMode = true;
    this.songPlaying = false;
    this.silenceTimer = 0;
    this.energyMap = [];

    // Listen for the user stopping the share via browser UI
    audioTracks[0].addEventListener('ended', () => {
      this.stopCapture();
      if (this.onSongEnd && this.songPlaying) {
        this.songPlaying = false;
        this.onSongEnd();
      }
    });
  }

  stopCapture() {
    if (this.captureStream) {
      this.captureStream.getTracks().forEach(t => t.stop());
      this.captureStream = null;
    }
    if (this.isCaptureMode) {
      this.isInitialized = false;
      this.isCaptureMode = false;
      this.songPlaying = false;
    }
  }

  // Pre-analyze an audio file to map out structure (Drops/Buildups)
  async analyzeTrack(file) {
    if (!this.audioContext) return;

    console.log("Starting Audio Analysis...");

    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

      // We will analyze the first channel (mono is fine for energy detection)
      const rawData = audioBuffer.getChannelData(0);
      const sampleRate = audioBuffer.sampleRate;
      const totalDuration = audioBuffer.duration;

      const chunkSize = Math.floor(sampleRate * this.chunkDuration);
      const totalChunks = Math.floor(rawData.length / chunkSize);

      this.energyMap = new Array(totalChunks).fill(0);

      let maxEnergy = 0;

      // Calculate RMS Energy for every chunk
      for (let i = 0; i < totalChunks; i++) {
        let sumSq = 0;
        const start = i * chunkSize;
        const end = start + chunkSize;

        for (let j = start; j < end; j++) {
          sumSq += rawData[j] * rawData[j];
        }

        const rms = Math.sqrt(sumSq / chunkSize);
        this.energyMap[i] = rms;
        if (rms > maxEnergy) maxEnergy = rms;
      }

      // Normalize energy map to 0.0 - 1.0 (relative to the track's absolute peak)
      if (maxEnergy > 0) {
        for (let i = 0; i < totalChunks; i++) {
          this.energyMap[i] = this.energyMap[i] / maxEnergy;
        }
      }

      console.log("Analysis Complete. Energy Map:", this.energyMap);

    } catch (e) {
      console.error("Error decoding audio data:", e);
    }
  }

  update() {
    if (!this.isInitialized) return;
    // File mode needs audioElement; capture mode doesn't
    if (!this.isCaptureMode && !this.audioElement) return;

    if (!this.isCaptureMode) {
      this.currentTime = this.audioElement.currentTime;
      this.duration = this.audioElement.duration || 0;
    }

    // --- 1. Update Real-Time FFT & Time Domain Data ---
    this.analyser.getByteFrequencyData(this.dataArray);
    this.analyser.getByteTimeDomainData(this.timeDataArray);

    let bassSum = 0;
    for (let i = 0; i < 7; i++) bassSum += this.dataArray[i];
    this.averageBass = bassSum / 7 / 255.0;

    let midSum = 0;
    for (let i = 7; i < 50; i++) midSum += this.dataArray[i];
    this.averageMid = midSum / (50 - 7) / 255.0;

    let highSum = 0;
    for (let i = 50; i < 250; i++) highSum += this.dataArray[i];
    this.averageHighs = highSum / (250 - 50) / 255.0;

    let totalSum = 0;
    for (let i = 0; i < this.dataArray.length; i++) totalSum += this.dataArray[i];
    this.averageOverall = totalSum / this.dataArray.length / 255.0;

    // --- Beat Detection (transient spike on bass) ---
    this.isBeat = false;
    if (this.beatCooldown > 0) {
      this.beatCooldown -= 1 / 60; // approximate frame time
    } else {
      const bassSpike = this.averageBass - this.prevBass;
      if (bassSpike > this.beatThreshold && this.averageBass > 0.25) {
        this.isBeat = true;
        this.beatCooldown = this.beatCooldownTime;
      }
    }
    this.prevBass = this.averageBass;

    // --- Song Detection (capture mode only) ---
    if (this.isCaptureMode) {
      this._detectSong();
    }

    // --- 2. Update EDM State Machine ---
    if (this.isCaptureMode) {
      // In capture mode, use real-time energy for state since we have no pre-analyzed map
      if (this.averageOverall > 0.35) {
        this.currentState = 'drop';
      } else if (this.averageOverall > 0.15) {
        this.currentState = 'buildup';
      } else {
        this.currentState = 'chill';
      }
    } else if (this.energyMap.length > 0 && this.audioElement) {
      // Find which chunk we are currently in based on playback time
      const currentTime = this.audioElement.currentTime;
      const currentChunkIndex = Math.floor(currentTime / this.chunkDuration);

      if (currentChunkIndex < this.energyMap.length) {
        const currentEnergy = this.energyMap[currentChunkIndex];

        // Look ahead to see if a massive spike is coming (Buildup detection)
        // Check the average energy over the next ~4 seconds
        let lookAheadAvg = currentEnergy;
        const lookAheadChunks = Math.floor(4.0 / this.chunkDuration);

        if (currentChunkIndex + lookAheadChunks < this.energyMap.length) {
          let sum = 0;
          for (let k = 1; k <= lookAheadChunks; k++) {
            sum += this.energyMap[currentChunkIndex + k];
          }
          lookAheadAvg = sum / lookAheadChunks;
        }

        // Simple State Machine Rules for EDM
        if (currentEnergy > 0.75) {
          this.currentState = 'drop'; // Screaming high energy
        } else if (lookAheadAvg > 0.75 && currentEnergy > 0.4 && currentEnergy < 0.75) {
          this.currentState = 'buildup'; // Approaching a drop rapidly
        } else {
          this.currentState = 'chill'; // Intro, breakdown, verse
        }
      }
    }
  }

  _detectSong() {
    const energy = this.averageOverall;

    if (!this.songPlaying) {
      // Waiting for a song to start
      if (energy > this.songStartThreshold) {
        this.songPlaying = true;
        this.silenceTimer = 0;
        if (this.onSongStart) this.onSongStart();
      }
    } else {
      // Song is playing — watch for silence
      if (energy < this.silenceThreshold) {
        this.silenceTimer += 1 / 60;
        if (this.silenceTimer >= this.silenceDuration) {
          this.songPlaying = false;
          this.silenceTimer = 0;
          if (this.onSongEnd) this.onSongEnd();
        }
      } else {
        this.silenceTimer = 0;
      }
    }
  }
}

export const engine = new AudioEngine();
