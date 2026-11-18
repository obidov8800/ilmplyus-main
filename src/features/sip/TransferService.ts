// =============================================================================
// Transfer Service — RFC 3515 (REFER) + RFC 3891 (Replaces)
//
// Why the previous implementation felt broken
// -------------------------------------------
//  1. It fired REFER and reported success on the `202 Accepted`. But 202 only
//     means "I got your REFER" — the real outcome arrives later as a chain of
//     in-dialog NOTIFY requests carrying a `message/sipfrag` body. Without
//     reading those the UI could not tell a completed transfer from one the
//     target rejected, and the operator saw the modal vanish with no
//     explanation the moment Asterisk BYE'd our leg.
//
//  2. `Session.refer({ onNotify })` disables SIP.js's automatic 200 OK for
//     those NOTIFYs (see Session.onNotifyRequest). Whoever supplies onNotify
//     MUST accept the request, otherwise Asterisk retransmits and eventually
//     tears the dialog down.
//
//  3. Attended transfer sent the REFER the instant the target picked up, so
//     the operator never got to announce the call — the defining feature of an
//     attended transfer. It is now a two-step flow: consult, then complete.
// =============================================================================
import { Session, SessionState, UserAgent } from 'sip.js';
import type { Notification } from 'sip.js';
import { sipLogger } from './LoggerService';
import { cleanTarget } from './phoneUtils';
import type { SessionService } from './SessionService';
import type { TransferState, TransferType } from './types';
import { INITIAL_TRANSFER_STATE } from './types';

type TransferListener = (state: TransferState) => void;

/** Parsed `message/sipfrag` status line from a REFER NOTIFY */
interface SipFragStatus {
  code: number;
  reason: string;
}

/**
 * `transferring`/`completing` odatda tezda (202 Accepted + keyingi NOTIFY
 * bilan) hal bo'ladi. Ba'zan (masalan tashqi trunk NOTIFY'larni to'g'ri
 * uzatmasa) hech qanday yangilanish kelmasdan qolib ketishi mumkin — bu
 * "modal osilib qoladi" ko'rinishida bo'ladi. Har bir yangi 1xx NOTIFY bu
 * taymerni qayta ishga tushiradi (haqiqatan ham jiringlab turgan qo'ng'iroq
 * muddatidan oldin uzilib qolmasligi uchun) — faqat UZOQ vaqt hech qanday
 * yangilanish bo'lmasa, bekor qilib xato ko'rsatiladi.
 */
const TRANSFER_WATCHDOG_MS = 45000;

export class TransferService {
  private sessionService: SessionService;
  private domain: string;

  private state: TransferState = { ...INITIAL_TRANSFER_STATE };
  private listeners = new Set<TransferListener>();
  private watchdogTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(sessionService: SessionService, domain: string) {
    this.sessionService = sessionService;
    this.domain = domain;
    this.sessionService.setOnConsultationLost(() => this.handleConsultationLost());
  }

  /**
   * The consultation dialog vanished without us asking for it. While we are
   * still `consulting` that means the target hung up, or the PBX rejected the
   * leg (FreePBX answers a congested extension with 503 / Q.850 cause 34) —
   * either way the customer is still parked and must be brought back.
   *
   * `completing` and later are expected terminations: the REFER is handing the
   * leg over on purpose, so resuming there would un-hold a dying dialog.
   */
  private handleConsultationLost(): void {
    if (this.state.phase !== 'consulting') return;

    sipLogger.warn(
      'TRANSFER',
      `Consultation with ${this.state.target} ended before completion — resuming customer`,
    );
    void this.sessionService.endConsultation(true).catch(() => undefined);
    // `attendedTransfer`'s own catch overwrites this with the precise SIP
    // reason when the consultation never got answered in the first place.
    this.fail(`${this.state.target ?? ''} bilan aloqa uzildi`);
  }

  // ---------------------------------------------------------------------------
  // State plumbing
  // ---------------------------------------------------------------------------

  onStateChange(listener: TransferListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): TransferState {
    return this.state;
  }

  private setState(patch: Partial<TransferState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn(this.state));
    this.armWatchdog();
  }

  /**
   * (Qayta) ishga tushiradi yoki to'xtatadi — faqat `transferring`/`completing`
   * fazalarida ishlaydi (yuqoridagi izohga qarang). Fazadan chiqilganda
   * (completed/failed/consulting/idle) taymer avtomatik bekor bo'ladi.
   */
  private armWatchdog(): void {
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    if (this.state.phase !== 'transferring' && this.state.phase !== 'completing') return;

    const phaseAtArm = this.state.phase;
    const targetAtArm = this.state.target;
    this.watchdogTimer = setTimeout(() => {
      this.watchdogTimer = null;
      if (this.state.phase !== phaseAtArm || this.state.target !== targetAtArm) return;
      sipLogger.warn(
        'TRANSFER',
        `${phaseAtArm} ${targetAtArm} uchun ${TRANSFER_WATCHDOG_MS}ms davomida javobsiz qoldi — bekor qilinmoqda`,
      );
      this.fail(`${targetAtArm ?? ''} javob bermadi`);
    }, TRANSFER_WATCHDOG_MS);
  }

  reset(): void {
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    this.setState({ ...INITIAL_TRANSFER_STATE });
  }

  // ---------------------------------------------------------------------------
  // Blind Transfer — REFER without Replaces
  // ---------------------------------------------------------------------------

  async blindTransfer(ext: string): Promise<void> {
    const session = this.assertEstablished();
    const targetURI = this.makeTargetURI(ext);

    this.setState({ phase: 'transferring', target: ext, type: 'blind', error: null });
    sipLogger.info('REFER', `→ REFER (blind)  Refer-To=sip:${ext}@${this.domain}`);

    try {
      await session.refer(targetURI, {
        onNotify: (notification) => this.handleReferNotify(notification, 'blind', ext),
        requestDelegate: {
          onAccept: () => sipLogger.info('REFER', '← 202 Accepted (blind REFER)'),
          onReject: (response) => {
            const code = response.message.statusCode ?? 0;
            sipLogger.error('REFER', `← REFER rejected (${code})`);
            this.fail(`Yo'naltirish rad etildi (${code})`);
          },
        },
      });
    } catch (err) {
      sipLogger.error('REFER', 'Blind REFER failed', err);
      this.fail(err instanceof Error ? err.message : 'Yo‘naltirib bo‘lmadi');
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Attended Transfer — STEP 1: consult
  // ---------------------------------------------------------------------------

  /**
   * Parks the customer and calls `ext`. When this resolves the operator is
   * talking to the target and can either complete or cancel the transfer.
   */
  async attendedTransfer(ext: string): Promise<void> {
    this.assertEstablished();

    this.setState({ phase: 'consulting', target: ext, type: 'attended', error: null });
    sipLogger.info('TRANSFER', `Attended transfer step 1 — consulting ${ext}`);

    try {
      await this.sessionService.startConsultation(ext);
      // Still consulting — the operator now decides. State stays 'consulting'.
      sipLogger.info('TRANSFER', `Consultation with ${ext} established — awaiting operator`);
    } catch (err) {
      sipLogger.error('TRANSFER', 'Consultation failed', err);
      // Bring the customer back; they must never be stranded on hold.
      await this.sessionService.endConsultation(true).catch(() => undefined);
      this.fail(err instanceof Error ? err.message : `${ext} bilan bog'lanib bo'lmadi`);
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Attended Transfer — STEP 2: complete (REFER with Replaces)
  // ---------------------------------------------------------------------------

  async completeTransfer(): Promise<void> {
    if (this.state.phase !== 'consulting') {
      throw new Error('[Transfer] No consultation in progress');
    }

    const primary = this.sessionService.getPrimarySession();
    const consult = this.sessionService.getConsultSession();
    const ext = this.state.target ?? '';

    if (!primary || primary.state !== SessionState.Established) {
      this.fail('Asosiy qo‘ng‘iroq tugagan');
      throw new Error('[Transfer] Primary session gone');
    }
    if (!consult || consult.state !== SessionState.Established) {
      this.fail('Konsultatsiya qo‘ng‘irog‘i tugagan');
      throw new Error('[Transfer] Consultation session gone');
    }

    this.setState({ phase: 'completing' });
    sipLogger.info('REFER', `→ REFER w/Replaces  target=${ext}`);

    try {
      // Passing a Session makes SIP.js build
      //   Refer-To: <sip:ext@domain?Replaces=callid;to-tag=..;from-tag=..>
      // which is what Asterisk needs to splice the customer onto the
      // consultation dialog instead of ringing the target a second time.
      await primary.refer(consult as unknown as Session, {
        onNotify: (notification) => this.handleReferNotify(notification, 'attended', ext),
        requestDelegate: {
          onAccept: () => sipLogger.info('REFER', '← 202 Accepted (attended REFER)'),
          onReject: (response) => {
            const code = response.message.statusCode ?? 0;
            sipLogger.error('REFER', `← Attended REFER rejected (${code})`);
            this.recoverFromFailedComplete(`Yo'naltirish rad etildi (${code})`);
          },
        },
      });

      // Our two legs are now redundant; Asterisk will BYE them.
      this.sessionService.markTransferred(this.sessionService.getPrimaryCallId());
    } catch (err) {
      sipLogger.error('REFER', 'Attended REFER failed', err);
      await this.recoverFromFailedComplete(
        err instanceof Error ? err.message : 'Yo‘naltirib bo‘lmadi',
      );
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Attended Transfer — cancel consultation, go back to the customer
  // ---------------------------------------------------------------------------

  async cancelTransfer(): Promise<void> {
    if (this.state.phase !== 'consulting' && this.state.phase !== 'completing') {
      this.reset();
      return;
    }

    sipLogger.info('TRANSFER', 'Operator cancelled consultation — resuming customer');
    await this.sessionService.endConsultation(true).catch((err) =>
      sipLogger.error('TRANSFER', 'Failed to end consultation cleanly', err),
    );
    this.reset();
  }

  // ---------------------------------------------------------------------------
  // Attended Transfer — bridge in instead of handing off (conference)
  // ---------------------------------------------------------------------------

  /**
   * Merge the consulted colleague into the call instead of transferring it
   * away — customer, operator and colleague all stay connected together.
   * A "transfer" is no longer in flight once this succeeds, so the drawer
   * goes back to idle; SipProvider's conference participant list (driven by
   * SessionService) is what the UI shows from here on.
   */
  async mergeConsultation(): Promise<void> {
    if (this.state.phase !== 'consulting') {
      throw new Error('[Transfer] No consultation in progress');
    }

    try {
      await this.sessionService.mergeConsultation();
      this.reset();
    } catch (err) {
      sipLogger.error('TRANSFER', 'Merge into conference failed', err);
      this.fail(err instanceof Error ? err.message : 'Konferensiyaga qo‘shib bo‘lmadi');
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Primary leg ended
  // ---------------------------------------------------------------------------

  /**
   * Called when the primary dialog terminates.
   *
   * Asterisk is free to send BYE before the final REFER NOTIFY, and SIP.js
   * drops in-dialog NOTIFYs once a session leaves the Established state. Left
   * unhandled the UI would sit in `transferring`/`completing` forever and the
   * call modal would never close. A BYE while a REFER is outstanding only
   * happens once the PBX has taken the caller off our hands, so treat it as
   * the success signal the NOTIFY would otherwise have carried.
   */
  notePrimaryEnded(): void {
    switch (this.state.phase) {
      case 'transferring':
      case 'completing':
        sipLogger.info(
          'TRANSFER',
          `Primary leg BYE'd while REFER in flight — treating transfer to ${this.state.target} as complete`,
        );
        this.setState({ phase: 'completed', error: null });
        break;

      case 'consulting':
        // The customer hung up while we were announcing the call.
        sipLogger.warn('TRANSFER', 'Caller left during consultation — dropping consult leg');
        void this.sessionService.endConsultation(false).catch(() => undefined);
        this.fail('Mijoz qo‘ng‘iroqni tugatdi');
        break;

      default:
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // REFER NOTIFY handling — the authoritative transfer result
  // ---------------------------------------------------------------------------

  private handleReferNotify(
    notification: Notification,
    type: TransferType,
    ext: string,
  ): void {
    // MUST accept: supplying onNotify opts out of SIP.js's automatic 200 OK.
    notification.accept().catch((err) =>
      sipLogger.error('NOTIFY', 'Failed to 200 OK the REFER NOTIFY', err),
    );

    const body = notification.request.body ?? '';
    const status = this.parseSipFrag(body);
    const subscriptionState = notification.request.getHeader('Subscription-State') ?? '';

    sipLogger.info(
      'NOTIFY',
      `← NOTIFY (${type} REFER) ${status ? `${status.code} ${status.reason}` : body.trim()}`,
      { subscriptionState },
    );

    if (!status) return;

    // 1xx — target is still being contacted; keep showing progress.
    if (status.code < 200) {
      if (type === 'blind') this.setState({ phase: 'transferring' });
      return;
    }

    // 2xx — the target answered; Asterisk owns the customer now.
    if (status.code < 300) {
      sipLogger.info('TRANSFER', `Transfer to ${ext} completed`);
      this.sessionService.markTransferred(this.sessionService.getPrimaryCallId());
      this.setState({ phase: 'completed', error: null });
      return;
    }

    // 3xx-6xx — the transfer failed. Our leg is still up, so recover.
    const reason = this.describeFailure(status.code, ext);
    sipLogger.warn('TRANSFER', `Transfer to ${ext} failed: ${status.code} ${status.reason}`);

    if (type === 'attended') {
      void this.recoverFromFailedComplete(reason);
    } else {
      this.fail(reason);
    }
  }

  /** `SIP/2.0 200 OK` → { code: 200, reason: "OK" } */
  private parseSipFrag(body: string): SipFragStatus | null {
    const match = /SIP\/2\.0\s+(\d{3})\s*(.*)/i.exec(body);
    if (!match) return null;
    return { code: Number(match[1]), reason: (match[2] ?? '').trim() };
  }

  private describeFailure(code: number, ext: string): string {
    if (code === 486 || code === 600) return `${ext} band`;
    if (code === 408 || code === 480) return `${ext} javob bermadi`;
    if (code === 603) return `${ext} rad etdi`;
    if (code === 404) return `${ext} topilmadi`;
    return `Yo'naltirish muvaffaqiyatsiz (${code})`;
  }

  // ---------------------------------------------------------------------------
  // Failure paths
  // ---------------------------------------------------------------------------

  private fail(error: string): void {
    this.setState({ phase: 'failed', error });
  }

  /**
   * An attended transfer that fails after consultation leaves the customer on
   * hold and the target still connected. Drop the target and give the customer
   * back rather than leaving the operator with two half-broken calls.
   */
  private async recoverFromFailedComplete(error: string): Promise<void> {
    await this.sessionService.endConsultation(true).catch((err) =>
      sipLogger.error('TRANSFER', 'Recovery failed', err),
    );
    this.fail(error);
  }

  // ---------------------------------------------------------------------------
  // Guards
  // ---------------------------------------------------------------------------

  private assertEstablished(): Session {
    const session = this.sessionService.getPrimarySession();
    if (!session) throw new Error('[Transfer] No active session');
    if (session.state !== SessionState.Established) {
      throw new Error(`[Transfer] Session not established (state=${session.state})`);
    }
    return session;
  }

  private makeTargetURI(ext: string) {
    const uri = UserAgent.makeURI(`sip:${cleanTarget(ext)}@${this.domain}`);
    if (!uri) throw new Error(`[Transfer] Invalid extension: ${ext}`);
    return uri;
  }
}
