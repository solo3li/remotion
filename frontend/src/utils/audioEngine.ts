/**
 * Native AV Sync & Audio Engine using Web Audio API and HTMLAudioElement
 * Provides real sound playback from speakers, synchronized with the timeline clock.
 */

class AudioPlaybackEngine {
  private ctx: AudioContext | null = null;
  private audioElements: Map<string, HTMLAudioElement> = new Map();
  private synthInterval: number | null = null;
  private isMuted: boolean = false;
  private masterGain: GainNode | null = null;

  private initContext() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  // Play synthetic ambient lofi chord when demo audio clip is active
  public startSyntheticBeat(bpm: number = 95) {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx || !this.masterGain || this.synthInterval) return;

    const notes = [220, 261.63, 329.63, 392]; // A minor 7th chord (A3, C4, E4, G4)
    let step = 0;

    const tick = () => {
      if (!this.ctx || !this.masterGain || this.isMuted) return;
      try {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        const freq = notes[step % notes.length];
        step++;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

        gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.35);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.36);
      } catch (e) {}
    };

    tick();
    const intervalMs = (60 / bpm) * 1000;
    this.synthInterval = window.setInterval(tick, intervalMs);
  }

  public stopSyntheticBeat() {
    if (this.synthInterval) {
      clearInterval(this.synthInterval);
      this.synthInterval = null;
    }
  }

  // Play real audio file from MinIO/URL synchronized to timeline offset
  public syncAudioClip(clipId: string, src: string, offsetSeconds: number, isPlaying: boolean, trackMuted: boolean = false) {
    if (trackMuted || this.isMuted) {
      this.stopClip(clipId);
      return;
    }

    if (!src) {
      // No real file URL -> use rhythmic synth beat
      if (isPlaying) {
        this.startSyntheticBeat();
      } else {
        this.stopSyntheticBeat();
      }
      return;
    }

    this.stopSyntheticBeat();
    this.initContext();

    let el = this.audioElements.get(clipId);
    if (!el) {
      el = new Audio(src);
      el.preload = 'auto';
      this.audioElements.set(clipId, el);
    }

    if (Math.abs(el.currentTime - offsetSeconds) > 0.3) {
      el.currentTime = Math.max(0, offsetSeconds);
    }

    if (isPlaying) {
      if (el.paused) {
        el.play().catch(() => {});
      }
    } else {
      if (!el.paused) {
        el.pause();
      }
    }
  }

  public stopClip(clipId: string) {
    const el = this.audioElements.get(clipId);
    if (el) {
      el.pause();
    }
  }

  public stopAll() {
    this.stopSyntheticBeat();
    this.audioElements.forEach((el) => el.pause());
  }

  public setMute(muted: boolean) {
    this.isMuted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(muted ? 0 : 1, this.ctx.currentTime);
    }
    if (muted) {
      this.stopAll();
    }
  }

  // Play Sound FX (Whoosh, Pop, Chime, Success, Bell)
  public playSfx(type: 'whoosh' | 'pop' | 'chime' | 'success' | 'bass') {
    this.initContext();
    if (!this.ctx || !this.masterGain) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      if (type === 'whoosh') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(700, now + 0.15);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.3);
        gain.gain.setValueAtTime(0.01, now);
        gain.gain.linearRampToValueAtTime(0.15, now + 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.31);
      } else if (type === 'pop') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(650, now);
        osc.frequency.exponentialRampToValueAtTime(220, now + 0.09);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.1);
      } else if (type === 'chime') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(1760, now + 0.05);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.41);
      } else if (type === 'success') {
        // Two-tone arpeggio
        const osc2 = this.ctx.createOscillator();
        const gain2 = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now); // C5
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.25);

        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(659.25, now + 0.12); // E5
        gain2.gain.setValueAtTime(0.15, now + 0.12);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc2.connect(gain2);
        gain2.connect(this.masterGain);
        osc2.start(now + 0.12);
        osc2.stop(now + 0.51);
      } else if (type === 'bass') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(45, now + 0.35);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.36);
      }
    } catch (e) {}
  }
}

export const audioEngine = new AudioPlaybackEngine();
