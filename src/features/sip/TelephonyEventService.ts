// =============================================================================
// Telephony Event Service — realtime bus for the IP-telephony page
//
// Why not socket.io
// -----------------
// The SIP stack is already a realtime push channel: FreePBX delivers INVITE,
// BYE, NOTIFY and registration events over the same WSS connection the
// softphone uses. Adding socket.io on top would mean a second always-on socket
// per operator (×100+ operators), a second auth path, and a backend service
// that does not exist yet — all to re-deliver information we hold first-hand
// and more accurately.
//
// So this service turns SIP dialog events into application events and lets the
// page react instantly. It is deliberately transport-agnostic: if a backend
// push channel is added later (socket.io, Reverb, SSE), it only has to call
// the same `emit*` methods and every subscriber keeps working unchanged.
// =============================================================================
import { sipLogger } from './LoggerService';
import type { CallState, CallSummary, OperatorStatus, RegistrationStatus } from './types';

export interface TelephonyEventMap {
  /** Primary call changed state (ringing / active / idle …) */
  callState: { state: CallState; target: string | null };
  /** A call finished — carries everything the history page needs */
  callEnded: CallSummary;
  /** SIP registration changed */
  registration: RegistrationStatus;
  /** An operator's availability changed */
  operatorStatus: { extension: string; status: OperatorStatus };
}

type EventKey = keyof TelephonyEventMap;
type Listener<K extends EventKey> = (payload: TelephonyEventMap[K]) => void;

class TelephonyEventService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private listeners = new Map<EventKey, Set<Listener<any>>>();

  /** Our own extension — lets subscribers tell "my calls" from everyone else's */
  private extension: string | null = null;

  /** Last known status per extension, so late subscribers get a full picture */
  private operatorStatus = new Map<string, OperatorStatus>();

  // ---------------------------------------------------------------------------
  // Subscription
  // ---------------------------------------------------------------------------

  on<K extends EventKey>(event: K, listener: Listener<K>): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
    return () => {
      this.listeners.get(event)?.delete(listener);
    };
  }

  private emit<K extends EventKey>(event: K, payload: TelephonyEventMap[K]): void {
    const set = this.listeners.get(event);
    if (!set?.size) return;
    // Copy before iterating: a handler may unsubscribe itself.
    [...set].forEach((fn) => {
      try {
        fn(payload);
      } catch (err) {
        sipLogger.error('REALTIME', `Listener for "${event}" threw`, err);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Identity
  // ---------------------------------------------------------------------------

  setExtension(ext: string | null): void {
    this.extension = ext;
  }

  getExtension(): string | null {
    return this.extension;
  }

  // ---------------------------------------------------------------------------
  // Emitters — called by SipProvider as SIP events arrive
  // ---------------------------------------------------------------------------

  emitCallState(state: CallState, target: string | null): void {
    sipLogger.debug('REALTIME', `callState → ${state}${target ? ` (${target})` : ''}`);
    this.emit('callState', { state, target });

    // Our own presence is derivable without asking the PBX
    if (this.extension) {
      const status: OperatorStatus =
        state === 'active' || state === 'connecting' ? 'busy'
        : state === 'ringing' ? 'ringing'
        : 'idle';
      this.setOperatorStatus(this.extension, status);
    }
  }

  emitCallEnded(summary: CallSummary): void {
    sipLogger.info(
      'REALTIME',
      `callEnded ${summary.direction} ${summary.remote} — ${summary.reason} (${summary.duration}s)`,
    );
    this.emit('callEnded', summary);
  }

  emitRegistration(status: RegistrationStatus): void {
    this.emit('registration', status);
    if (this.extension) {
      this.setOperatorStatus(this.extension, status === 'registered' ? 'idle' : 'offline');
    }
  }

  setOperatorStatus(extension: string, status: OperatorStatus): void {
    const ext = String(extension);
    if (this.operatorStatus.get(ext) === status) return;
    this.operatorStatus.set(ext, status);
    this.emit('operatorStatus', { extension: ext, status });
  }

  getOperatorStatus(extension: string): OperatorStatus {
    return this.operatorStatus.get(String(extension)) ?? 'unknown';
  }

  getAllOperatorStatus(): ReadonlyMap<string, OperatorStatus> {
    return this.operatorStatus;
  }
}

/** Singleton — one bus per browser tab */
export const telephonyEvents = new TelephonyEventService();
