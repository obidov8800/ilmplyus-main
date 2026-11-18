// =============================================================================
// SIP Feature — Shared Types
// =============================================================================

/** Credentials fetched from /ip-telefon-operators matched by user.pinfl */
export interface SipCredentials {
  /** SIP extension number e.g. "1001" */
  login: string;
  /** SIP auth password */
  password: string;
  /** Full AOR e.g. "sip:1001@mainoffice.uz" */
  aor: string;
  /** SIP domain e.g. "mainoffice.uz" */
  domain: string;
  /** WebSocket server e.g. "wss://mainoffice.uz:8089/ws" */
  wsServer: string;
}

/** Lifecycle state of a single SIP call */
export type CallState =
  | 'idle'
  | 'connecting'
  | 'ringing'
  | 'active'
  | 'ended'
  | 'error';

/** SIP registration lifecycle */
export type RegistrationStatus =
  | 'unregistered'
  | 'registering'
  | 'registered'
  | 'failed';

/** Transfer mode */
export type TransferType = 'blind' | 'attended';

/**
 * Transfer lifecycle.
 *
 * blind:    idle → transferring → completed | failed
 * attended: idle → consulting   → completing → completed | failed
 *
 * `consulting` is the state MicroSIP/Zoiper show while the operator is
 * talking to the transfer target with the customer parked on hold.
 */
export type TransferPhase =
  | 'idle'
  | 'transferring'
  | 'consulting'
  | 'completing'
  | 'completed'
  | 'failed';

export interface TransferState {
  phase: TransferPhase;
  /** Extension we are transferring to, e.g. "1008" */
  target: string | null;
  type: TransferType | null;
  /** Human-readable failure reason (shown in UI) */
  error: string | null;
}

export const INITIAL_TRANSFER_STATE: TransferState = {
  phase: 'idle',
  target: null,
  type: null,
  error: null,
};

/**
 * One extra leg bridged into the call alongside the primary — the operator
 * consulted them privately first (attended-transfer style), then merged
 * them in instead of handing the call off. Everyone hears everyone.
 */
export interface ConferenceParticipant {
  callId: string;
  /** Extension or phone number of this leg */
  remote: string;
}

/**
 * Why a call ended. Derived from SIP signalling so the history page can
 * distinguish missed / rejected / busy without asking the backend.
 */
export type CallEndReason =
  | 'completed'      // normal BYE after conversation
  | 'canceled'       // we canceled an outbound call before answer
  | 'rejected'       // we or the far end declined (603 / 486)
  | 'missed'         // incoming call that was never answered
  | 'busy'           // 486 Busy Here
  | 'transferred'    // leg ended because REFER succeeded
  | 'failed';        // network / protocol error

/** Direction of a call, from this extension's point of view */
export type CallDirection = 'inbound' | 'outbound';

/** Snapshot of a finished call — feeds the realtime history cache */
export interface CallSummary {
  callId: string;
  direction: CallDirection;
  /** Remote party (phone number or extension) */
  remote: string;
  /** Unix ms when the call was answered, null if never answered */
  answeredAt: number | null;
  /** Unix ms when the call ended */
  endedAt: number;
  /** Talk time in seconds (0 if never answered) */
  duration: number;
  reason: CallEndReason;
}

/** Shape of each session held in SessionService */
export interface SessionRecord {
  callId: string;
  state: CallState;
  remoteIdentity: string;
  isIncoming: boolean;
  startedAt: number | null;
}

/** Presence of another operator, used by the transfer drawer */
export type OperatorStatus = 'idle' | 'busy' | 'ringing' | 'offline' | 'unknown';

/** Full value exposed by SipContext to consumers */
export interface SipContextValue {
  // ── Registration ───────────────────────────────────────────────────────────
  registrationStatus: RegistrationStatus;
  registered: boolean;
  /** Populated when REGISTER is rejected (401/403/404) so the UI can explain */
  registrationError: string | null;

  // ── Call State (primary session) ───────────────────────────────────────────
  callState: CallState;
  callTarget: string | null;
  elapsed: number;
  /** True while the primary call is on hold (kept in sync with real SDP state) */
  held: boolean;
  /** True while the local microphone track is disabled */
  muted: boolean;

  // ── Transfer ───────────────────────────────────────────────────────────────
  transfer: TransferState;

  // ── Conference ─────────────────────────────────────────────────────────────
  /** Extra legs bridged in alongside the primary call, if any */
  conferenceParticipants: ConferenceParticipant[];

  // ── Actions ────────────────────────────────────────────────────────────────
  makeCall: (phoneNumber: string) => Promise<void>;
  hangup: () => Promise<void>;
  answer: () => Promise<void>;
  mute: (muted: boolean) => void;
  hold: (held: boolean) => Promise<void>;
  sendDtmf: (tone: string) => void;
  /** Blind transfer — REFER without Replaces (RFC 3515) */
  blindTransfer: (ext: string) => Promise<void>;
  /**
   * Attended transfer STEP 1 — parks the customer and dials `ext` so the
   * operator can announce the call. Does NOT complete the transfer.
   */
  attendedTransfer: (ext: string) => Promise<void>;
  /** Attended transfer STEP 2 — REFER with Replaces (RFC 3891) */
  completeTransfer: () => Promise<void>;
  /** Abort a consultation and return to the parked customer */
  cancelTransfer: () => Promise<void>;
  /** Bridge the current consultation in instead of handing the call off — everyone stays on the line */
  mergeConsultation: () => Promise<void>;
  /** Drop one bridged conference participant, leaving everyone else connected */
  removeConferenceParticipant: (callId: string) => Promise<void>;

  // ── Status ─────────────────────────────────────────────────────────────────
  credentialsReady: boolean;
  /** Extension this browser is registered as, e.g. "1001" */
  extension: string | null;
}

/** Events emitted by RegistrationService */
export interface RegistrationServiceEvents {
  registered: void;
  unregistered: void;
  transportConnected: void;
  transportDisconnected: Error | undefined;
  failed: Error;
}
