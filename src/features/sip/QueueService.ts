// =============================================================================
// Queue Service — policy for INVITEs arriving from a FreePBX queue
//
// Background on the "ringall rings sequentially" report
// ----------------------------------------------------
// Two independent things were breaking the ringall strategy:
//
//   1. Every browser registered as the same AOR because the extension came
//      from VITE_SIP_AOR in .env. One extension cannot be three queue members,
//      so Asterisk had nowhere to fork to. Fixed by resolving credentials per
//      user from /ip-telefon-operators (see SipProvider).
//
//   2. The client never sent a provisional response. Asterisk marks a queue
//      member as "ringing" when it sees 180/183 from that leg; with only the
//      automatic 100 Trying it has to fall back on the agent timeout, which
//      looks exactly like members ringing one after another. SessionService
//      now answers every INVITE with 180 Ringing.
//
// What is left for this service is the busy policy: when a second call arrives
// while the operator is already talking, answer it immediately so the queue can
// move on instead of burning the full 15 s agent timeout on a dead end.
// =============================================================================
import { sipLogger } from './LoggerService';

/** How to treat an INVITE that arrives while the operator is already busy */
export type BusyPolicy =
  /** Reply 486 Busy Here — the queue re-targets the next agent at once */
  | 'reject'
  /** Keep it parked as a second call (call waiting) */
  | 'wait';

export class QueueService {
  private busyPolicy: BusyPolicy = 'reject';

  /** Call-IDs seen while busy, kept for diagnostics */
  private rejectedWhileBusy: string[] = [];

  setBusyPolicy(policy: BusyPolicy): void {
    this.busyPolicy = policy;
    sipLogger.info('QUEUE', `Busy policy → ${policy}`);
  }

  getBusyPolicy(): BusyPolicy {
    return this.busyPolicy;
  }

  /** Decide what to do with an INVITE that arrived while a call is active */
  shouldRejectWhenBusy(): boolean {
    return this.busyPolicy === 'reject';
  }

  noteRejectedWhileBusy(callId: string): void {
    this.rejectedWhileBusy.push(callId);
    if (this.rejectedWhileBusy.length > 50) this.rejectedWhileBusy.shift();
    sipLogger.info(
      'QUEUE',
      `486 Busy Here → Call-ID=${callId} (${this.rejectedWhileBusy.length} this session)`,
    );
  }

  /** How many queue calls we turned away — useful for staffing decisions */
  get rejectedCount(): number {
    return this.rejectedWhileBusy.length;
  }

  reset(): void {
    this.rejectedWhileBusy = [];
  }
}
