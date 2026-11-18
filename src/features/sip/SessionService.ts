// =============================================================================
// Session Service — Session state machine for Invitation + Inviter
//
// Owns every dialog this endpoint has: the primary call the operator is on,
// and (during an attended transfer) the consultation leg to another agent.
//
// Design notes
//   * Incoming INVITEs are answered with 180 Ringing immediately. Asterisk's
//     `ringall` queue strategy needs a provisional response from every member
//     to consider the member "ringing"; without it the queue can only fall
//     back to its agent timeout, which looks like sequential ringing.
//   * Hold uses SIP.js's native `{ hold: true }` SDH option, which flips the
//     RTCRtpTransceiver directions. Rewriting the SDP text by regex (the old
//     approach) leaves the local transceivers in `sendrecv` while advertising
//     `sendonly`, so the answer can be rejected by the browser and the call
//     drops mid-hold.
// =============================================================================
import {
  Invitation,
  Inviter,
  Session,
  SessionState,
  UserAgent,
  type Web,
} from 'sip.js';
import { sipLogger } from './LoggerService';
import { QueueService } from './QueueService';
import { ConferenceMixer } from './ConferenceMixer';
import { cleanTarget } from './phoneUtils';
import type { AudioService } from './AudioService';
import type {
  CallDirection,
  CallEndReason,
  CallState,
  CallSummary,
} from './types';

/** Media constraints reused for every offer/answer we generate */
const AUDIO_CONSTRAINTS = {
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  video: false,
} as const;

/**
 * Tashqi raqamga (yoki band/liniyasi yo'q ichki raqamga) "kutib yo'naltirish"
 * (attended transfer) qilinganda ba'zan PBX/trunk hech qanday final javob
 * (yo'q — 480/486/503 — hech biri) qaytarmay, so'rovni "osilib" qoldirishi
 * mumkin edi: `startConsultation` promise'i abadiy hal bo'lmay qolar, natijada
 * operator ekranida yo'naltirish oynasi "Kutib turilmoqda..." holatida
 * to'xtab qolardi. SIP darajasidagi taymerlar (Timer B) bunga kafolat
 * bermaydi — chunki PBX ko'pincha darhol "100 Trying" qaytarib, keyin hech
 * narsa demay qo'yadi. Shu sabab bu yerda ANIQ ilova darajasidagi limit
 * qo'yilgan: shu vaqt ichida javob kelmasa, so'rov bekor qilinadi va aniq
 * "javob bermadi" xatosi bilan rad etiladi — mijoz kutilmoqda holatida
 * abadiy qolib ketmaydi.
 */
const CONSULT_RING_TIMEOUT_MS = 45000;

/** Final response that killed a consultation leg, kept for the error message */
interface ConsultFailure {
  code: number;
  phrase: string;
  reasonHeader: string;
}

/**
 * Turn the SIP failure into something an operator can act on.
 *
 * The PBX distinguishes "nobody picked up" from "the call could not be set up
 * at all" (503 + Q.850 cause 34 is what FreePBX returns when media negotiation
 * with the target fails) — collapsing both into "no answer" hid a real
 * configuration fault for days.
 */
function describeConsultFailure(ext: string, failure: ConsultFailure | null): string {
  if (!failure) return `${ext} javob bermadi`;

  const { code, phrase, reasonHeader } = failure;
  switch (code) {
    case 486:
    case 600:
      return `${ext} band`;
    case 408:
    case 480:
      return `${ext} javob bermadi`;
    case 603:
      return `${ext} rad etdi`;
    case 404:
      return `${ext} topilmadi`;
    case 488:
      return `${ext} bilan media kelishuvi bo‘lmadi (488)`;
    case 503:
      return `${ext} ga ulanib bo‘lmadi — PBX 503${reasonHeader ? ` (${reasonHeader})` : ''}`;
    default:
      return `${ext}: ${code} ${phrase}`.trim();
  }
}

/** Bookkeeping we keep alongside each SIP dialog */
interface SessionMeta {
  callId: string;
  direction: CallDirection;
  remote: string;
  answeredAt: number | null;
  /** Set when we already know why this call is ending (REFER, decline, …) */
  endReason: CallEndReason | null;
  /** Guards against attaching the `track` listener more than once */
  audioAttached: boolean;
}

export interface SessionServiceDelegate {
  onCallStateChange(state: CallState, target: string | null): void;
  onHoldChange(held: boolean): void;
  onMuteChange(muted: boolean): void;
  onSessionStart(): void;
  onSessionEnd(summary: CallSummary): void;
  /** Fired whenever a conference bridge gains or loses a leg */
  onConferenceChange(participants: { callId: string; remote: string }[]): void;
}

export class SessionService {
  /** All active sessions keyed by SIP Call-ID */
  private sessions = new Map<string, Invitation | Inviter>();
  private meta = new Map<string, SessionMeta>();

  /** The Call-ID of the currently visible primary call */
  private primaryCallId: string | null = null;

  /** Consultation leg created during an attended transfer (never "primary") */
  private consultCallId: string | null = null;

  /**
   * Extra legs bridged into the call alongside the primary — a consultation
   * that got merged in instead of handed off. Everyone in this set (plus the
   * primary) is unheld, hears the others, and is heard by them.
   */
  private conferenceCallIds = new Set<string>();

  /** In-flight un-hold, so two failure paths cannot race a re-INVITE */
  private resumeInFlight: Promise<void> | null = null;

  /** Fired when the consultation dialog goes away without us asking */
  private onConsultationLost: (() => void) | null = null;

  private audioService: AudioService;
  private queueService: QueueService;
  /** Client-side mixer — see ConferenceMixer.ts for why a real conference needs it */
  private mixer = new ConferenceMixer();
  private domain: string;
  private ua: UserAgent | null = null;
  private delegate: SessionServiceDelegate | null = null;

  private held = false;
  private muted = false;

  // Elapsed call timer
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private elapsedSecs = 0;
  private onElapsedChange: ((secs: number) => void) | null = null;

  constructor(audioService: AudioService, domain: string, queueService?: QueueService) {
    this.audioService = audioService;
    this.domain = domain;
    this.queueService = queueService ?? new QueueService();
  }

  getQueueService(): QueueService {
    return this.queueService;
  }

  // ---------------------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------------------

  setUserAgent(ua: UserAgent): void {
    this.ua = ua;
  }

  setDelegate(delegate: SessionServiceDelegate): void {
    this.delegate = delegate;
  }

  setOnElapsedChange(cb: (secs: number) => void): void {
    this.onElapsedChange = cb;
  }

  /**
   * Wired by TransferService. Lets it react when the consulted agent hangs up
   * (or the PBX tears the leg down) instead of leaving the customer parked.
   */
  setOnConsultationLost(cb: () => void): void {
    this.onConsultationLost = cb;
  }

  getElapsed(): number {
    return this.elapsedSecs;
  }

  getPrimarySession(): Session | null {
    if (!this.primaryCallId) return null;
    return this.sessions.get(this.primaryCallId) ?? null;
  }

  getPrimaryCallId(): string | null {
    return this.primaryCallId;
  }

  getConsultSession(): Inviter | null {
    if (!this.consultCallId) return null;
    return (this.sessions.get(this.consultCallId) as Inviter | undefined) ?? null;
  }

  /** Extra legs currently bridged into the call, for the UI's participant list */
  getConferenceParticipants(): { callId: string; remote: string }[] {
    return [...this.conferenceCallIds].map((callId) => ({
      callId,
      remote: this.meta.get(callId)?.remote ?? callId,
    }));
  }

  getUserAgent(): UserAgent | null {
    return this.ua;
  }

  isHeld(): boolean {
    return this.held;
  }

  isMuted(): boolean {
    return this.muted;
  }

  // ---------------------------------------------------------------------------
  // Incoming INVITE
  // ---------------------------------------------------------------------------

  handleInvitation(invitation: Invitation): void {
    const callId = invitation.request.callId;
    const caller =
      invitation.remoteIdentity.uri.user ?? invitation.remoteIdentity.uri.toString();

    sipLogger.info('INVITE', `← INVITE  Call-ID=${callId}  from="${caller}"`);

    if (this.sessions.has(callId)) {
      sipLogger.warn('INVITE', `Duplicate INVITE Call-ID=${callId} — ignored`);
      return;
    }

    // Already on a call (or consulting) → tell the queue immediately so it can
    // move to the next agent instead of waiting out the 15 s agent timeout.
    if (this.primaryCallId !== null && this.queueService.shouldRejectWhenBusy()) {
      this.queueService.noteRejectedWhileBusy(callId);
      invitation.reject({ statusCode: 486 }).catch((err) =>
        sipLogger.error('QUEUE', `Failed to send 486 for Call-ID=${callId}`, err),
      );
      return;
    }
    if (this.primaryCallId !== null) {
      sipLogger.warn('QUEUE', `Busy but policy=wait — Call-ID=${callId} left pending`);
      return;
    }

    this.sessions.set(callId, invitation);
    this.meta.set(callId, {
      callId,
      direction: 'inbound',
      remote: caller,
      answeredAt: null,
      endReason: null,
      audioAttached: false,
    });

    this.primaryCallId = callId;

    invitation.stateChange.addListener((state: SessionState) => {
      this.handleStateChange(callId, invitation, state);
    });

    // RFC 3261 §13.3.1 — send 180 Ringing so the caller gets ringback and the
    // queue registers this member as actually ringing.
    invitation
      .progress({ statusCode: 180 })
      .then(() => sipLogger.info('INVITE', `→ 180 Ringing  Call-ID=${callId}`))
      .catch((err) => sipLogger.error('INVITE', '180 Ringing failed', err));

    this.delegate?.onCallStateChange('ringing', caller);
    this.audioService.playRingtone();
  }

  // ---------------------------------------------------------------------------
  // Outbound call
  // ---------------------------------------------------------------------------

  async makeCall(phoneNumber: string): Promise<void> {
    if (!this.ua) throw new Error('[SIP] UserAgent not ready');
    if (this.primaryCallId) throw new Error('[SIP] Already on a call');

    const clean = cleanTarget(phoneNumber);
    const targetURI = UserAgent.makeURI(`sip:${clean}@${this.domain}`);
    if (!targetURI) throw new Error(`[SIP] Invalid target: ${phoneNumber}`);

    sipLogger.info('INVITE', `→ INVITE  target=sip:${clean}@${this.domain}`);

    const inviter = this.createInviter(targetURI);
    const callId = inviter.request.callId;

    this.sessions.set(callId, inviter);
    this.meta.set(callId, {
      callId,
      direction: 'outbound',
      remote: clean,
      answeredAt: null,
      endReason: null,
      audioAttached: false,
    });
    this.primaryCallId = callId;

    inviter.stateChange.addListener((state: SessionState) => {
      this.handleStateChange(callId, inviter, state);
    });

    this.delegate?.onCallStateChange('connecting', clean);

    // `earlyMedia: true` (createInviter) makes sip.js apply the SDP answer
    // from a provisional response (183 Session Progress) as soon as it
    // arrives, so the PBX's ringback tone is already flowing on the
    // RTCPeerConnection well before the callee answers. Without wiring the
    // remote track here, that audio had nowhere to play — attachRemoteAudio
    // was only ever called on `Established`, so the operator heard nothing
    // while "Ulanmoqda…"/connecting was showing. onProgress fires exactly
    // when a provisional response comes in, i.e. as soon as that early
    // media track can exist.
    await inviter.invite({
      requestDelegate: {
        onProgress: () => this.attachRemoteAudio(callId, inviter),
      },
    });
    sipLogger.info('INVITE', `→ INVITE sent  Call-ID=${callId}`);
  }

  // ---------------------------------------------------------------------------
  // Answer
  // ---------------------------------------------------------------------------

  async answer(): Promise<void> {
    const session = this.getPrimarySession();
    if (!(session instanceof Invitation)) {
      throw new Error('[SIP] No pending invitation to answer');
    }

    sipLogger.info('SESSION', `Answering Call-ID=${this.primaryCallId}`);

    await session.accept({
      sessionDescriptionHandlerOptions: { constraints: AUDIO_CONSTRAINTS },
    });
  }

  // ---------------------------------------------------------------------------
  // Hangup / Reject / Cancel
  // ---------------------------------------------------------------------------

  async hangup(): Promise<void> {
    // A consultation leg is always torn down first — otherwise it would be
    // promoted into a stray call once the primary goes away.
    if (this.consultCallId) {
      await this.endConsultation(false);
    }

    const session = this.getPrimarySession();
    if (!session) {
      sipLogger.warn('SESSION', 'hangup() called but no primary session');
      return;
    }
    await this.terminate(this.primaryCallId!, session);
  }

  /** Terminate a specific session using the correct method for its state */
  private async terminate(callId: string, session: Session): Promise<void> {
    const meta = this.meta.get(callId);
    sipLogger.info('SESSION', `Hanging up Call-ID=${callId}  state=${session.state}`);

    try {
      switch (session.state) {
        case SessionState.Initial:
        case SessionState.Establishing:
          if (session instanceof Inviter) {
            if (meta) meta.endReason = 'canceled';
            await session.cancel();
            sipLogger.info('SESSION', `→ CANCEL  Call-ID=${callId}`);
          } else {
            if (meta) meta.endReason = 'rejected';
            await (session as Invitation).reject({ statusCode: 603 });
            sipLogger.info('SESSION', `→ 603 Decline  Call-ID=${callId}`);
          }
          break;

        case SessionState.Established:
          if (meta && !meta.endReason) meta.endReason = 'completed';
          await session.bye();
          sipLogger.info('SESSION', `→ BYE  Call-ID=${callId}`);
          break;

        default:
          sipLogger.warn('SESSION', `Cannot hang up in state ${session.state}`);
      }
    } catch (err) {
      sipLogger.error('SESSION', 'Hangup error', err);
    }
  }

  // ---------------------------------------------------------------------------
  // Mute — toggles the local mic track, no re-INVITE (RFC-neutral, instant)
  // ---------------------------------------------------------------------------

  mute(muted: boolean): void {
    this.muted = muted;
    this.applyMuteToActiveSessions();
    sipLogger.info('SESSION', `Microphone ${muted ? 'muted' : 'unmuted'}`);
    this.delegate?.onMuteChange(muted);
  }

  // ---------------------------------------------------------------------------
  // Hold / Resume — re-INVITE with native SDH hold (RFC 3264)
  //
  // Operates on every leg currently bridged together (the primary, plus any
  // conference participants), not just the primary — outside a conference
  // that set is just `[primary]`, so this is unchanged for the plain
  // one-caller case. It's what lets startConsultation() park an entire
  // ongoing 3-way call before privately dialing a 4th person, and what lets
  // mergeConsultation() bring everyone back at once.
  // ---------------------------------------------------------------------------

  async hold(held: boolean): Promise<void> {
    const legs = this.getBridgedCallIds()
      .map((callId) => ({ callId, session: this.sessions.get(callId) }))
      .filter(
        (leg): leg is { callId: string; session: Invitation | Inviter } =>
          !!leg.session && leg.session.state === SessionState.Established,
      );

    if (legs.length === 0) {
      sipLogger.warn('HOLD', `hold(${held}) skipped — no established session`);
      return;
    }
    if (this.held === held) return;

    sipLogger.info(
      'HOLD',
      `${held ? 'Holding' : 'Resuming'}  ${legs.length} leg(s): ${legs.map((l) => l.callId).join(', ')}`,
    );

    try {
      // `hold` lives on the web SessionDescriptionHandler options, which is a
      // superset of the transport-agnostic type `invite()` is declared with.
      const holdOptions: Web.SessionDescriptionHandlerOptions = {
        // Always pass an explicit boolean: SIP.js caches the last re-INVITE
        // options, so omitting `hold` would silently reuse the previous value.
        hold: held,
        constraints: AUDIO_CONSTRAINTS as MediaStreamConstraints,
      };

      await Promise.all(
        legs.map(({ callId, session }) =>
          session.invite({
            sessionDescriptionHandlerOptions: holdOptions,
            requestDelegate: {
              onAccept: () =>
                sipLogger.info('HOLD', `re-INVITE 200 OK (${held ? 'hold' : 'unhold'})  Call-ID=${callId}`),
              onReject: (response) =>
                sipLogger.error('HOLD', `re-INVITE rejected  Call-ID=${callId}`, response),
            },
          }),
        ),
      );

      this.held = held;
      this.delegate?.onHoldChange(held);
    } catch (err) {
      sipLogger.error('HOLD', 'Hold/unhold re-INVITE failed', err);
      // Re-assert the real state so the UI toggle cannot drift out of sync
      this.delegate?.onHoldChange(this.held);
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Consultation leg (attended transfer step 1)
  // ---------------------------------------------------------------------------

  /**
   * Parks the customer and dials `ext`. Resolves once the target answers, so
   * the operator can announce the call before completing the transfer.
   */
  async startConsultation(ext: string): Promise<Inviter> {
    if (!this.ua) throw new Error('[SIP] UserAgent not ready');
    if (this.consultCallId) throw new Error('[SIP] Consultation already in progress');

    const primary = this.getPrimarySession();
    if (!primary || primary.state !== SessionState.Established) {
      throw new Error('[SIP] No established call to transfer');
    }

    // Park the customer first — they must not hear the consultation.
    await this.hold(true);

    const targetURI = UserAgent.makeURI(`sip:${cleanTarget(ext)}@${this.domain}`);
    if (!targetURI) throw new Error(`[SIP] Invalid extension: ${ext}`);

    const inviter = this.createInviter(targetURI);
    const callId = inviter.request.callId;

    this.sessions.set(callId, inviter);
    this.meta.set(callId, {
      callId,
      direction: 'outbound',
      remote: ext,
      answeredAt: null,
      endReason: null,
      audioAttached: false,
    });
    this.consultCallId = callId;

    sipLogger.info('TRANSFER', `→ Consultation INVITE  sip:${ext}@${this.domain}`);

    return new Promise<Inviter>((resolve, reject) => {
      let settled = false;
      let failure: ConsultFailure | null = null;

      const rejectWithReason = () => {
        if (settled) return;
        settled = true;
        if (timeoutId) clearTimeout(timeoutId);
        reject(new Error(describeConsultFailure(ext, failure)));
      };

      // Hech qanday final SIP javobi kelmasa ham (yuqoridagi izohga qarang)
      // so'rov abadiy osilib qolmasligi kerak.
      const timeoutId = setTimeout(() => {
        if (settled) return;
        sipLogger.warn(
          'TRANSFER',
          `Consultation INVITE to ${ext} timed out after ${CONSULT_RING_TIMEOUT_MS}ms — canceling`,
        );
        void inviter.cancel().catch(() => undefined);
        rejectWithReason();
      }, CONSULT_RING_TIMEOUT_MS);

      inviter.stateChange.addListener((state: SessionState) => {
        // Consultation legs must never drive the primary call UI
        this.handleConsultStateChange(callId, inviter, state);

        if (settled) return;

        if (state === SessionState.Established) {
          settled = true;
          clearTimeout(timeoutId);
          sipLogger.info('TRANSFER', `Consultation answered by ${ext}`);
          resolve(inviter);
        } else if (state === SessionState.Terminated) {
          // SIP.js runs our requestDelegate.onReject immediately *after* this
          // transition, so defer a microtask to pick up the real status code.
          // Without it every failure — 503, 488, 486 — surfaced as the same
          // "no answer" string and told nobody anything.
          queueMicrotask(rejectWithReason);
        }
      });

      inviter
        .invite({
          requestDelegate: {
            onProgress: (response) =>
              sipLogger.info(
                'TRANSFER',
                `← Consultation ${response.message.statusCode} ${response.message.reasonPhrase ?? ''}`,
              ),
            onReject: (response) => {
              failure = {
                code: response.message.statusCode ?? 0,
                phrase: response.message.reasonPhrase ?? '',
                reasonHeader: response.message.getHeader('Reason') ?? '',
              };
              sipLogger.error(
                'TRANSFER',
                `← Consultation INVITE rejected: ${failure.code} ${failure.phrase}` +
                  (failure.reasonHeader ? `  [Reason: ${failure.reasonHeader}]` : ''),
              );
            },
          },
        })
        .catch((err) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          reject(err);
        });
    });
  }

  /**
   * Tear down the consultation leg.
   *
   * Must NOT bail out early when `consultCallId` is already null: a consult leg
   * the PBX rejected clears that field from `handleConsultStateChange` before
   * the caller gets here, and the old early return meant the parked customer
   * was never taken off hold — the operator was left on a dead-silent call.
   *
   * @param resumePrimary when true the parked customer is taken off hold —
   *        skipped after a successful REFER, where the leg is going away anyway.
   */
  async endConsultation(resumePrimary: boolean): Promise<void> {
    const callId = this.consultCallId;
    this.consultCallId = null;

    if (callId) {
      const session = this.sessions.get(callId);
      if (session) {
        const meta = this.meta.get(callId);
        if (meta) meta.endReason = 'completed';
        await this.terminate(callId, session);
      }
    }

    // Microphone belongs to the primary (or the existing conference) again
    this.applyMuteToActiveSessions();

    if (resumePrimary) await this.resumePrimary();
  }

  /**
   * Take the parked customer off hold.
   *
   * De-duplicated on purpose: a failed consultation arrives here from two
   * directions at once — the terminated consult leg and the rejected
   * `startConsultation` promise. Two concurrent re-INVITEs on one dialog is
   * glare, and Asterisk answers the loser with 491 Request Pending.
   */
  private resumePrimary(): Promise<void> {
    if (this.resumeInFlight) return this.resumeInFlight;

    const primary = this.getPrimarySession();
    if (!primary || primary.state !== SessionState.Established) return Promise.resolve();

    if (this.primaryCallId) this.reattachRemoteAudio(this.primaryCallId, primary);

    this.resumeInFlight = this.hold(false)
      .catch((err) => sipLogger.error('TRANSFER', 'Failed to resume parked call', err))
      .finally(() => {
        this.resumeInFlight = null;
      });

    return this.resumeInFlight;
  }

  /** Called by TransferService once a REFER has been accepted */
  markTransferred(callId: string | null): void {
    if (!callId) return;
    const meta = this.meta.get(callId);
    if (meta) meta.endReason = 'transferred';
  }

  // ---------------------------------------------------------------------------
  // Conference — bridge the consultation in instead of handing it off
  // ---------------------------------------------------------------------------

  /**
   * Promote the current private consultation into a 3-way (or wider) call:
   * the customer comes off hold and both legs are unheld/unmuted together,
   * so operator, customer and the consulted colleague all hear each other.
   *
   * Unlike completeTransfer() this does not REFER anyone away — the
   * operator's own two dialogs stay up and simply both go "live" at once.
   */
  async mergeConsultation(): Promise<void> {
    const consultId = this.consultCallId;
    if (!consultId) throw new Error('[SIP] No consultation to merge');

    const consult = this.sessions.get(consultId);
    if (!consult || consult.state !== SessionState.Established) {
      throw new Error('[SIP] Consultation not established');
    }
    if (!this.primaryCallId) throw new Error('[SIP] No primary call to merge into');

    sipLogger.info('CONFERENCE', `Merging Call-ID=${consultId} into the call`);

    // No longer a private, held-apart consultation — it's a bridged leg now.
    this.consultCallId = null;
    this.conferenceCallIds.add(consultId);

    try {
      // Brings every currently-bridged leg (primary + this one) off hold together.
      await this.hold(false);
    } catch (err) {
      // Roll back — better a still-private consult than a half-merged call
      // where the customer can't hear anyone.
      this.conferenceCallIds.delete(consultId);
      this.consultCallId = consultId;
      throw err;
    }

    this.reattachRemoteAudio(consultId, consult);
    const primary = this.getPrimarySession();
    if (primary && this.primaryCallId) this.reattachRemoteAudio(this.primaryCallId, primary);
    this.applyMuteToActiveSessions();

    // Taking both legs off hold only changes what the OPERATOR's browser
    // sends/hears — the customer and the colleague are still on two separate
    // PeerConnections with no path to each other. Without this, "3-way"
    // really meant "two separate 1-on-1 calls the operator can hear at
    // once" — the exact bug reported (only the operator could talk to
    // whoever they were bridging in). rebuild() cross-mixes so every leg
    // now genuinely hears every other leg.
    if (this.primaryCallId) {
      this.mixer.rebuild([this.primaryCallId, ...this.conferenceCallIds]);
    }

    this.notifyConferenceChange();
    sipLogger.info(
      'CONFERENCE',
      `${this.conferenceCallIds.size + 1} legs bridged (primary + ${this.conferenceCallIds.size})`,
    );
  }

  /** Drop one bridged participant — everyone else stays connected. */
  async removeConferenceParticipant(callId: string): Promise<void> {
    if (!this.conferenceCallIds.has(callId)) return;

    const session = this.sessions.get(callId);
    this.conferenceCallIds.delete(callId);
    this.audioService.clearRemoteStream(callId);
    this.mixer.unregisterLeg(callId);
    if (this.primaryCallId) {
      this.mixer.rebuild([this.primaryCallId, ...this.conferenceCallIds]);
    }
    this.notifyConferenceChange();

    if (session) {
      const meta = this.meta.get(callId);
      if (meta) meta.endReason = 'completed';
      await this.terminate(callId, session);
    }
  }

  // ---------------------------------------------------------------------------
  // DTMF — RFC 2833 via RTCDTMFSender, SIP INFO fallback
  // ---------------------------------------------------------------------------

  sendDtmf(tone: string): void {
    // During a conference, tones go to the primary leg only — blasting DTMF
    // (e.g. an IVR menu entry) to every bridged participant would be heard
    // as noise by the others.
    const session = this.getActiveMediaSessions()[0] ?? null;
    if (!session || session.state !== SessionState.Established) return;

    const pc = this.getPeerConnection(session);
    const audioSender = pc?.getSenders().find((s) => s.track?.kind === 'audio');

    if (audioSender?.dtmf) {
      audioSender.dtmf.insertDTMF(tone, 100, 50);
      sipLogger.info('DTMF', `RFC-2833 tone="${tone}" sent`);
      return;
    }

    sipLogger.warn('DTMF', `RTCDTMFSender unavailable — SIP INFO fallback tone="${tone}"`);
    session
      .info({
        requestOptions: {
          body: {
            contentDisposition: 'render',
            contentType: 'application/dtmf-relay',
            content: `Signal=${tone}\r\nDuration=100`,
          },
        },
      })
      .catch((err) => sipLogger.error('DTMF', 'SIP INFO failed', err));
  }

  // ---------------------------------------------------------------------------
  // Session state machine — primary leg
  // ---------------------------------------------------------------------------

  private handleStateChange(
    callId: string,
    session: Invitation | Inviter,
    state: SessionState,
  ): void {
    const isPrimary = callId === this.primaryCallId;
    const meta = this.meta.get(callId);
    const remoteUser = meta?.remote
      ?? session.remoteIdentity.uri.user
      ?? session.remoteIdentity.uri.toString();

    sipLogger.info('SESSION', `Call-ID=${callId}  state → ${state}${isPrimary ? '  (primary)' : ''}`);

    switch (state) {
      case SessionState.Establishing:
        if (isPrimary && session instanceof Inviter) {
          this.delegate?.onCallStateChange('connecting', remoteUser);
          // Belt-and-braces alongside the onProgress hook in makeCall(): if
          // the peer connection already has an early-media track by the time
          // this fires, catch it here too (attachRemoteAudio is idempotent).
          this.attachRemoteAudio(callId, session);
          // Most PBX setups send plain 180 Ringing with no SDP at all — no
          // network audio ever arrives, so wiring the remote track earlier
          // (above) has nothing to play. The caller's own phone/softphone is
          // expected to generate its own ringback locally in that case, same
          // as every desk phone and MicroSIP does. attachRemoteAudio() stops
          // this again the moment a *real* early-media track shows up, so
          // the two never play at once.
          this.audioService.playRingtone();
        }
        break;

      case SessionState.Established:
        this.audioService.stopRingtone();
        this.attachRemoteAudio(callId, session);
        if (meta) meta.answeredAt = Date.now();

        if (isPrimary) {
          this.held = false;
          this.delegate?.onHoldChange(false);
          this.applyMuteToActiveSessions();
          this.delegate?.onCallStateChange('active', remoteUser);
          this.delegate?.onSessionStart();
          this.startTimer();
        }
        break;

      case SessionState.Terminating:
        break;

      case SessionState.Terminated: {
        this.sessions.delete(callId);
        this.audioService.stopRingtone();

        const summary = this.buildSummary(callId, session);
        this.meta.delete(callId);

        if (isPrimary) {
          this.primaryCallId = null;
          this.held = false;
          this.muted = false;
          this.audioService.clearRemoteStream(callId);
          this.mixer.unregisterLeg(callId);
          this.stopTimer();
          this.delegate?.onHoldChange(false);
          this.delegate?.onMuteChange(false);
          if (summary) this.delegate?.onSessionEnd(summary);
          this.delegate?.onCallStateChange('idle', null);

          // The customer just left — a conference is meaningless without
          // them, so drop whoever else was still bridged in rather than
          // stranding the operator on a call the UI no longer represents.
          if (this.conferenceCallIds.size > 0) {
            const stragglers = [...this.conferenceCallIds];
            this.conferenceCallIds.clear();
            for (const strayId of stragglers) {
              const straySession = this.sessions.get(strayId);
              this.audioService.clearRemoteStream(strayId);
              this.mixer.unregisterLeg(strayId);
              if (straySession) {
                const strayMeta = this.meta.get(strayId);
                if (strayMeta) strayMeta.endReason = 'completed';
                void this.terminate(strayId, straySession);
              }
            }
            this.notifyConferenceChange();
          }
        }
        break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Session state machine — consultation leg (must not touch primary UI state)
  // ---------------------------------------------------------------------------

  private handleConsultStateChange(
    callId: string,
    session: Inviter,
    state: SessionState,
  ): void {
    sipLogger.info('TRANSFER', `Consultation Call-ID=${callId}  state → ${state}`);

    if (state === SessionState.Established) {
      // Route the operator's audio to the consulted agent
      this.attachRemoteAudio(callId, session);
      this.applyMuteToActiveSessions();
      const meta = this.meta.get(callId);
      if (meta) meta.answeredAt = Date.now();
      return;
    }

    if (state === SessionState.Terminated) {
      this.sessions.delete(callId);
      this.audioService.clearRemoteStream(callId);
      this.meta.delete(callId);

      if (this.consultCallId === callId) {
        // Still a private, not-yet-merged consultation — the target hung up
        // or the PBX rejected the leg. The parked customer must come back.
        this.consultCallId = null;
        this.onConsultationLost?.();
        return;
      }

      if (this.conferenceCallIds.has(callId)) {
        sipLogger.info('CONFERENCE', `Participant left  Call-ID=${callId}`);
        this.conferenceCallIds.delete(callId);
        this.mixer.unregisterLeg(callId);
        // Everyone remaining (primary included) must be re-mixed without the
        // leg that just left — otherwise its now-dead source node keeps
        // being "connected" into a mix nobody is replacing it in.
        if (this.primaryCallId) {
          this.mixer.rebuild([this.primaryCallId, ...this.conferenceCallIds]);
        }
        this.notifyConferenceChange();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private createInviter(targetURI: ReturnType<typeof UserAgent.makeURI>): Inviter {
    return new Inviter(this.ua!, targetURI!, {
      sessionDescriptionHandlerOptions: { constraints: AUDIO_CONSTRAINTS },
      // Play Asterisk's queue announcements / early media (183) like MicroSIP
      earlyMedia: true,
    });
  }

  /** Every Call-ID currently bridged together: the primary plus any merged conference legs */
  private getBridgedCallIds(): string[] {
    const ids: string[] = [];
    if (this.primaryCallId) ids.push(this.primaryCallId);
    ids.push(...this.conferenceCallIds);
    return ids;
  }

  /**
   * The leg(s) that currently own the microphone and speaker.
   *
   * Outside a conference this is a single leg — the private consultation if
   * one is in progress (it "steals" the mic from the parked primary),
   * otherwise the primary itself. Inside a conference it's every bridged
   * leg at once, since the operator's mic and ears are shared with all of
   * them simultaneously.
   */
  private getActiveMediaSessions(): Session[] {
    if (this.conferenceCallIds.size > 0) {
      return this.getBridgedCallIds()
        .map((id) => this.sessions.get(id))
        .filter((s): s is Invitation | Inviter => !!s);
    }
    const single = this.consultCallId
      ? ((this.sessions.get(this.consultCallId) as Session | undefined) ?? null)
      : this.getPrimarySession();
    return single ? [single] : [];
  }

  private applyMuteToActiveSessions(): void {
    for (const session of this.getActiveMediaSessions()) {
      const pc = this.getPeerConnection(session);
      pc?.getSenders().forEach((sender) => {
        if (sender.track?.kind === 'audio') sender.track.enabled = !this.muted;
      });
    }
  }

  /** Tell the delegate the bridged participant list changed (merge/leave/remove) */
  private notifyConferenceChange(): void {
    this.delegate?.onConferenceChange(this.getConferenceParticipants());
  }

  private buildSummary(callId: string, session: Session): CallSummary | null {
    const meta = this.meta.get(callId);
    if (!meta) return null;

    const endedAt = Date.now();
    const duration = meta.answeredAt
      ? Math.max(0, Math.round((endedAt - meta.answeredAt) / 1000))
      : 0;

    let reason: CallEndReason = meta.endReason ?? 'completed';
    if (!meta.endReason) {
      if (!meta.answeredAt) {
        reason = meta.direction === 'inbound' ? 'missed' : 'failed';
      }
    }

    return {
      callId,
      direction: meta.direction,
      remote: meta.remote || session.remoteIdentity.uri.user || '',
      answeredAt: meta.answeredAt,
      endedAt,
      duration,
      reason,
    };
  }

  private attachRemoteAudio(callId: string, session: Session): void {
    const meta = this.meta.get(callId);
    const pc = this.getPeerConnection(session);
    if (!pc) {
      sipLogger.warn('AUDIO', 'PeerConnection not available for audio attachment');
      return;
    }

    this.pushReceiverTracks(callId, pc);

    // Wire `track` exactly once per dialog — repeated calls (re-INVITE, hold,
    // unhold) would otherwise stack listeners and leak on long calls.
    if (meta && !meta.audioAttached) {
      meta.audioAttached = true;
      pc.addEventListener('track', (ev: RTCTrackEvent) => {
        if (ev.streams[0]) this.audioService.setRemoteStream(callId, ev.streams[0]);
      });
    }
  }

  /** Re-point this dialog's audio element at its current tracks (e.g. after an unhold) */
  private reattachRemoteAudio(callId: string, session: Session): void {
    const pc = this.getPeerConnection(session);
    if (pc) this.pushReceiverTracks(callId, pc);
  }

  private pushReceiverTracks(callId: string, pc: RTCPeerConnection): void {
    const tracks = pc
      .getReceivers()
      .map((r) => r.track)
      .filter((t): t is MediaStreamTrack => !!t);

    if (tracks.length > 0) {
      const remoteStream = new MediaStream(tracks);
      this.audioService.setRemoteStream(callId, remoteStream);
      // Keep the mixer's picture of this leg's PC/track up to date — needed
      // before it can be bridged into (or relayed out of) a conference mix.
      this.mixer.registerLeg(callId, pc, remoteStream);
    }
  }

  private getPeerConnection(session: Session): RTCPeerConnection | null {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (session.sessionDescriptionHandler as any)?.peerConnection ?? null;
  }

  // ---------------------------------------------------------------------------
  // Timer
  // ---------------------------------------------------------------------------

  private startTimer(): void {
    this.stopTimer();
    this.elapsedSecs = 0;
    this.timerInterval = setInterval(() => {
      this.elapsedSecs += 1;
      this.onElapsedChange?.(this.elapsedSecs);
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timerInterval !== null) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.elapsedSecs = 0;
    this.onElapsedChange?.(0);
  }

  // ---------------------------------------------------------------------------
  // Dispose
  // ---------------------------------------------------------------------------

  /**
   * Awaited teardown — every established dialog gets a real BYE. The previous
   * fire-and-forget version left channels hanging on Asterisk after logout.
   */
  async dispose(): Promise<void> {
    this.stopTimer();

    const pending = [...this.sessions.entries()].map(async ([callId, session]) => {
      try {
        if (session.state === SessionState.Established) await session.bye();
        else if (session.state === SessionState.Initial || session.state === SessionState.Establishing) {
          if (session instanceof Inviter) await session.cancel();
          else await session.reject({ statusCode: 603 });
        }
      } catch {
        /* best effort during teardown */
      }
      sipLogger.debug('SESSION', `Disposed Call-ID=${callId}`);
    });

    await Promise.allSettled(pending);

    this.sessions.clear();
    this.meta.clear();
    this.primaryCallId = null;
    this.consultCallId = null;
    this.conferenceCallIds.clear();
    this.held = false;
    this.muted = false;
    this.audioService.clearAllRemoteStreams();
    this.mixer.dispose();
    sipLogger.info('SESSION', 'SessionService disposed');
  }
}
