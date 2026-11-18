// =============================================================================
// Audio Service — Ringtone (Web Audio API) + Remote Audio + Device Management
// =============================================================================
import { sipLogger } from './LoggerService';

export class AudioService {
  /**
   * Remote RTP audio, one <audio> element per live SIP dialog — never
   * React-controlled. A single shared element used to be enough when only
   * one leg could ever be "active", but a conference bridges the primary
   * call and one or more merged legs at once: each needs its own element so
   * the browser's own audio mixer can play them all simultaneously instead
   * of the newest stream silently replacing the previous one.
   */
  private remoteAudioEls = new Map<string, HTMLAudioElement>();

  /** Speaker device chosen via setSpeakerDevice, re-applied to new elements */
  private preferredSinkId: string | null = null;

  // Web Audio API ringtone state
  private audioCtx: AudioContext | null = null;
  private ringtoneGain: GainNode | null = null;
  private ringtoneOsc1: OscillatorNode | null = null;
  private ringtoneOsc2: OscillatorNode | null = null;
  private ringtonePatternTimer: ReturnType<typeof setTimeout> | null = null;
  private isRinging = false;

  /** Removes the one-shot gesture listeners that unlock the AudioContext */
  private detachPrimer: (() => void) | null = null;

  constructor() {
    this.primeOnFirstGesture();
    sipLogger.info('AUDIO', 'AudioService initialised');
  }

  private getOrCreateAudioEl(callId: string): HTMLAudioElement {
    let el = this.remoteAudioEls.get(callId);
    if (el) return el;

    el = document.createElement('audio');
    el.autoplay = true;
    el.setAttribute('playsinline', '');
    el.style.display = 'none';
    document.body.appendChild(el);

    if (this.preferredSinkId) {
      const withSink = el as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
      if (typeof withSink.setSinkId === 'function') {
        withSink.setSinkId(this.preferredSinkId).catch(() => undefined);
      }
    }

    this.remoteAudioEls.set(callId, el);
    return el;
  }

  // ---------------------------------------------------------------------------
  // Autoplay policy
  //
  // Browsers create an AudioContext in the `suspended` state and only allow
  // resume() from a user gesture. An operator who opens the CRM and walks away
  // has never produced one, so the first incoming call would ring silently.
  // Create and unlock the context on the very first click/keypress instead.
  // ---------------------------------------------------------------------------

  private primeOnFirstGesture(): void {
    const prime = () => {
      try {
        const ctx = this.getAudioContext();
        // A zero-length silent buffer counts as playback and completes the
        // unlock on browsers that need more than resume().
        const buffer = ctx.createBuffer(1, 1, 22050);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
        sipLogger.info('AUDIO', `AudioContext primed (state=${ctx.state})`);
      } catch (err) {
        sipLogger.warn('AUDIO', 'AudioContext priming failed', err);
      }
      this.detachPrimer?.();
    };

    const events: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'touchstart'];
    events.forEach((ev) => window.addEventListener(ev, prime, { once: true, passive: true }));

    this.detachPrimer = () => {
      events.forEach((ev) => window.removeEventListener(ev, prime));
      this.detachPrimer = null;
    };
  }

  // ---------------------------------------------------------------------------
  // Remote Audio
  // ---------------------------------------------------------------------------

  setRemoteStream(callId: string, stream: MediaStream): void {
    // A real remote track just arrived (early media or the answered call) —
    // any locally synthesized ringback must stop so the two don't overlap.
    this.stopRingtone();
    const el = this.getOrCreateAudioEl(callId);
    el.srcObject = stream;
    el.play().catch((err: Error) => sipLogger.error('AUDIO', 'Remote audio play() blocked', err));
    sipLogger.info('AUDIO', `Remote stream attached  Call-ID=${callId}`);
  }

  /** Stop and remove one dialog's audio element — the others keep playing. */
  clearRemoteStream(callId: string): void {
    const el = this.remoteAudioEls.get(callId);
    if (!el) return;
    el.srcObject = null;
    el.pause();
    if (el.parentNode) el.parentNode.removeChild(el);
    this.remoteAudioEls.delete(callId);
    sipLogger.info('AUDIO', `Remote stream cleared  Call-ID=${callId}`);
  }

  /** Full teardown — every leg at once (call end, logout). */
  clearAllRemoteStreams(): void {
    for (const callId of [...this.remoteAudioEls.keys()]) this.clearRemoteStream(callId);
  }

  // ---------------------------------------------------------------------------
  // Ringtone — dual-tone 440 Hz + 480 Hz, 2 s on / 4 s off (ITU-T E.182)
  // ---------------------------------------------------------------------------

  playRingtone(): void {
    if (this.isRinging) return;
    this.isRinging = true;
    sipLogger.info('AUDIO', 'Ringtone → START');
    this.scheduleRingBurst();
  }

  stopRingtone(): void {
    if (!this.isRinging) return;
    this.isRinging = false;
    this.clearRingtonePattern();
    this.teardownOscillators();
    sipLogger.info('AUDIO', 'Ringtone → STOP');
  }

  private getAudioContext(): AudioContext {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      this.audioCtx = new AudioContext();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => undefined);
    }
    return this.audioCtx;
  }

  private scheduleRingBurst(): void {
    if (!this.isRinging) return;

    const ctx = this.getAudioContext();
    const now = ctx.currentTime;

    // Gain node — controls volume envelope
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.setValueAtTime(0, now + 2.0); // ring duration = 2 s
    gain.connect(ctx.destination);
    this.ringtoneGain = gain;

    // Oscillator 1 — 440 Hz
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(440, now);
    osc1.connect(gain);
    osc1.start(now);
    osc1.stop(now + 2.0);
    this.ringtoneOsc1 = osc1;

    // Oscillator 2 — 480 Hz
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(480, now);
    osc2.connect(gain);
    osc2.start(now);
    osc2.stop(now + 2.0);
    this.ringtoneOsc2 = osc2;

    // Schedule next burst after 6 s (2 s ring + 4 s silence)
    this.ringtonePatternTimer = setTimeout(() => {
      this.teardownOscillators();
      if (this.isRinging) this.scheduleRingBurst();
    }, 6000);
  }

  private teardownOscillators(): void {
    try { this.ringtoneOsc1?.disconnect(); } catch { /* ignore */ }
    try { this.ringtoneOsc2?.disconnect(); } catch { /* ignore */ }
    try { this.ringtoneGain?.disconnect(); } catch { /* ignore */ }
    this.ringtoneOsc1 = null;
    this.ringtoneOsc2 = null;
    this.ringtoneGain = null;
  }

  private clearRingtonePattern(): void {
    if (this.ringtonePatternTimer !== null) {
      clearTimeout(this.ringtonePatternTimer);
      this.ringtonePatternTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Device Management
  // ---------------------------------------------------------------------------

  async getAudioDevices(): Promise<{ inputs: MediaDeviceInfo[]; outputs: MediaDeviceInfo[] }> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return {
        inputs:  devices.filter(d => d.kind === 'audioinput'),
        outputs: devices.filter(d => d.kind === 'audiooutput'),
      };
    } catch (err) {
      sipLogger.error('AUDIO', 'Failed to enumerate audio devices', err);
      return { inputs: [], outputs: [] };
    }
  }

  /** Set audio output device (speaker). Requires Permissions-Policy: speaker-selection */
  setSpeakerDevice(deviceId: string): void {
    this.preferredSinkId = deviceId;
    let supported = false;
    for (const el of this.remoteAudioEls.values()) {
      const withSink = el as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
      if (typeof withSink.setSinkId === 'function') {
        supported = true;
        withSink.setSinkId(deviceId).catch((err: Error) =>
          sipLogger.error('AUDIO', 'setSinkId failed', err),
        );
      }
    }
    if (supported || this.remoteAudioEls.size === 0) {
      sipLogger.info('AUDIO', `Speaker device set to ${deviceId}`);
    } else {
      sipLogger.warn('AUDIO', 'setSinkId not supported in this browser');
    }
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  dispose(): void {
    this.detachPrimer?.();
    this.stopRingtone();
    this.clearAllRemoteStreams();

    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close().catch(() => undefined);
    }

    sipLogger.info('AUDIO', 'AudioService disposed');
  }
}
