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

    // Pre-Analysis EDM State Data
    this.energyMap = [];
    this.currentState = 'chill'; // 'chill', 'buildup', 'drop'
    this.chunkDuration = 0.5; // Analyze energy in 0.5 second chunks
  }

  // Called when the user clicks Initialize
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


    // --- 2. Update EDM State Machine ---
    if (this.energyMap.length > 0 && this.audioElement) {
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
}

export const engine = new AudioEngine();
