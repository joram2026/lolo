// Motivational Audio Engine for Running Trading Bots
// Built using Web Audio API to generate a high-quality, uplifting cyber-trading instrumental track
// Features: Warm Pad Chords, Rhythmic Arpeggiated Bass, Ambient Chime Leads, Master Volume & Delay FX

class MotivationalAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private delayNode: DelayNode | null = null;
  private delayGain: GainNode | null = null;
  private isRunning: boolean = false;
  private isMuted: boolean = false;
  private volume: number = 0.35; // default 35% volume
  private timerId: any = null;
  private currentStep: number = 0;
  private currentChordIndex: number = 0;

  // Chord frequencies (Hz) for uplifting chord progression: Cm9 -> AbMaj7 -> EbMaj9 -> BbAdd9
  private chordProgression = [
    // Cm9 (C2, C3, Eb3, G3, Bb3, D4)
    [65.41, 130.81, 155.56, 196.00, 233.08, 293.66],
    // AbMaj7 (Ab2, Ab3, C4, Eb4, G4, C5)
    [51.91, 103.83, 261.63, 311.13, 392.00, 523.25],
    // EbMaj9 (Eb2, Eb3, G3, Bb3, D4, F4)
    [77.78, 155.56, 196.00, 233.08, 293.66, 349.23],
    // BbAdd9 (Bb2, Bb3, D4, F4, C5, D5)
    [58.27, 116.54, 293.66, 349.23, 523.25, 587.33]
  ];

  // Pentatonic lead frequencies (Hz) for inspiring arpeggios
  private leadNotes = [
    261.63, // C4
    293.66, // D4
    311.13, // Eb4
    392.00, // G4
    466.16, // Bb4
    523.25, // C5
    587.33, // D5
    622.25, // Eb5
    783.99, // G5
    932.33  // Bb5
  ];

  private initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();

      // Master Gain
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);

      // Stereo Delay / Reverb Effect
      this.delayNode = this.ctx.createDelay();
      this.delayNode.delayTime.setValueAtTime(0.27, this.ctx.currentTime); // ~270ms delay
      this.delayGain = this.ctx.createGain();
      this.delayGain.gain.setValueAtTime(0.25, this.ctx.currentTime); // 25% feedback

      this.delayNode.connect(this.delayGain);
      this.delayGain.connect(this.delayNode);
      this.delayNode.connect(this.masterGain);

      this.masterGain.connect(this.ctx.destination);
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public start() {
    if (this.isRunning) return;
    this.initContext();
    if (!this.ctx || !this.masterGain) return;

    this.isRunning = true;
    this.currentStep = 0;
    this.currentChordIndex = 0;

    // Smooth fade in
    const now = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(0, now);
    this.masterGain.gain.linearRampToValueAtTime(this.isMuted ? 0 : this.volume, now + 1.5);

    // Loop at ~120 BPM (125ms per 16th step)
    const stepInterval = 135; 
    this.timerId = setInterval(() => {
      this.tick();
    }, stepInterval);
  }

  private tick() {
    if (!this.isRunning || !this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const chord = this.chordProgression[this.currentChordIndex];

    // Every 16 steps, switch chord
    if (this.currentStep % 16 === 0) {
      this.playPadChord(chord, now);
    }

    // Every 2 steps (8th notes), play rhythmic pulse / bass
    if (this.currentStep % 2 === 0) {
      const rootFreq = chord[0];
      const octFreq = chord[1];
      const isDownbeat = this.currentStep % 4 === 0;
      this.playBassPulse(isDownbeat ? rootFreq : octFreq, now, isDownbeat ? 0.35 : 0.2);
    }

    // Arpeggio / Chime lead on specific steps (16th rhythm: 0, 3, 6, 8, 11, 14)
    if ([0, 3, 6, 8, 11, 14].includes(this.currentStep % 16)) {
      const noteIdx = (this.currentStep * 3 + this.currentChordIndex * 2) % this.leadNotes.length;
      const freq = this.leadNotes[noteIdx];
      this.playLeadNote(freq, now);
    }

    this.currentStep++;
    if (this.currentStep % 16 === 0) {
      this.currentChordIndex = (this.currentChordIndex + 1) % this.chordProgression.length;
    }
  }

  // Soft synth pad chord
  private playPadChord(freqs: number[], now: number) {
    if (!this.ctx || !this.masterGain) return;

    freqs.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const osc2 = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      const filter = this.ctx!.createBiquadFilter();

      osc.type = 'sawtooth';
      osc2.type = 'sine';

      // Slight detune for warm analog feel
      osc.frequency.setValueAtTime(freq, now);
      osc2.frequency.setValueAtTime(freq * 1.003, now);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(600 + idx * 150, now);
      filter.frequency.exponentialRampToValueAtTime(1400 + idx * 200, now + 1.2);
      filter.frequency.exponentialRampToValueAtTime(500 + idx * 100, now + 2.1);

      // Envelope: 0.8s attack, 2.0s sustain, 0.5s release
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.04, now + 0.6);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);

      osc.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);

      if (this.delayNode) {
        gain.connect(this.delayNode);
      }
      gain.connect(this.masterGain!);

      osc.start(now);
      osc2.start(now);
      osc.stop(now + 2.3);
      osc2.stop(now + 2.3);
    });
  }

  // Energetic bass pulse
  private playBassPulse(freq: number, now: number, intensity: number) {
    if (!this.ctx || !this.masterGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(250, now);
    filter.frequency.exponentialRampToValueAtTime(80, now + 0.15);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.12 * intensity, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.2);
  }

  // Chime / Lead motivational note
  private playLeadNote(freq: number, now: number) {
    if (!this.ctx || !this.masterGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(freq * 1.5, now);
    filter.Q.setValueAtTime(3, now);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.06, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

    osc.connect(filter);
    filter.connect(gain);

    if (this.delayNode) {
      gain.connect(this.delayNode);
    }
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.5);
  }

  public stop() {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }

    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
      this.masterGain.gain.linearRampToValueAtTime(0, now + 0.5);
    }
  }

  public pause() {
    if (this.ctx && this.ctx.state === 'running') {
      this.ctx.suspend();
    }
  }

  public resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.ctx && this.masterGain && !this.isMuted) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(this.volume, now);
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, now);
    }
    return this.isMuted;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }
}

export const motivationalAudio = new MotivationalAudioEngine();
