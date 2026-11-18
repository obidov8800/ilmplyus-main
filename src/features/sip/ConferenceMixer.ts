// =============================================================================
// Conference Mixer — makes a 3-(or more-)way conference actually 3-way
//
// Why this exists
// ----------------
// A browser SIP client (sip.js/SimpleUser/UserAgent) has NO server-side
// conference bridge — the operator's tab holds two (or more) completely
// separate RTCPeerConnections, one per leg (e.g. customer + consulted
// colleague). Taking both off hold and unmuting them only changes what the
// OPERATOR's browser sends/receives: each leg still only exchanges audio
// with the operator, never with the other leg. The customer and the
// colleague are on unrelated PeerConnections and have no path to each
// other's voice — which is exactly the bug that was reported ("only I can
// talk to the person I forwarded to; the customer is left out, even after
// pressing Konferensiya").
//
// This class fixes that by MIXING audio in the browser with the Web Audio
// API and swapping each leg's *outgoing* track (via RTCRtpSender.replaceTrack)
// for a mix of [that leg's own mic capture] + [every OTHER bridged leg's
// incoming audio]. A leg never receives its own voice back (no echo), but
// now genuinely hears everyone else in the bridge — real N-way audio,
// entirely client-side, no PBX-side conference bridge required.
// =============================================================================
import { sipLogger } from './LoggerService';

export class ConferenceMixer {
  private ctx: AudioContext | null = null;

  /** Each leg's current outgoing audio sender (its RTCPeerConnection's mic track slot) */
  private senders = new Map<string, RTCRtpSender>();
  /** Each leg's ORIGINAL (unmixed) outgoing track — what to restore once mixing ends */
  private originalTracks = new Map<string, MediaStreamTrack>();
  /** Source node built from a leg's own original mic track (reused across rebuilds) */
  private micSourceNodes = new Map<string, MediaStreamAudioSourceNode>();
  /** Source node built from a leg's INCOMING remote stream — this is what gets relayed to others */
  private remoteSourceNodes = new Map<string, MediaStreamAudioSourceNode>();
  /** This rebuild's per-leg mix destinations, torn down and rebuilt on every membership change */
  private mixDestinations = new Map<string, MediaStreamAudioDestinationNode>();

  private getCtx(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => undefined);
    return this.ctx;
  }

  /**
   * Call whenever a leg's PeerConnection/remote stream become available (or
   * change — e.g. a re-INVITE). Safe to call repeatedly; the original track
   * and remote source are captured once and reused.
   */
  registerLeg(callId: string, pc: RTCPeerConnection, remoteStream: MediaStream): void {
    const sender = pc.getSenders().find((s) => s.track?.kind === 'audio');
    if (sender) {
      this.senders.set(callId, sender);
      // Only remember the FIRST track we see for this leg — once mixing
      // starts, `sender.track` becomes the mixed track, not the real mic.
      if (!this.originalTracks.has(callId) && sender.track) {
        this.originalTracks.set(callId, sender.track);
      }
    }

    if (!this.remoteSourceNodes.has(callId) && remoteStream.getAudioTracks().length > 0) {
      try {
        this.remoteSourceNodes.set(callId, this.getCtx().createMediaStreamSource(remoteStream));
      } catch (err) {
        sipLogger.warn('CONFERENCE', `Could not create audio source for Call-ID=${callId}`, err);
      }
    }
  }

  /**
   * Recompute the mix for exactly these legs — call after every membership
   * change (merge, one participant dropped, primary ended). Fewer than 2
   * legs simply restores everyone's own plain mic track (no conference).
   */
  rebuild(activeLegIds: string[]): void {
    for (const dest of this.mixDestinations.values()) {
      try {
        dest.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    this.mixDestinations.clear();

    if (activeLegIds.length < 2) {
      activeLegIds.forEach((id) => this.restoreDirect(id));
      return;
    }

    const ctx = this.getCtx();
    for (const legId of activeLegIds) {
      const sender = this.senders.get(legId);
      const originalTrack = this.originalTracks.get(legId);
      if (!sender || !originalTrack) continue;

      let micSrc = this.micSourceNodes.get(legId);
      if (!micSrc) {
        micSrc = ctx.createMediaStreamSource(new MediaStream([originalTrack]));
        this.micSourceNodes.set(legId, micSrc);
      }

      const dest = ctx.createMediaStreamDestination();
      micSrc.connect(dest);
      for (const otherId of activeLegIds) {
        if (otherId === legId) continue; // never echo a leg's own voice back to it
        this.remoteSourceNodes.get(otherId)?.connect(dest);
      }
      this.mixDestinations.set(legId, dest);

      const mixedTrack = dest.stream.getAudioTracks()[0];
      if (mixedTrack) {
        sender.replaceTrack(mixedTrack).catch((err) =>
          sipLogger.error('CONFERENCE', `replaceTrack failed for Call-ID=${legId}`, err),
        );
      }
    }

    sipLogger.info('CONFERENCE', `Audio mix rebuilt for legs: ${activeLegIds.join(', ')}`);
  }

  /** Put one leg back on its own plain mic track — it leaves the mix. */
  restoreDirect(callId: string): void {
    const sender = this.senders.get(callId);
    const original = this.originalTracks.get(callId);
    if (sender && original && sender.track !== original) {
      sender.replaceTrack(original).catch((err) =>
        sipLogger.error('CONFERENCE', `restoreDirect failed for Call-ID=${callId}`, err),
      );
    }
  }

  /** Drop everything tracked for one leg — call once it fully terminates. */
  unregisterLeg(callId: string): void {
    this.remoteSourceNodes.get(callId)?.disconnect();
    this.remoteSourceNodes.delete(callId);
    this.micSourceNodes.get(callId)?.disconnect();
    this.micSourceNodes.delete(callId);
    this.mixDestinations.get(callId)?.disconnect();
    this.mixDestinations.delete(callId);
    this.senders.delete(callId);
    this.originalTracks.delete(callId);
  }

  /** Full teardown — call end / logout. */
  dispose(): void {
    for (const id of [...this.senders.keys()]) this.unregisterLeg(id);
    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close().catch(() => undefined);
    }
    this.ctx = null;
  }
}
